/**
 * Build module exports.
 */

// Command
export { executeBuild, parseBuildArgs } from "./command.js";
// Generator
export {
	generateAgentFile,
	generateBundleManifest,
	generateCommandFile,
	generateManifest,
	generateSkillFile,
} from "./generator.js";
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
// Registry
export {
	defaultRegistry,
	getDirectoryMapping,
	getToolMapping,
} from "./registry.js";
// Transformations
export {
	transformAgent,
	transformCommand,
	transformSkill,
} from "./transformations.js";
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
