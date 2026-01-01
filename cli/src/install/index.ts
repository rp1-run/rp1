/**
 * Install module exports.
 * Re-exports all install module types and functions.
 */

// Command
export {
	executeInstall,
	executeList,
	executeVerify,
	type InstallOptions,
	parseInstallArgs,
} from "./command.js";
// Config
export {
	backupConfig,
	getConfigDir,
	getConfigPath,
	readOpenCodeConfig,
	registerOpenCodePlugin,
} from "./config.js";
// Installer
export {
	backupExistingInstallation,
	copyArtifacts,
	getDefaultArtifactsDir,
	installRp1,
} from "./installer.js";

// Manifest
export {
	discoverPlugins,
	getAllArtifactNames,
	getExpectedCounts,
	loadManifest,
} from "./manifest.js";
// Models
export type {
	BackupManifest,
	InstallConfig,
	InstallResult,
	PluginManifest,
	PrerequisiteResult,
	VerificationReport,
} from "./models.js";
export {
	defaultInstallConfig,
	getTotalArtifacts,
	isHealthy,
} from "./models.js";
// Prerequisites
export {
	checkOpenCodeInstalled,
	checkOpenCodeVersion,
	checkWritePermissions,
	getOpenCodeConfigDir,
	getOpenCodeConfigPath,
	registerRp1HooksPlugin,
} from "./prerequisites.js";
// Verifier
export { listInstalledCommands, verifyInstallation } from "./verifier.js";
