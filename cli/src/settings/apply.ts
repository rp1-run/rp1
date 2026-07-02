/**
 * Apply orchestrator for user-controlled model tier remapping.
 *
 * Orchestrates: load config -> validate -> discover agents -> rewrite -> report.
 * The core rewriting logic (`applyRemappingsToAgents`) is separated from
 * manifest/filesystem discovery for testability -- tests provide agent entries
 * and temp file paths directly.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { BundledAssets } from "../assets/reader.js";
import { ALL_PLUGIN_KEYS, getBundledAssets } from "../assets/reader.js";
import type {
	BundleAgentEntry,
	EffortLevel,
	ModelTier,
} from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";
import { DEFAULT_MARKETPLACE_DIR } from "../install/claudecode/marketplace.js";
import { loadTierRemappings } from "./loader.js";
import type { PlatformTierMap, TierRemappingConfig } from "./models.js";
import { getPreset } from "./presets.js";
import {
	type EffortAdjustment,
	type ProtectedWarning,
	rewriteAgentArtifact,
} from "./rewriter.js";
import { validateTierRemappings } from "./validator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Agent with metadata and resolved filesystem path for rewriting. */
export interface AgentFileEntry {
	readonly name: string;
	readonly filePath: string;
	readonly tier?: ModelTier;
	readonly effort?: EffortLevel;
	readonly platform: BuildPlatform;
}

/** Options for the apply operation. */
export interface ApplyOptions {
	readonly projectRoot: string;
	readonly preset?: string;
	readonly dryRun: boolean;
}

/** Result of applying tier remappings. */
export interface ApplyResult {
	readonly applied: boolean;
	readonly agentsModified: number;
	readonly effortAdjustments: readonly EffortAdjustment[];
	readonly protectedWarnings: readonly ProtectedWarning[];
	readonly warnings: readonly string[];
	readonly dryRun: boolean;
}

/** Filesystem and external command dependencies for testability. */
export interface ApplyDeps {
	readonly readFile: (path: string) => string;
	readonly writeFile: (path: string, content: string) => void;
	readonly fileExists: (path: string) => boolean;
	readonly refreshClaudeCodePlugins: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Default production dependencies
// ---------------------------------------------------------------------------

async function defaultRefreshClaudeCodePlugins(): Promise<void> {
	const { exec } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execAsync = promisify(exec);

	const plugins = ["rp1-base", "rp1-dev", "rp1-utils"];
	for (const plugin of plugins) {
		try {
			await execAsync(
				`claude plugin update "${plugin}@rp1-local" --scope user`,
				{ timeout: 15000 },
			);
		} catch {
			// Best effort -- some plugins might not be installed
		}
	}
}

const DEFAULT_DEPS: ApplyDeps = {
	readFile: (path) => readFileSync(path, "utf-8"),
	writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
	fileExists: existsSync,
	refreshClaudeCodePlugins: defaultRefreshClaudeCodePlugins,
};

// ---------------------------------------------------------------------------
// Agent filename derivation (matches asset-extractor logic)
// ---------------------------------------------------------------------------

/**
 * Derive the installed filename for an agent on a given platform.
 * Replicates the filename derivation from the asset extractor so the apply
 * command can locate installed artifacts without re-extracting.
 */
function deriveInstalledFilename(
	agent: BundleAgentEntry,
	pluginName: string,
	platform: BuildPlatform,
): string {
	if (agent.fileName) return agent.fileName;
	if (agent.path && agent.path.length > 0) return basename(agent.path);
	return platform === "codex"
		? `${pluginName}-${agent.name}.toml`
		: `${agent.name}.md`;
}

// ---------------------------------------------------------------------------
// Agent discovery from manifest
// ---------------------------------------------------------------------------

/**
 * Build a list of agent file entries from the bundled manifest for a platform.
 * Resolves each agent's installed file path and filters to files that exist.
 */
export function discoverAgents(
	assets: BundledAssets,
	platform: BuildPlatform,
	claudeCodeMarketplaceDir: string,
	codexAgentsDir: string | null,
	fileExists: (path: string) => boolean,
): readonly AgentFileEntry[] {
	const bundledPlatform = assets.platforms[platform];
	if (!bundledPlatform) return [];

	const entries: AgentFileEntry[] = [];

	for (const pluginKey of ALL_PLUGIN_KEYS) {
		const plugin = bundledPlatform.plugins[pluginKey];
		if (!plugin) continue;

		for (const agent of plugin.agents) {
			const bundleAgent = agent as BundleAgentEntry;
			const filename = deriveInstalledFilename(
				bundleAgent,
				plugin.name,
				platform,
			);

			let filePath: string | null = null;
			if (platform === "claude-code") {
				filePath = join(
					claudeCodeMarketplaceDir,
					pluginKey,
					"agents",
					filename,
				);
			} else if (platform === "codex" && codexAgentsDir) {
				filePath = join(codexAgentsDir, filename);
			}

			if (!filePath || !fileExists(filePath)) continue;

			entries.push({
				name: bundleAgent.name,
				filePath,
				tier: bundleAgent.tier,
				effort: bundleAgent.effort,
				platform,
			});
		}
	}

	return entries;
}

// ---------------------------------------------------------------------------
// Core rewriting loop
// ---------------------------------------------------------------------------

/**
 * Apply tier remappings to a list of agent files.
 * Reads each agent artifact, rewrites model/effort fields, writes the result.
 * Unparseable artifacts produce a warning and are skipped.
 */
export function applyRemappingsToAgents(
	agents: readonly AgentFileEntry[],
	remappings: Readonly<Partial<Record<BuildPlatform, PlatformTierMap>>>,
	dryRun: boolean,
	deps: ApplyDeps,
): ApplyResult {
	let agentsModified = 0;
	const effortAdjustments: EffortAdjustment[] = [];
	const protectedWarnings: ProtectedWarning[] = [];
	const warnings: string[] = [];

	for (const agent of agents) {
		const platformMap = remappings[agent.platform];
		if (!platformMap) continue;

		if (!agent.tier || agent.tier === "inherit") continue;

		const remappedTier = agent.tier as Exclude<ModelTier, "inherit">;
		const newModel = platformMap[remappedTier];
		if (!newModel) continue;

		let content: string;
		try {
			content = deps.readFile(agent.filePath);
		} catch (e) {
			warnings.push(
				`Could not read agent artifact '${agent.name}' at ${agent.filePath}: ${e instanceof Error ? e.message : String(e)}`,
			);
			continue;
		}

		const result = rewriteAgentArtifact({
			content,
			agentName: agent.name,
			newModel,
			originalTier: agent.tier,
			originalEffort: agent.effort,
			platform: agent.platform,
		});

		if (!result.modified) continue;

		if (!dryRun) {
			try {
				deps.writeFile(agent.filePath, result.content);
			} catch (e) {
				warnings.push(
					`Could not write agent artifact '${agent.name}' at ${agent.filePath}: ${e instanceof Error ? e.message : String(e)}`,
				);
				continue;
			}
		}

		agentsModified++;

		if (result.effortAdjustment) {
			effortAdjustments.push(result.effortAdjustment);
		}
		if (result.protectedWarning) {
			protectedWarnings.push(result.protectedWarning);
		}
	}

	return {
		applied: agentsModified > 0,
		agentsModified,
		effortAdjustments,
		protectedWarnings,
		warnings,
		dryRun,
	};
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Resolve tier remapping config from settings.toml and/or a --preset flag.
 *
 * When a preset is specified via CLI flag, it replaces custom mappings entirely.
 * When the preset comes from settings.toml, per-platform overrides in the same
 * file are merged on top of preset values (per merge semantics from T2).
 */
export async function resolveConfig(
	projectRoot: string,
	preset?: string,
): Promise<{ config: TierRemappingConfig; errors: string[] }> {
	const errors: string[] = [];
	const settingsConfig = await loadTierRemappings(projectRoot);

	const effectivePreset = preset ?? settingsConfig.preset;

	if (effectivePreset) {
		const presetConfig = getPreset(effectivePreset);
		if (!presetConfig) {
			errors.push(
				`Unknown preset '${effectivePreset}'. Run 'rp1 settings presets' to list available presets.`,
			);
			return { config: settingsConfig, errors };
		}

		const platforms: Record<string, PlatformTierMap> = {};

		for (const [platform, tierMap] of Object.entries(presetConfig.platforms)) {
			platforms[platform] = { ...tierMap };
		}

		// When preset comes from settings.toml (not CLI), merge per-platform
		// overrides from settings on top of preset values
		if (!preset) {
			for (const [platform, tierMap] of Object.entries(
				settingsConfig.platforms,
			)) {
				if (tierMap) {
					platforms[platform] = { ...(platforms[platform] ?? {}), ...tierMap };
				}
			}
		}

		return {
			config: { preset: effectivePreset, platforms },
			errors,
		};
	}

	return { config: settingsConfig, errors };
}

// ---------------------------------------------------------------------------
// Full orchestrator
// ---------------------------------------------------------------------------

/**
 * Full apply orchestrator: load -> validate -> discover -> rewrite -> report.
 *
 * Called by the `rp1 settings apply` command and (indirectly) by the update hook.
 */
export async function applyTierRemappings(
	options: ApplyOptions,
	deps: ApplyDeps = DEFAULT_DEPS,
): Promise<ApplyResult> {
	const emptyResult: ApplyResult = {
		applied: false,
		agentsModified: 0,
		effortAdjustments: [],
		protectedWarnings: [],
		warnings: [],
		dryRun: options.dryRun,
	};

	// 1. Resolve config
	const { config, errors: configErrors } = await resolveConfig(
		options.projectRoot,
		options.preset,
	);

	if (configErrors.length > 0) {
		return { ...emptyResult, warnings: configErrors };
	}

	const hasRemappings = Object.keys(config.platforms).length > 0;
	if (!hasRemappings) {
		return emptyResult;
	}

	// 2. Validate
	const validation = validateTierRemappings(config);
	if (!validation.valid) {
		return {
			...emptyResult,
			warnings: [...validation.errors, ...validation.warnings],
		};
	}

	// 3. Get embedded manifest for agent tier metadata
	const manifestResult = getBundledAssets();
	if (E.isLeft(manifestResult)) {
		return {
			...emptyResult,
			warnings: [
				"Bundled assets not available. Tier remapping requires a bundled binary. " +
					"Install from a release binary to use this feature.",
			],
		};
	}

	const assets = manifestResult.right;

	// 4. Discover agents per platform with remappings
	const allAgents: AgentFileEntry[] = [];
	const codexAgentsDir = resolveCodexAgentsDir();

	for (const platform of Object.keys(config.platforms) as BuildPlatform[]) {
		const platformAgents = discoverAgents(
			assets,
			platform,
			DEFAULT_MARKETPLACE_DIR,
			codexAgentsDir,
			deps.fileExists,
		);
		allAgents.push(...platformAgents);
	}

	// 5. Apply remappings
	const result = applyRemappingsToAgents(
		allAgents,
		config.platforms,
		options.dryRun,
		deps,
	);

	// 6. Post-apply: refresh Claude Code plugin cache if we modified CC artifacts
	const claudeCodeModified =
		!options.dryRun &&
		result.agentsModified > 0 &&
		config.platforms["claude-code"] !== undefined;

	const refreshWarnings: string[] = [];
	if (claudeCodeModified) {
		try {
			await deps.refreshClaudeCodePlugins();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			refreshWarnings.push(
				`Claude Code plugin cache refresh failed: ${message}`,
			);
		}
	}

	// Combine validation warnings with apply warnings
	const allWarnings = [
		...validation.warnings,
		...result.warnings,
		...refreshWarnings,
	];

	return {
		applied: result.applied,
		agentsModified: result.agentsModified,
		effortAdjustments: result.effortAdjustments,
		protectedWarnings: result.protectedWarnings,
		warnings: allWarnings,
		dryRun: options.dryRun,
	};
}

// ---------------------------------------------------------------------------
// Update hook convenience
// ---------------------------------------------------------------------------

/**
 * Apply tier remappings only if configured. No-op when no [models] config exists.
 * Designed for the update hook (T7) -- returns early with no output when unconfigured.
 */
export async function applyTierRemappingsIfConfigured(
	projectRoot: string,
): Promise<{ applied: boolean; agentsModified: number }> {
	const settingsConfig = await loadTierRemappings(projectRoot);
	const hasConfig =
		settingsConfig.preset !== undefined ||
		Object.keys(settingsConfig.platforms).length > 0;

	if (!hasConfig) {
		return { applied: false, agentsModified: 0 };
	}

	const result = await applyTierRemappings({
		projectRoot,
		dryRun: false,
	});

	return {
		applied: result.applied,
		agentsModified: result.agentsModified,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the Codex agents install directory without importing the installer module. */
function resolveCodexAgentsDir(): string | null {
	const home = process.env.HOME;
	if (!home) return null;
	return join(home, ".codex", "agents", "rp1");
}
