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
 * Parsed Claude Code agent with frontmatter.
 * Represents an agent from Claude Code's .claude-plugin/agents/ directory
 * with YAML frontmatter specifying tools, model, and prompt content.
 */
export interface ClaudeCodeAgent {
	readonly name: string;
	readonly description: string;
	readonly tools: readonly string[];
	readonly model: string;
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
	readonly platform: "opencode" | "codex" | "claude-code" | "all";
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
	readonly agents: readonly BundleAssetEntry[];
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
	readonly version: string;
	readonly buildTimestamp: string;
}
