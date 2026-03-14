/**
 * Build module exports.
 */

// Claude Code registry
export { claudeCodeRegistry } from "./claude-code/registry.js";
// Command
export {
	buildCCPlugin,
	buildCodexPlugin,
	deriveCCOutputDir,
	deriveCodexOutputDir,
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
	BundleAssetEntry,
	BundleManifest,
	BundlePluginAssets,
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
	OpenCodeAgent,
	OpenCodeCommand,
	OpenCodeSkill,
	PlatformRegistry,
	PluginManifest,
} from "./models.js";
// Parser
export { parseAgent, parseCommand, parseSkill } from "./parser.js";
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
