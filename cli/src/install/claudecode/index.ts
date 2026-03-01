/**
 * Claude Code install module exports.
 * Re-exports all Claude Code installation types and functions.
 */

// Command
export {
	type ClaudeCodeInstallArgs,
	type ClaudeCodeInstallOptions,
	defaultClaudeCodeInstallOptions,
	executeClaudeCodeInstall,
	parseClaudeCodeInstallArgs,
} from "./command.js";
// Installer
export {
	addMarketplace,
	installAllPlugins,
	installPlugin,
	updatePlugin,
} from "./installer.js";
// Models
export type {
	ClaudeCodeInstallConfig,
	ClaudeCodeInstallResult,
	ClaudeCodePrerequisiteResult,
} from "./models.js";
export { defaultClaudeCodeInstallConfig } from "./models.js";
// Prerequisites
export {
	checkClaudeCodeInstalled,
	checkPluginCommandSupport,
	parseClaudeCodeVersion,
	runAllPrerequisiteChecks,
} from "./prerequisites.js";
