/**
 * Build module exports.
 */

export type { CatalogEntry } from "./catalog-generator.js";
// Catalog generator
export {
	collectCatalogEntries,
	generateCatalog,
	renderCatalog,
} from "./catalog-generator.js";
// Claude Code registry
export { claudeCodeRegistry } from "./claude-code/registry.js";
export type { PlatformBuildResult } from "./command.js";
// Command
export {
	buildPlatformPlugin,
	deriveCCOutputDir,
	deriveCodexOutputDir,
	deriveGooseOutputDir,
	executeBuild,
	parseBuildArgs,
} from "./command.js";
// Filters
export { registerFilters } from "./filters/index.js";
// Models
export type {
	ArtifactResult,
	BuildConfig,
	BuildSummary,
	BundleAgentEntry,
	BundleAssetEntry,
	BundleManifest,
	BundlePluginAssets,
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
	EmbeddedManifest,
	OpenCodeAgent,
	OpenCodeCommand,
	OpenCodeSkill,
	PlatformRegistry,
	PluginManifest,
	SkillCategory,
} from "./models.js";
// Parser
export { parseAgent, parseCommand, parseSkill } from "./parser.js";
export type {
	HookContext,
	PlatformBuildState,
	PlatformDefinition,
	PlatformHooks,
	PlatformNaming,
	PlatformTemplates,
	PostBuildResult,
} from "./platform-definitions.js";
// Platform definitions
export {
	getPlatformConfig,
	PLATFORM_DEFINITIONS,
} from "./platform-definitions.js";
// Preprocessor
export { preprocessConditionals } from "./preprocessor.js";
// Registry
export {
	defaultRegistry,
	getDirectoryMapping,
	getToolMapping,
} from "./registry.js";
export type { BuildTemplateContext } from "./template-context.js";
// Template context
export { buildTemplateContext } from "./template-context.js";
export type { TemplateEngine } from "./template-engine.js";
// Template engine
export { createTemplateEngine } from "./template-engine.js";
// Validator
export {
	validateAgent,
	validateAgentSchema,
	validateAgentSyntax,
	validateCommand,
	validateCommandSchema,
	validateCommandSyntax,
	validateSkill,
	validateSkillSchema,
	validateSkillSyntax,
} from "./validator.js";
