/**
 * Platform definition configuration for the data-driven build pipeline.
 *
 * Each PlatformDefinition captures all platform-varying behavior: registry,
 * templates, naming conventions, lifecycle hooks, and asset embedding flags.
 * Adding a new platform requires creating a new entry here plus a registry
 * and template directory -- no changes to the generic build loop.
 */

import type { SupportedTool } from "../config/supported-tools.js";
import type {
	ClaudeCodeAgent,
	ClaudeCodeSkill,
	PlatformRegistry,
} from "./models.js";
import type { BuildPlatform } from "./template-context.js";
import type { TemplateEngine } from "./template-engine.js";

// ---------------------------------------------------------------------------
// Platform naming conventions
// ---------------------------------------------------------------------------

/**
 * Platform-varying naming conventions for build output.
 */
export interface PlatformNaming {
	/** Prefix for skill directory names. "" for claude-code, "rp1-" for others. */
	readonly skillDirPrefix: string;
	/** Pattern for agent output filenames. Receives pluginName and agentName. */
	readonly agentFileName: (pluginName: string, agentName: string) => string;
	/** File extension for agent artifacts. ".md" or ".toml". */
	readonly agentExtension: string;
}

// ---------------------------------------------------------------------------
// Platform templates
// ---------------------------------------------------------------------------

/**
 * Template paths for each artifact type, relative to templates/ root.
 */
export interface PlatformTemplates {
	readonly skill: string;
	readonly agent: string;
	readonly manifest: string;
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

/**
 * Opaque state bag populated by preparePlugin() and threaded
 * through subsequent hooks. Each platform defines its own shape.
 */
export type PlatformBuildState = Record<string, unknown>;

/**
 * Result from postPluginBuild hook, allowing hooks to report errors.
 */
export interface PostBuildResult {
	readonly errors: string[];
	readonly warnings: string[];
	/** Additional files to include in the bundle manifest as verbatim entries. */
	readonly verbatimFiles?: readonly { name: string; path: string }[];
}

/**
 * Context passed to lifecycle hooks, providing access to build
 * infrastructure (engine, registry, versions) so hooks can render
 * templates and build contexts without duplicating setup logic.
 */
export interface HookContext {
	readonly projectRoot: string;
	readonly pluginName: string;
	readonly pluginDir: string;
	readonly outputDir: string;
	readonly engine: TemplateEngine;
	readonly registry: PlatformRegistry;
	readonly platformConfig: SupportedTool;
	readonly pluginVersion: string;
	readonly cliVersion: string;
	readonly platform: BuildPlatform;
	readonly jsonOutput: boolean;
}

/**
 * Optional lifecycle hooks for platform-specific build behavior.
 * Each hook receives the accumulated build state and can inject
 * platform-specific steps into the generic build loop.
 */
export interface PlatformHooks {
	/**
	 * Called once per plugin before building any artifacts.
	 * Use to initialize platform-specific state (e.g., discover skill maps).
	 */
	readonly preparePlugin?: (ctx: HookContext) => Promise<PlatformBuildState>;

	/**
	 * Called to enrich the template context for each agent before rendering.
	 * Use to add platform-specific context fields (e.g., roleType for Codex).
	 */
	readonly enrichAgentContext?: (
		ctx: Record<string, unknown>,
		agent: ClaudeCodeAgent,
		state: PlatformBuildState,
	) => Record<string, unknown>;

	/**
	 * Called to enrich the template context for each skill before rendering.
	 * Use to add platform-specific context fields (e.g., skillMap for Codex).
	 */
	readonly enrichSkillContext?: (
		ctx: Record<string, unknown>,
		state: PlatformBuildState,
	) => Record<string, unknown>;

	/**
	 * Called after each skill is written to disk.
	 * Use for per-skill extras (e.g., Codex openai.yaml generation).
	 */
	readonly postSkillWrite?: (
		skillDir: string,
		skill: ClaudeCodeSkill,
		state: PlatformBuildState,
		hookCtx: HookContext,
	) => Promise<void>;

	/**
	 * Called after all agents are built for a plugin.
	 * Use for aggregate operations (e.g., Codex sub-agent validation,
	 * rp1-agents.toml generation, AGENTS.md generation, CC .claude-plugin copy).
	 */
	readonly postPluginBuild?: (
		outputDir: string,
		state: PlatformBuildState,
		hookCtx: HookContext,
	) => Promise<PostBuildResult>;
}

// ---------------------------------------------------------------------------
// PlatformDefinition
// ---------------------------------------------------------------------------

/**
 * Complete platform configuration. Adding a new platform requires
 * creating one of these entries plus a registry and templates.
 */
export interface PlatformDefinition {
	readonly id: BuildPlatform;
	readonly registry: PlatformRegistry;
	readonly config: SupportedTool;
	readonly templates: PlatformTemplates;
	readonly naming: PlatformNaming;
	readonly hooks?: PlatformHooks;
	/** Directories to copy verbatim from plugin source to output (e.g., [".claude-plugin", "hooks"]). */
	readonly copyDirs?: readonly string[];
	/** Whether this platform generates bundle-manifest data for asset embedding. */
	readonly producesBundleAssets: boolean;
}

// ---------------------------------------------------------------------------
// Platform configs (stub defaults for build scripts)
// ---------------------------------------------------------------------------

const platformConfigs: Record<BuildPlatform, SupportedTool> = {
	opencode: {
		id: "opencode",
		name: "OpenCode",
		enabled: true,
		binary: "opencode",
		min_version: "0.8.0",
		instruction_file: "AGENTS.md",
		install_url: "https://opencode.ai/docs/installation",
		plugin_install_cmd: null,
		capabilities: ["plugins", "slash-commands", "agents"],
	},
	codex: {
		id: "codex",
		name: "Codex CLI",
		enabled: true,
		binary: "codex",
		min_version: "0.116.0",
		instruction_file: "AGENTS.md",
		install_url: "https://github.com/openai/codex",
		plugin_install_cmd: null,
		capabilities: ["skills", "agents"],
	},
	"claude-code": {
		id: "claude-code",
		name: "Claude Code",
		enabled: true,
		binary: "claude",
		min_version: "1.0.33",
		instruction_file: "CLAUDE.md",
		install_url:
			"https://docs.anthropic.com/en/docs/claude-code/getting-started",
		plugin_install_cmd: "claude plugin install {plugin}",
		capabilities: ["plugins", "slash-commands", "agents", "skills"],
	},
};

// ---------------------------------------------------------------------------
// Imports for registries and platform-specific modules
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { claudeCodeRegistry } from "./claude-code/registry.js";
import { codexRegistry } from "./codex/registry.js";
import { mapAgentToRoleType } from "./codex/role-mapper.js";
import { discoverSkillMap } from "./codex/skill-map.js";
import { validateSubAgents } from "./codex/sub-agent-validator.js";
import { validateCodexToml } from "./codex/validator.js";
import { defaultRegistry } from "./registry.js";
import { transformNamespace } from "./tags/index.js";
import { buildTemplateContext } from "./template-context.js";

// ---------------------------------------------------------------------------
// Codex hook implementations
// ---------------------------------------------------------------------------

const codexPreparePlugin = async (
	ctx: HookContext,
): Promise<PlatformBuildState> => {
	const skillMap = discoverSkillMap(ctx.projectRoot);
	return {
		skillMap,
		parsedSkills: [] as ClaudeCodeSkill[],
		codexAgents: [] as Array<{
			name: string;
			description: string;
			roleType: string;
		}>,
	};
};

const codexEnrichSkillContext = (
	ctx: Record<string, unknown>,
	state: PlatformBuildState,
): Record<string, unknown> => ({
	...ctx,
	skillMap: state.skillMap,
});

const codexEnrichAgentContext = (
	ctx: Record<string, unknown>,
	agent: ClaudeCodeAgent,
	state: PlatformBuildState,
): Record<string, unknown> => {
	const roleTypeValue = mapAgentToRoleType(agent.name, agent.description);
	return {
		...ctx,
		skillMap: state.skillMap,
		artifact: {
			...(ctx.artifact as Record<string, unknown>),
			roleType: roleTypeValue,
		},
	};
};

const codexPostSkillWrite = async (
	skillDir: string,
	skill: ClaudeCodeSkill,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<void> => {
	(state.parsedSkills as ClaudeCodeSkill[]).push(skill);

	const agentsSubDir = join(skillDir, "agents");
	await mkdir(agentsSubDir, { recursive: true });

	const namespacedSkillDir = `rp1-${skill.name}`;
	const openaiYamlCtx = buildTemplateContext(
		hookCtx.platform,
		hookCtx.pluginName,
		hookCtx.pluginVersion,
		{
			type: "skill" as const,
			name: skill.name,
			namespacedName: namespacedSkillDir,
			description: skill.description,
			content: skill.content,
			supportingFiles: skill.supportingFiles,
		},
		hookCtx.registry,
		hookCtx.cliVersion,
		hookCtx.platformConfig,
	);

	const yamlResult = await hookCtx.engine.render(
		"codex/openai-yaml",
		openaiYamlCtx,
	);
	if (E.isRight(yamlResult)) {
		await writeFile(join(agentsSubDir, "openai.yaml"), yamlResult.right);
	}
};

const codexPostPluginBuild = async (
	outputDir: string,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const errors: string[] = [];
	const warnings: string[] = [];

	const parsedSkills = state.parsedSkills as ClaudeCodeSkill[];
	const subAgentValidation = validateSubAgents(
		hookCtx.projectRoot,
		parsedSkills,
	);
	errors.push(...subAgentValidation.errors);
	if (!hookCtx.jsonOutput) {
		for (const warning of subAgentValidation.warnings) {
			console.warn(`[sub-agent] ${warning}`);
		}
		for (const info of subAgentValidation.info) {
			console.info(`[sub-agent] ${info}`);
		}
	}

	const codexAgents = state.codexAgents as Array<{
		name: string;
		description: string;
		roleType: string;
	}>;

	if (codexAgents.length > 0) {
		const agentConfigCtx = {
			platform: hookCtx.platform,
			pluginName: hookCtx.pluginName,
			artifact: { agents: codexAgents },
			registry: hookCtx.registry,
		};
		const configResult = await hookCtx.engine.render(
			"codex/agent-config",
			agentConfigCtx,
		);
		if (E.isRight(configResult)) {
			const tomlValidation = validateCodexToml(
				configResult.right,
				`${hookCtx.pluginName}/rp1-agents.toml`,
			);
			if (E.isLeft(tomlValidation)) {
				const { formatError } = await import("../../shared/errors.js");
				errors.push(formatError(tomlValidation.left, false));
			} else {
				await writeFile(join(outputDir, "rp1-agents.toml"), configResult.right);
			}
		} else {
			const { formatError } = await import("../../shared/errors.js");
			errors.push(formatError(configResult.left, false));
		}

		const agentsMdCtx = {
			platform: hookCtx.platform,
			pluginName: hookCtx.pluginName,
			artifact: { agents: codexAgents },
			registry: hookCtx.registry,
		};
		const agentsMdResult = await hookCtx.engine.render(
			"codex/agents-md",
			agentsMdCtx,
		);
		if (E.isRight(agentsMdResult)) {
			await writeFile(join(outputDir, "AGENTS.md"), agentsMdResult.right);
		}
	}

	// Copy codex-hooks.json if present in the plugin source
	const verbatimFiles: { name: string; path: string }[] = [];
	try {
		const hooksSource = join(
			hookCtx.projectRoot,
			"plugins",
			hookCtx.pluginName,
			"hooks",
			"codex-hooks.json",
		);
		const hooksContent = await readFile(hooksSource, "utf-8");
		// Validate JSON before copying
		JSON.parse(hooksContent);
		await writeFile(join(outputDir, "codex-hooks.json"), hooksContent);
		verbatimFiles.push({
			name: "codex-hooks.json",
			path: "codex-hooks.json",
		});
	} catch {
		// No codex-hooks.json for this plugin — that's fine
	}

	return { errors, warnings, verbatimFiles };
};

// ---------------------------------------------------------------------------
// OpenCode hook implementations
// ---------------------------------------------------------------------------

const opencodePreparePlugin = async (
	_ctx: HookContext,
): Promise<PlatformBuildState> => ({});

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const opencodePlatform: PlatformDefinition = {
	id: "opencode",
	registry: defaultRegistry,
	config: platformConfigs.opencode,
	templates: {
		skill: "opencode/skill",
		agent: "opencode/agent",
		manifest: "opencode/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			`rp1-${pluginName}-${agentName}`,
		agentExtension: ".md",
	},
	hooks: {
		preparePlugin: opencodePreparePlugin,
	},
	producesBundleAssets: true,
};

const claudeCodePlatform: PlatformDefinition = {
	id: "claude-code",
	registry: claudeCodeRegistry,
	config: platformConfigs["claude-code"],
	templates: {
		skill: "claude-code/skill",
		agent: "claude-code/agent",
		manifest: "claude-code/manifest",
	},
	naming: {
		skillDirPrefix: "",
		agentFileName: (_pluginName: string, agentName: string) => agentName,
		agentExtension: ".md",
	},
	copyDirs: [".claude-plugin", "hooks"],
	producesBundleAssets: true,
};

const codexPlatform: PlatformDefinition = {
	id: "codex",
	registry: codexRegistry,
	config: platformConfigs.codex,
	templates: {
		skill: "codex/skill",
		agent: "codex/agent-toml",
		manifest: "codex/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			transformNamespace(`rp1-${pluginName}:${agentName}`, "codex"),
		agentExtension: ".toml",
	},
	hooks: {
		preparePlugin: codexPreparePlugin,
		enrichSkillContext: codexEnrichSkillContext,
		enrichAgentContext: codexEnrichAgentContext,
		postSkillWrite: codexPostSkillWrite,
		postPluginBuild: codexPostPluginBuild,
	},
	producesBundleAssets: true,
};

// ---------------------------------------------------------------------------
// Platform definitions map
// ---------------------------------------------------------------------------

export const PLATFORM_DEFINITIONS: ReadonlyMap<
	BuildPlatform,
	PlatformDefinition
> = new Map<BuildPlatform, PlatformDefinition>([
	["opencode", opencodePlatform],
	["claude-code", claudeCodePlatform],
	["codex", codexPlatform],
]);

/**
 * Get the SupportedTool config for a given build platform.
 */
export const getPlatformConfig = (platform: BuildPlatform): SupportedTool =>
	platformConfigs[platform];
