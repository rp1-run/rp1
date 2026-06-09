/**
 * Type-safe data models for Claude Code and OpenCode artifacts.
 */

/** Supported argument types for structured argument definitions. */
export type ArgumentType = "string" | "boolean" | "enum";

/** Single argument definition from skill/agent frontmatter. */
export interface ArgumentDefinition {
	readonly name: string;
	readonly type: ArgumentType;
	readonly required: boolean;
	readonly default?: string | boolean;
	readonly description: string;
	readonly aliases?: readonly string[];
	readonly implies?: readonly string[];
	readonly enum_values?: readonly string[];
	readonly variadic?: boolean;
	readonly source?: { readonly env: string };
}

/** Environment parameter definition from skill/agent frontmatter. */
export interface EnvironmentDefinition {
	readonly name: string;
	readonly source: string;
	readonly description: string;
}

/**
 * Parsed Claude Code command with frontmatter.
 * Represents a command from Claude Code's .claude-plugin/commands/ directory
 * with YAML frontmatter and markdown content.
 */
export interface ClaudeCodeCommand {
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly argumentHint?: string;
	readonly tags: readonly string[];
	readonly created: string;
	readonly updated?: string;
	readonly author: string;
	readonly content: string;
}

/**
 * Abstract model tier aliases decoupling agent definitions from vendor model identifiers.
 *
 * **How to add a new model tier/class:**
 * 1. Add the new tier to the `ModelTier` union AND `VALID_MODEL_TIERS` here.
 * 2. Add a numeric rank entry in `TIER_RANK` here.
 * 3. Add a row in `TIER_MODEL_MAP` (one concrete model per platform) in `tier-resolution.ts`.
 * 4. Add per-platform effort configs in `PLATFORM_EFFORT` in `tier-resolution.ts` if needed.
 * 5. Optionally add agents to `PROTECTED_AGENTS` that must stay at or above a tier.
 *
 * The TS types (`Exclude<ModelTier, "inherit">` keys on `TIER_MODEL_MAP` and `TIER_RANK`)
 * force a compile error if a tier is added without its mappings.
 */
export type ModelTier = "frontier" | "deep" | "standard" | "fast" | "inherit";

/** Valid model tier values for runtime validation. */
export const VALID_MODEL_TIERS: readonly ModelTier[] = [
	"frontier",
	"deep",
	"standard",
	"fast",
	"inherit",
] as const;

/**
 * Ordered rank map for tier comparison. Higher = more capable.
 * `inherit` is intentionally excluded — it means "use session model", not a rank.
 */
export const TIER_RANK: Readonly<
	Record<Exclude<ModelTier, "inherit">, number>
> = {
	frontier: 3,
	deep: 2,
	standard: 1,
	fast: 0,
} as const;

/** Reasoning effort levels controlling depth independently of model tier. */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Valid effort level values for runtime validation. */
export const VALID_EFFORT_LEVELS: readonly EffortLevel[] = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

/**
 * Agents that must remain on the deep/frontier tier.
 * Build emits a warning when any of these agents is assigned a non-deep tier.
 */
export const PROTECTED_AGENTS: ReadonlySet<string> = new Set([
	"feature-architect",
	"phase-planner",
	"research-explorer",
	"strategic-advisor",
	"security-validator",
	"socratic-duel-participant",
	"bug-investigator",
	"hypothesis-tester",
	"code-auditor",
	"blueprint-auditor",
	"pr-review-synthesizer",
	"pr-sub-reviewer",
	"task-reviewer",
	"feature-verifier",
]);

/**
 * Parsed Claude Code agent with frontmatter.
 * Represents an agent from Claude Code's .claude-plugin/agents/ directory
 * with YAML frontmatter specifying tools, model, and prompt content.
 */
export interface ClaudeCodeAgent {
	readonly name: string;
	readonly description: string;
	readonly tools: readonly string[];
	readonly model: string;
	readonly effort?: string;
	readonly content: string;
	readonly arguments?: readonly ArgumentDefinition[];
	readonly environment?: readonly EnvironmentDefinition[];
}

/**
 * rp1-specific metadata from the SKILL.md `metadata` map.
 * These fields are nested under `metadata` in frontmatter to comply
 * with the Agent Skills v1.0 whitelist (name, description, allowed-tools, metadata).
 */
/** Valid skill category values for catalog grouping. */
export type SkillCategory =
	| "development"
	| "investigation"
	| "quality"
	| "review"
	| "documentation"
	| "knowledge"
	| "strategy"
	| "planning"
	| "prompt";

export type WorkflowRunPolicy = "fresh" | "resumable";

export interface WorkflowMetadata {
	readonly runPolicy?: WorkflowRunPolicy;
	readonly identityArgs?: readonly string[];
}

export interface SkillMetadata {
	readonly version?: string;
	readonly tags?: readonly string[];
	readonly created?: string;
	readonly updated?: string;
	readonly author?: string;
	readonly argumentHint?: string;
	readonly subAgents?: readonly string[];
	readonly arguments?: readonly ArgumentDefinition[];
	readonly environment?: readonly EnvironmentDefinition[];
	readonly category?: SkillCategory;
	readonly isWorkflow?: boolean;
	readonly arcadeTracked?: boolean;
	readonly userInvocable?: boolean;
	readonly workflow?: WorkflowMetadata;
}

/**
 * Parsed Claude Code skill (SKILL.md).
 * Represents a skill from Claude Code's .claude-plugin/skills/ directory
 * with SKILL.md file and optional supporting files (templates, scripts).
 *
 * The optional `metadata` field contains rp1-specific fields extracted from
 * the frontmatter `metadata` map. Skills without a `metadata` map (e.g.,
 * pre-migration pure skills) continue to parse without error.
 */
export interface ClaudeCodeSkill {
	readonly name: string;
	readonly description: string;
	readonly allowedTools?: string; // Comma-separated string in Claude Code format
	readonly content: string;
	readonly supportingFiles: readonly string[];
	readonly metadata?: SkillMetadata;
}

/**
 * OpenCode command with required frontmatter.
 * OpenCode commands use YAML frontmatter with specific fields for
 * command template, description, and optional agent delegation.
 */
export interface OpenCodeCommand {
	readonly template: string;
	readonly description: string;
	readonly argumentHint?: string;
	readonly agent?: string;
	readonly model?: string;
	readonly subtask: boolean;
}

/**
 * OpenCode agent configuration.
 * OpenCode agents require explicit configuration with mode, tools,
 * and permissions for security and capability management.
 */
export interface OpenCodeAgent {
	readonly name: string;
	readonly description: string;
	readonly mode: "subagent";
	readonly model: string;
	readonly tools: readonly string[];
	readonly permissions: Record<string, readonly string[]>;
	readonly content: string;
}

/**
 * OpenCode skill (Anthropic Skills v1.0).
 * Skills in OpenCode must conform to Anthropic Skills v1.0 spec
 * and are accessed via the opencode-skills plugin.
 */
export interface OpenCodeSkill {
	readonly name: string;
	readonly description: string;
	readonly allowedTools?: readonly string[]; // Array format for OpenCode
	readonly content: string;
	readonly supportingFiles: readonly string[];
}

/**
 * Registry of platform differences between Claude Code and OpenCode.
 * This registry documents known differences and provides mapping rules
 * for transforming Claude Code artifacts to OpenCode format.
 */
export interface PlatformRegistry {
	readonly directoryMappings: Record<string, string>;
	readonly toolMappings: Record<string, string | null>;
	readonly metadataMappings: Record<string, string>;
}

/**
 * Plugin manifest tracking generated artifacts.
 */
export interface PluginManifest {
	readonly plugin: string;
	readonly version: string;
	readonly opencodeVersionTested: string;
	readonly artifacts: {
		readonly commands: readonly string[];
		readonly agents: readonly string[];
		readonly skills: readonly string[];
	};
	readonly installation: {
		readonly agentsDir: string;
		readonly skillsDir: string;
	};
	readonly requirements: {
		readonly opencodeVersion: string;
	};
	readonly hasOpenCodePlugin?: boolean;
}

/**
 * Build configuration options.
 */
export interface BuildConfig {
	readonly outputDir: string;
	readonly plugin: "base" | "dev" | "utils" | "all";
	readonly platform:
		| "opencode"
		| "codex"
		| "claude-code"
		| "copilot"
		| "antigravity"
		| "goose"
		| "all";
	readonly jsonOutput: boolean;
	readonly lintOnly: boolean;
}

/**
 * Build result for a single artifact.
 */
export interface ArtifactResult {
	readonly type: "agent" | "skill";
	readonly name: string;
	readonly filename: string;
	readonly success: boolean;
	readonly error?: string;
}

/**
 * Build summary statistics.
 */
export interface BuildSummary {
	readonly plugin: string;
	readonly commands: number;
	readonly agents: number;
	readonly skills: number;
	readonly errors: readonly string[];
}

/**
 * Asset entry with name and relative path for bundling.
 * State machines use inline content (path: "", content: "...") instead of file paths.
 */
export interface BundleAssetEntry {
	readonly name: string;
	readonly path: string;
	readonly content?: string;
	readonly fileName?: string;
}

/**
 * Extended asset entry for agents carrying build-time tier metadata.
 * The optional tier and effort fields preserve the agent's abstract tier identity
 * and effort level through the build-to-install chain, enabling install-time
 * remapping without access to source frontmatter.
 */
export interface BundleAgentEntry extends BundleAssetEntry {
	readonly tier?: ModelTier;
	readonly effort?: EffortLevel;
}

/**
 * OpenCode plugin asset entry for bundling.
 * Represents a plugin that responds to OpenCode events (e.g., update notifications).
 */
export interface OpenCodePluginAsset {
	readonly name: string;
	readonly files: readonly BundleAssetEntry[];
}

/**
 * Plugin assets for bundling.
 */
export interface BundlePluginAssets {
	readonly name: string;
	readonly commands: readonly BundleAssetEntry[];
	readonly agents: readonly BundleAgentEntry[];
	readonly skills: readonly BundleAssetEntry[];
	readonly stateMachines: readonly BundleAssetEntry[];
	readonly verbatimFiles: readonly BundleAssetEntry[];
	readonly openCodePlugin?: OpenCodePluginAsset;
}

/**
 * Combined manifest for bundling all plugins.
 * Generated at dist/<platform>/bundle-manifest.json after build.
 */
export interface BundleManifest {
	readonly platform?: {
		readonly id: import("./template-context.js").BuildPlatform;
		readonly name: string;
		readonly binary: string;
		readonly instructionFile: string;
		readonly supportLevel?: string;
		readonly icon?: import("../config/supported-tools.js").ToolIconMetadata;
	};
	readonly plugins: {
		readonly base: BundlePluginAssets;
		readonly dev: BundlePluginAssets;
		readonly utils: BundlePluginAssets;
	};
	readonly version: string;
	readonly buildTimestamp: string;
}

/**
 * Multi-platform embedded manifest wrapping per-platform BundleManifest entries.
 * Generated by generate-asset-imports.ts for the compiled binary.
 */
export interface EmbeddedManifest {
	readonly platforms: Partial<
		Record<import("./template-context.js").BuildPlatform, BundleManifest>
	>;
	readonly webui: readonly BundleAssetEntry[];
	/** Compiled teach-me widget bundle (`tm-widgets.js`, `tm-base.css`). */
	readonly teachMe: readonly BundleAssetEntry[];
	readonly version: string;
	readonly buildTimestamp: string;
}
