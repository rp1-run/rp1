/**
 * Type-safe data models for Claude Code and OpenCode artifacts.
 */

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
}

/**
 * Parsed Claude Code skill (SKILL.md).
 * Represents a skill from Claude Code's .claude-plugin/skills/ directory
 * with SKILL.md file and optional supporting files (templates, scripts).
 */
export interface ClaudeCodeSkill {
  readonly name: string;
  readonly description: string;
  readonly allowedTools?: string; // Comma-separated string in Claude Code format
  readonly content: string;
  readonly supportingFiles: readonly string[];
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
  readonly generatedAt: string;
  readonly opencodeVersionTested: string;
  readonly artifacts: {
    readonly commands: readonly string[];
    readonly agents: readonly string[];
    readonly skills: readonly string[];
  };
  readonly installation: {
    readonly commandsDir: string;
    readonly agentsDir: string;
    readonly skillsDir: string;
  };
  readonly requirements: {
    readonly opencodeVersion: string;
    readonly opencodeSkillsRequired: boolean;
  };
}

/**
 * Build configuration options.
 */
export interface BuildConfig {
  readonly outputDir: string;
  readonly plugin: "base" | "dev" | "all";
  readonly jsonOutput: boolean;
}

/**
 * Build result for a single artifact.
 */
export interface ArtifactResult {
  readonly type: "command" | "agent" | "skill";
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
 */
export interface BundleAssetEntry {
  readonly name: string;
  readonly path: string;
}

/**
 * Plugin assets for bundling.
 */
export interface BundlePluginAssets {
  readonly name: string;
  readonly commands: readonly BundleAssetEntry[];
  readonly agents: readonly BundleAssetEntry[];
  readonly skills: readonly BundleAssetEntry[];
}

/**
 * Combined manifest for bundling all plugins.
 * Generated at dist/opencode/bundle-manifest.json after build.
 */
export interface BundleManifest {
  readonly plugins: {
    readonly base: BundlePluginAssets;
    readonly dev: BundlePluginAssets;
  };
  readonly version: string;
  readonly buildTimestamp: string;
}
