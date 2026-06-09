/**
 * Build Template Context model.
 *
 * Defines the well-typed interface that merges all data needed by Liquid
 * templates into a single render context: platform configuration from
 * supported-tools.yaml, plugin metadata, parsed artifact data, platform
 * registry mappings, and build metadata.
 */

import type { SupportedTool } from "../config/supported-tools.js";
import { deriveArgumentHint } from "./arguments.js";
import type {
	ArgumentDefinition,
	EnvironmentDefinition,
	PlatformRegistry,
	SkillMetadata,
} from "./models.js";

// ---------------------------------------------------------------------------
// Platform type
// ---------------------------------------------------------------------------

/** Build target platforms. */
export type BuildPlatform =
	| "opencode"
	| "codex"
	| "claude-code"
	| "copilot"
	| "antigravity"
	| "gemini"
	| "goose";

// ---------------------------------------------------------------------------
// Codex role type
// ---------------------------------------------------------------------------

/** Codex role-type heuristic values for agent classification. */
export type CodexRoleType = "worker" | "explorer" | "reviewer" | "default";

// ---------------------------------------------------------------------------
// Artifact data models
// ---------------------------------------------------------------------------

/** Data for a skill artifact passed into the template context. */
export interface SkillWorkflowTarget {
	readonly name: string;
	readonly schemaPath: string;
}

/** Data for a skill artifact passed into the template context. */
export interface SkillArtifactData {
	readonly type: "skill";
	readonly name: string;
	readonly namespacedName: string; // e.g. "rp1-base-knowledge-build"
	readonly schemaPath?: string; // project-relative source SKILL.md path
	readonly workflowTarget?: SkillWorkflowTarget; // canonical tracked-workflow target
	readonly description: string;
	readonly allowedTools?: string; // raw CC format (comma-separated string)
	readonly content: string; // post-conditional-processing
	readonly metadata?: SkillMetadata;
	readonly supportingFiles: readonly string[];
}

/** Data for an agent artifact passed into the template context. */
export interface AgentArtifactData {
	readonly type: "agent";
	readonly name: string;
	readonly description: string;
	readonly model: string;
	readonly tools: readonly string[];
	readonly content: string; // post-conditional-processing
	readonly roleType?: CodexRoleType; // computed for Codex
	readonly arguments?: readonly ArgumentDefinition[];
	readonly environment?: readonly EnvironmentDefinition[];
}

/** Data for a manifest artifact passed into the template context. */
export interface ManifestArtifactData {
	readonly type: "manifest";
	readonly skills: readonly string[];
	readonly agents: readonly string[];
	readonly commands: readonly string[];
	readonly hasOpenCodePlugin?: boolean;
}

// ---------------------------------------------------------------------------
// Build Template Context
// ---------------------------------------------------------------------------

/**
 * Unified context object passed to every Liquid template render.
 *
 * Merges platform config (from supported-tools.yaml), plugin metadata,
 * parsed artifact data, platform registry mappings, and build metadata
 * into a single well-typed object.
 */
export interface BuildTemplateContext extends Record<string, unknown> {
	// Platform
	readonly platform: BuildPlatform;
	readonly platformConfig: SupportedTool; // from supported-tools.yaml

	// Plugin
	readonly pluginName: string; // e.g. "base", "dev", "utils"
	readonly pluginVersion: string;
	readonly namespacedPluginName: string; // e.g. "rp1-base"

	// Artifact data (populated per artifact)
	readonly artifact:
		| SkillArtifactData
		| AgentArtifactData
		| ManifestArtifactData;

	// Registry (for filters)
	readonly registry: PlatformRegistry;

	// Build metadata
	readonly buildTimestamp: string;
	readonly version: string; // rp1 CLI version
}

// ---------------------------------------------------------------------------
// Argument hint auto-derivation
// ---------------------------------------------------------------------------

/**
 * Return a new {@link SkillMetadata} with the `argumentHint` auto-derived
 * from the structured `arguments` array when present.
 *
 * When `arguments` is defined the derived hint replaces any manually
 * specified `argument-hint` value, ensuring the template always emits
 * a hint consistent with the structured schema.
 *
 * Returns the original metadata unchanged when `arguments` is absent.
 */
export function withDerivedArgumentHint(
	metadata: SkillMetadata | undefined,
): SkillMetadata | undefined {
	if (!metadata?.arguments || metadata.arguments.length === 0) {
		return metadata;
	}

	return {
		...metadata,
		argumentHint: deriveArgumentHint(metadata.arguments),
	};
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Construct a {@link BuildTemplateContext} from its constituent parts.
 *
 * Platform config is sourced from the `supported-tools.yaml` registry data
 * via the `platformConfigs` map, which callers populate from the loaded
 * {@link ToolsRegistry}.
 */
export function buildTemplateContext(
	platform: BuildPlatform,
	pluginName: string,
	pluginVersion: string,
	artifact: SkillArtifactData | AgentArtifactData | ManifestArtifactData,
	registry: PlatformRegistry,
	cliVersion: string,
	platformConfig: SupportedTool,
): BuildTemplateContext {
	return {
		platform,
		platformConfig,
		pluginName,
		pluginVersion,
		namespacedPluginName: `rp1-${pluginName}`,
		artifact,
		registry,
		buildTimestamp: new Date().toISOString(),
		version: cliVersion,
	};
}
