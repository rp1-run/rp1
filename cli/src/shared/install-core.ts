/**
 * Shared installation logic for rp1 plugins.
 * Provides core functions used by both `rp1 init` and `rp1 install` commands.
 */

import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as RA from "fp-ts/lib/ReadonlyArray.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { installError, usageError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import {
	collectPlatformPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../assets/index.js";
import {
	getEnabledTools,
	getToolSupportLevel,
	isToolEnabled,
	type SupportedTool,
	type ToolsRegistry,
} from "../config/supported-tools.js";
import {
	type DetectedTool,
	detectTools,
	type ToolDetectionResult,
} from "../init/tool-detector.js";
import {
	type AntigravityActivePluginSyncResult,
	type AntigravityManifestRefreshResult,
	antigravityBundleScope,
	antigravityPackageDisplayRoot,
	installAntigravityBundleAssets,
	refreshAntigravityManifestAssets,
	syncAntigravityActivePlugins,
} from "../install/antigravity/index.js";
import { extractPlatformAssets } from "../install/asset-extractor.js";
import { installAllPlugins } from "../install/claudecode/installer.js";
import type { ClaudeCodeInstallResult } from "../install/claudecode/models.js";
import { runAllPrerequisiteChecks } from "../install/claudecode/prerequisites.js";
import {
	getDefaultCodexArtifactsDir,
	installCodex,
} from "../install/codex/index.js";
import type { CodexInstallResult } from "../install/codex/models.js";
import {
	executeInstall,
	type InstallArgs,
	type InstallOptions,
} from "../install/command.js";
import {
	getDefaultCopilotArtifactsDir,
	installCopilot,
} from "../install/copilot/index.js";
import type { CopilotInstallResult } from "../install/copilot/models.js";
import { writeVersionMarker } from "../install/version-marker.js";
import { getInstalledVersion } from "../lib/version.js";
import { writeHarnessSelection } from "../settings/harness-writer.js";
import { loadEnabledHarnesses } from "../settings/loader.js";

/**
 * Context for installation operations.
 * Provides shared configuration for all installation functions.
 */
export interface InstallContext {
	readonly logger: Logger;
	readonly isTTY: boolean;
	readonly dryRun: boolean;
	readonly skipPrompt: boolean;
	readonly homeDir?: string;
}

/**
 * Result of installing plugins to a single tool.
 */
export interface ToolInstallResult {
	readonly toolId: string;
	readonly toolName: string;
	readonly success: boolean;
	readonly skipped?: boolean;
	readonly restartRequired?: boolean;
	readonly pluginsInstalled: readonly string[];
	readonly details?: readonly string[];
	readonly warnings: readonly string[];
	readonly error?: CLIError;
}

/**
 * Result of installing plugins to all detected tools.
 */
export interface InstallAllResult {
	readonly installed: number;
	readonly results: readonly ToolInstallResult[];
	readonly detected: readonly DetectedTool[];
}

/**
 * Install rp1 plugins to Claude Code.
 * Runs prerequisite checks and installs both rp1-base and rp1-dev plugins.
 *
 * @param scope - Installation scope: "user", "project", or "local"
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with ClaudeCodeInstallResult on success or CLIError on failure
 */
export const installClaudeCodePlugins = (
	scope: "user" | "project" | "local",
	ctx: InstallContext,
): TE.TaskEither<CLIError, ClaudeCodeInstallResult> =>
	pipe(
		// Step 1: Run prerequisite checks
		runAllPrerequisiteChecks(),
		// Step 2: Install all plugins via Claude CLI
		TE.chain(() => installAllPlugins(scope, ctx.logger, ctx.dryRun, ctx.isTTY)),
	);

/**
 * Build args array for OpenCode installation from context.
 */
const buildOpenCodeArgs = (
	config: Partial<InstallArgs>,
	ctx: InstallContext,
): string[] => {
	const args: string[] = [];

	if (config.artifactsDir) {
		args.push("--artifacts-dir", config.artifactsDir);
	}

	if (ctx.dryRun) {
		args.push("--dry-run");
	}

	if (ctx.skipPrompt) {
		args.push("--yes");
	}

	return args;
};

/**
 * Install rp1 plugins to OpenCode.
 * Copies plugin artifacts to the OpenCode configuration directory.
 *
 * @param config - Optional configuration for artifacts directory, etc.
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with void on success or CLIError on failure
 */
/**
 * Result of installing OpenCode plugins.
 */
export interface OpenCodeInstallResult {
	readonly pluginsInstalled: readonly string[];
	readonly warnings: readonly string[];
}

export const installOpenCodePlugins = (
	config: Partial<InstallArgs>,
	ctx: InstallContext,
): TE.TaskEither<CLIError, OpenCodeInstallResult> => {
	const args = buildOpenCodeArgs(config, ctx);
	const options: InstallOptions = {
		isTTY: ctx.isTTY,
		skipPrompt: ctx.skipPrompt,
		homeDir: ctx.homeDir,
	};

	return pipe(
		executeInstall(args, ctx.logger, options),
		TE.map((): OpenCodeInstallResult => {
			// Derive installed plugins from bundled assets when available
			const assetsResult = getBundledAssets();
			if ("right" in assetsResult) {
				const platform = assetsResult.right.platforms.opencode;
				if (platform) {
					return {
						pluginsInstalled: collectPlatformPlugins(platform).map(
							(p) => p.name,
						),
						warnings: [],
					};
				}
			}
			// Fallback: report required plugins (optional plugins unknown without manifest)
			return {
				pluginsInstalled: ["rp1-base", "rp1-dev"],
				warnings: [],
			};
		}),
	);
};

/**
 * Install rp1 plugins to Codex CLI.
 * When running from a bundled binary, extracts Codex assets from the embedded
 * manifest to a temp staging directory before installing. When not bundled,
 * uses the existing dist/ or artifactsDir path (dev mode).
 * Writes a version marker after successful install.
 *
 * @param config - Optional configuration for artifacts directory, etc.
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with CodexInstallResult on success or CLIError on failure
 */
export const installCodexPlugins = (
	config: Partial<{ artifactsDir: string | null }>,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CodexInstallResult> => {
	if (config.artifactsDir == null && hasBundledAssets()) {
		return installCodexFromBundled(ctx);
	}

	const artifactsDir =
		config.artifactsDir ?? getDefaultCodexArtifactsDir() ?? "dist/codex";

	return pipe(
		installCodex(
			{
				artifactsDir,
				dryRun: ctx.dryRun,
				yes: ctx.skipPrompt,
			},
			ctx,
		),
		TE.chainFirst(() => writeVersionMarker("codex", getInstalledVersion())),
	);
};

/**
 * Install Codex plugins from bundled binary assets.
 * Extracts to a temp staging directory, installs from there, then cleans up.
 */
const installCodexFromBundled = (
	ctx: InstallContext,
): TE.TaskEither<CLIError, CodexInstallResult> => {
	const stagingDir = join(tmpdir(), `rp1-codex-extract-${Date.now()}`);

	const cleanupStaging = TE.tryCatch(
		() => rm(stagingDir, { recursive: true, force: true }),
		() => usageError("cleanup", "Failed to clean up staging directory"),
	);

	return pipe(
		extractPlatformAssets({
			platform: "codex",
			targetDir: stagingDir,
		}),
		TE.chain(() =>
			pipe(
				installCodex(
					{
						artifactsDir: stagingDir,
						dryRun: ctx.dryRun,
						yes: ctx.skipPrompt,
					},
					ctx,
				),
				TE.chainFirst(() => writeVersionMarker("codex", getInstalledVersion())),
				TE.chainFirst(() => cleanupStaging),
			),
		),
		TE.orElse((error) =>
			pipe(
				cleanupStaging,
				TE.chain(() => TE.left<CLIError, CodexInstallResult>(error)),
			),
		),
	);
};

/**
 * Install rp1 plugins to Copilot CLI.
 * When running from a bundled binary, extracts Copilot assets from the embedded
 * manifest to a temp staging directory before installing. When not bundled,
 * uses the existing dist/ or artifactsDir path (dev mode).
 * Writes a version marker after successful install.
 *
 * @param config - Optional configuration for artifacts directory, etc.
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with CopilotInstallResult on success or CLIError on failure
 */
export const installCopilotPlugins = (
	config: Partial<{ artifactsDir: string | null }>,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CopilotInstallResult> => {
	if (config.artifactsDir == null && hasBundledAssets()) {
		return installCopilotFromBundled(ctx);
	}

	const artifactsDir =
		config.artifactsDir ?? getDefaultCopilotArtifactsDir() ?? "dist/copilot";

	return pipe(
		installCopilot(
			{
				artifactsDir,
				dryRun: ctx.dryRun,
				yes: ctx.skipPrompt,
			},
			ctx,
		),
		TE.chainFirst(() => writeVersionMarker("copilot", getInstalledVersion())),
	);
};

/**
 * Install Copilot plugins from bundled binary assets.
 * Extracts to a temp staging directory, installs from there, then cleans up.
 */
const installCopilotFromBundled = (
	ctx: InstallContext,
): TE.TaskEither<CLIError, CopilotInstallResult> => {
	const stagingDir = join(tmpdir(), `rp1-copilot-extract-${Date.now()}`);

	const cleanupStaging = TE.tryCatch(
		() => rm(stagingDir, { recursive: true, force: true }),
		() => usageError("cleanup", "Failed to clean up staging directory"),
	);

	return pipe(
		extractPlatformAssets({
			platform: "copilot",
			targetDir: stagingDir,
		}),
		TE.chain(() =>
			pipe(
				installCopilot(
					{
						artifactsDir: stagingDir,
						dryRun: ctx.dryRun,
						yes: ctx.skipPrompt,
					},
					ctx,
				),
				TE.chainFirst(() =>
					writeVersionMarker("copilot", getInstalledVersion()),
				),
				TE.chainFirst(() => cleanupStaging),
			),
		),
		TE.orElse((error) =>
			pipe(
				cleanupStaging,
				TE.chain(() => TE.left<CLIError, CopilotInstallResult>(error)),
			),
		),
	);
};

/**
 * Install plugins for a single detected tool.
 * Routes to the appropriate installation function based on tool ID.
 * This function never fails - errors are captured in the result.
 *
 * @param tool - The detected tool to install plugins for
 * @param ctx - Installation context
 * @returns TaskEither with ToolInstallResult (never fails, errors in result)
 */
const installForTool = (
	tool: DetectedTool,
	ctx: InstallContext,
): TE.TaskEither<CLIError, ToolInstallResult> => {
	const baseResult: Omit<
		ToolInstallResult,
		"success" | "skipped" | "pluginsInstalled" | "warnings" | "error"
	> = {
		toolId: tool.tool.id,
		toolName: tool.tool.name,
	};

	if (getToolSupportLevel(tool.tool) !== "stable") {
		return TE.right({
			...baseResult,
			success: false,
			skipped: true,
			pluginsInstalled: [],
			warnings: [
				`${tool.tool.name} is ${getToolSupportLevel(
					tool.tool,
				)} and requires a targeted install path.`,
			],
		});
	}

	if (tool.tool.id === "claude-code") {
		return pipe(
			installClaudeCodePlugins("user", ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "opencode") {
		return pipe(
			installOpenCodePlugins({}, ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "codex") {
		return pipe(
			installCodexPlugins({}, ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: [],
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "copilot") {
		return pipe(
			installCopilotPlugins({}, ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "antigravity") {
		return pipe(
			installAntigravityBundleAssets({ dryRun: ctx.dryRun }),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: antigravityBundleScope(result),
					details: antigravityInstallDetails(ctx.dryRun, result),
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	// Unknown tool - return failure result
	return TE.right({
		...baseResult,
		success: false,
		pluginsInstalled: [],
		warnings: [`Automated installation not supported for ${tool.tool.name}`],
	});
};

type SpecificToolLookup =
	| { readonly tool: SupportedTool }
	| { readonly error: CLIError };

const lookupSpecificTool = (
	toolId: string,
	registry: ToolsRegistry,
): SpecificToolLookup => {
	const tool = registry.tools.find((t) => t.id === toolId);

	if (!tool) {
		const enabledIds = getEnabledTools(registry)
			.map((t) => `"${t.id}"`)
			.join(", ");
		return {
			error: installError(
				"invalid-tool",
				`Unknown tool: ${toolId}. Available tools: ${enabledIds}.`,
			),
		};
	}

	if (!isToolEnabled(registry, toolId)) {
		return {
			error: installError(
				"disabled-tool",
				`Tool "${toolId}" is currently disabled and cannot be installed.`,
			),
		};
	}

	return { tool };
};

const formatAssetDisplayList = (
	assets: readonly { readonly displayPath: string }[],
): string => assets.map((asset) => asset.displayPath).join(", ");

const antigravityInstallDetails = (
	dryRun: boolean,
	result: {
		readonly assetCount: number;
		readonly validation: {
			readonly status: string;
			readonly issue: string | null;
		};
		readonly versionMarkerWritten: boolean;
	},
): readonly string[] => [
	`Package assets: ${antigravityPackageDisplayRoot()}`,
	`Manifest assets: ${result.assetCount} files`,
	"Lifecycle stage: install",
	dryRun
		? "Lifecycle state: dry_run"
		: "Lifecycle state: current after successful install",
	`Plugin validation: ${result.validation.status}${
		result.validation.issue ? ` (${result.validation.issue})` : ""
	}`,
	`Version marker: ${result.versionMarkerWritten ? "current" : "not_written"}`,
	dryRun
		? "Next action: run `rp1 install antigravity`, restart Antigravity CLI, then run `rp1 verify antigravity`."
		: "Next action: restart Antigravity CLI, then run `rp1 verify antigravity` for manifest, version marker, MCP, and plugin validation status.",
];

const antigravityActiveRegistryDetail = (
	dryRun: boolean,
	sync: AntigravityActivePluginSyncResult | null,
): readonly string[] => {
	if (!sync) return [];
	if (!sync.driftDetected) return ["Active plugin registry: current"];
	if (dryRun) {
		return [
			"Would refresh Antigravity's active plugin registry via `agy plugin install`.",
		];
	}
	const status = sync.install?.status ?? "not_run";
	if (status === "passed") return ["Active plugin registry: refreshed"];
	if (status === "missing_binary") {
		return ["Active plugin registry: skipped (`agy` not found in PATH)"];
	}
	if (status === "failed") return ["Active plugin registry: refresh failed"];
	return ["Active plugin registry: not refreshed"];
};

const antigravityUpdateDetails = (
	result: AntigravityManifestRefreshResult,
	sync: AntigravityActivePluginSyncResult | null,
): readonly string[] => {
	if (result.initialStatus.state === "blocked") {
		return [
			"Lifecycle stage: update",
			"Lifecycle state: blocked",
			`Next action: ${result.initialStatus.userAction}`,
		];
	}

	const activeRegistry = antigravityActiveRegistryDetail(result.dryRun, sync);

	if (
		result.dryRun &&
		(result.refreshableAssets.length > 0 || sync?.driftDetected)
	) {
		return [
			"Lifecycle stage: update",
			`Lifecycle state: ${result.initialStatus.state}`,
			...(result.refreshableAssets.length > 0
				? [`Would refresh: ${formatAssetDisplayList(result.refreshableAssets)}`]
				: []),
			...activeRegistry,
			"Next action: Run `rp1 update plugins antigravity -y` to refresh, then restart Antigravity CLI and run `rp1 verify antigravity`.",
		];
	}

	if (
		result.refreshedAssets.length > 0 ||
		result.versionMarkerWritten ||
		sync?.install?.status === "passed"
	) {
		return [
			"Lifecycle stage: update",
			"Lifecycle result: refreshed",
			...(result.refreshedAssets.length > 0
				? [`Refreshed: ${formatAssetDisplayList(result.refreshedAssets)}`]
				: []),
			`Version marker: ${
				result.versionMarkerWritten ? "current" : "unchanged"
			}`,
			...activeRegistry,
			"Next action: Restart Antigravity CLI, then run `rp1 verify antigravity`.",
		];
	}

	return [
		"Lifecycle stage: update",
		"Lifecycle state: current",
		`Version marker: ${result.finalStatus.versionMarker.freshness}`,
		...activeRegistry,
		`Next action: ${result.finalStatus.userAction}`,
	];
};

const failedAntigravityUpdateResult = (
	tool: SupportedTool,
	error: CLIError,
): ToolInstallResult => ({
	toolId: tool.id,
	toolName: tool.name,
	success: false,
	restartRequired: false,
	pluginsInstalled: [],
	details: [
		"Lifecycle stage: update",
		"Lifecycle state: failed",
		`Next action: Check file permissions under ${antigravityPackageDisplayRoot()}, then rerun \`rp1 update plugins antigravity\`.`,
	],
	warnings: [],
	error,
});

export const updateForSpecificTool = (
	toolId: string,
	registry: ToolsRegistry,
	ctx: InstallContext,
): TE.TaskEither<CLIError, ToolInstallResult> => {
	const lookup = lookupSpecificTool(toolId, registry);
	if ("error" in lookup) return TE.left(lookup.error);

	if (lookup.tool.id === "antigravity") {
		return pipe(
			refreshAntigravityManifestAssets({ dryRun: ctx.dryRun }),
			TE.chain((result) =>
				TE.tryCatch(
					async () => ({
						result,
						sync:
							result.initialStatus.state === "blocked"
								? null
								: await syncAntigravityActivePlugins({ dryRun: ctx.dryRun }),
					}),
					(error) =>
						installError(
							"antigravity-active-plugin-refresh",
							error instanceof Error
								? error.message
								: "Failed to refresh Antigravity's active plugin registry.",
						),
				),
			),
			TE.map(({ result, sync }): ToolInstallResult => {
				const blocked = result.initialStatus.state === "blocked";
				const activeInstallStatus = sync?.install?.status ?? null;
				const toolResult = {
					toolId: lookup.tool.id,
					toolName: lookup.tool.name,
					success: !blocked && activeInstallStatus !== "failed",
					restartRequired:
						!ctx.dryRun &&
						!blocked &&
						(result.refreshedAssets.length > 0 ||
							result.versionMarkerWritten ||
							activeInstallStatus === "passed"),
					pluginsInstalled: [],
					details: antigravityUpdateDetails(result, sync),
					warnings:
						activeInstallStatus === "missing_binary"
							? [
									"Antigravity active plugin refresh was skipped because `agy` was not found in PATH.",
								]
							: [],
				};

				if (blocked) {
					return {
						...toolResult,
						error: installError(
							"antigravity-lifecycle-update",
							result.initialStatus.issue ??
								"Antigravity lifecycle update blocked.",
						),
					};
				}

				if (activeInstallStatus === "failed") {
					return {
						...toolResult,
						error: installError(
							"antigravity-active-plugin-refresh",
							sync?.install?.issue ??
								"Antigravity active plugin refresh failed.",
						),
					};
				}

				return toolResult;
			}),
			TE.orElse((error) =>
				TE.right<CLIError, ToolInstallResult>(
					failedAntigravityUpdateResult(lookup.tool, error),
				),
			),
		);
	}

	return installForSpecificTool(toolId, registry, ctx);
};

/**
 * Detect tools and validate at least one is present.
 * Wraps detectTools to convert from never-failing to CLIError-failing.
 */
const detectToolsWithValidation = (
	registry: ToolsRegistry,
): TE.TaskEither<CLIError, ToolDetectionResult> =>
	TE.tryCatch(
		async () => {
			const result = await detectTools(registry)();
			// detectTools never fails, so result is always Right
			if ("right" in result) {
				const detection = result.right;
				if (detection.detected.length === 0) {
					throw new Error(
						"No supported agentic tools detected. Install a supported tool first.",
					);
				}
				return detection;
			}
			// This should never happen since detectTools returns TaskEither<never, ...>
			throw new Error("Unexpected detection failure");
		},
		(err) =>
			installError(
				"tool-detection",
				err instanceof Error ? err.message : "Unknown detection error",
			),
	);

/**
 * Install plugins for all detected agentic tools.
 * Detects installed tools (Claude Code, OpenCode, etc.) and installs
 * rp1 plugins for each one.
 *
 * @param registry - The tools registry to detect against
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with InstallAllResult containing results for each tool
 */
export const installAllDetectedTools = (
	registry: ToolsRegistry,
	ctx: InstallContext,
): TE.TaskEither<CLIError, InstallAllResult> =>
	pipe(
		// Step 1: Detect installed tools with validation
		detectToolsWithValidation(registry),
		// Step 2: Install for each detected tool sequentially
		TE.chain((detection) =>
			pipe(
				detection.detected,
				RA.traverse(TE.ApplicativeSeq)((tool) => installForTool(tool, ctx)),
				TE.map(
					(results): InstallAllResult => ({
						installed: results.filter((r) => r.success).length,
						results,
						detected: detection.detected,
					}),
				),
			),
		),
	);

/**
 * Install plugins for a specific tool by ID.
 * Useful for `rp1 install <tool>` commands.
 *
 * @param toolId - The tool ID ("claude-code", "opencode", "codex", or "copilot")
 * @param registry - The tools registry to get tool metadata
 * @param ctx - Installation context
 * @returns TaskEither with ToolInstallResult
 */
export const installForSpecificTool = (
	toolId: string,
	registry: ToolsRegistry,
	ctx: InstallContext,
): TE.TaskEither<CLIError, ToolInstallResult> => {
	const lookup = lookupSpecificTool(toolId, registry);
	if ("error" in lookup) return TE.left(lookup.error);

	const { tool } = lookup;

	if (tool.id === "antigravity") {
		return pipe(
			installAntigravityBundleAssets({ dryRun: ctx.dryRun }),
			TE.map(
				(result): ToolInstallResult => ({
					toolId: tool.id,
					toolName: tool.name,
					success: true,
					pluginsInstalled: antigravityBundleScope(result),
					details: antigravityInstallDetails(ctx.dryRun, result),
					warnings: result.warnings,
				}),
			),
			TE.chainFirst((result) => {
				if (result.success && !ctx.dryRun) {
					syncHarnessSelectionAdd(toolId);
				}
				return TE.right(undefined);
			}),
		);
	}

	// Create a synthetic DetectedTool for the installation
	const detectedTool: DetectedTool = {
		tool,
		version: "unknown",
		meetsMinVersion: true,
	};

	return pipe(
		installForTool(detectedTool, ctx),
		TE.chain((result) => {
			if (!result.success && result.error) {
				return TE.left(result.error);
			}
			return TE.right(result);
		}),
		TE.chainFirst((result) => {
			if (result.success && !ctx.dryRun) {
				syncHarnessSelectionAdd(toolId);
			}
			return TE.right(undefined);
		}),
	);
};

/**
 * Sync harness selection after install: add the tool ID to [harnesses] enabled.
 * If no [harnesses] section exists yet, creates one with just this tool.
 * No-op when the tool is already in the enabled list.
 *
 * @param toolId - Harness ID to add
 * @param globalSettingsPath - Override for test isolation
 */
export const syncHarnessSelectionAdd = (
	toolId: string,
	globalSettingsPath?: string,
): void => {
	const enabled = loadEnabledHarnesses(globalSettingsPath);
	if (enabled === undefined) {
		writeHarnessSelection([toolId], globalSettingsPath);
		return;
	}
	if (!enabled.includes(toolId)) {
		writeHarnessSelection([...enabled, toolId], globalSettingsPath);
	}
};

/**
 * Sync harness selection after uninstall: remove the tool ID from [harnesses] enabled.
 * No-op when no [harnesses] section exists or the tool is not in the list.
 *
 * @param toolId - Harness ID to remove
 * @param globalSettingsPath - Override for test isolation
 */
export const syncHarnessSelectionRemove = (
	toolId: string,
	globalSettingsPath?: string,
): void => {
	const enabled = loadEnabledHarnesses(globalSettingsPath);
	if (enabled === undefined) return;
	const updated = enabled.filter((id) => id !== toolId);
	if (updated.length !== enabled.length) {
		writeHarnessSelection(updated, globalSettingsPath);
	}
};

/**
 * Filter detected tools to only those the user has selected (persisted in settings.toml).
 *
 * When no `[harnesses] enabled` selection exists, falls back to all detected tools
 * with stable support level -- preserving backward compatibility for pre-wizard users.
 *
 * When a selection exists, returns the intersection of detected tools and the
 * enabled list (preserving detected-tools ordering). Explicitly selected experimental
 * tools are included.
 *
 * @param detection - Result from detectTools()
 * @param globalSettingsPath - Override for test isolation
 * @returns Filtered array of DetectedTool entries
 */
export const getEffectiveHarnesses = (
	detection: ToolDetectionResult,
	globalSettingsPath?: string,
): readonly DetectedTool[] => {
	const enabled = loadEnabledHarnesses(globalSettingsPath);

	if (enabled === undefined) {
		return detection.detected.filter(
			(d) => getToolSupportLevel(d.tool) === "stable",
		);
	}

	const enabledSet = new Set(enabled);
	return detection.detected.filter((d) => enabledSet.has(d.tool.id));
};
