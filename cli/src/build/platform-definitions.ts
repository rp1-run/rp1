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
}

/**
 * Context passed to the preparePlugin hook.
 */
export interface HookContext {
	readonly projectRoot: string;
	readonly pluginName: string;
	readonly pluginDir: string;
	readonly outputDir: string;
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
	) => Promise<void>;

	/**
	 * Called after all agents are built for a plugin.
	 * Use for aggregate operations (e.g., Codex sub-agent validation,
	 * rp1-agents.toml generation, AGENTS.md generation, CC .claude-plugin copy).
	 */
	readonly postPluginBuild?: (
		outputDir: string,
		state: PlatformBuildState,
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
// Lazy imports for registries (avoid circular deps)
// ---------------------------------------------------------------------------

import { claudeCodeRegistry } from "./claude-code/registry.js";
import { codexRegistry } from "./codex/registry.js";
import { defaultRegistry } from "./registry.js";
import { transformNamespace } from "./tags/index.js";

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
	producesBundleAssets: false,
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
	producesBundleAssets: false,
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
