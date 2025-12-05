/**
 * Install module exports.
 * Re-exports all install module types and functions.
 */

// Models
export type {
  PluginManifest,
  VerificationReport,
  InstallConfig,
  PrerequisiteResult,
  BackupManifest,
  InstallResult,
} from "./models.js";

export {
  getTotalArtifacts,
  isHealthy,
  defaultInstallConfig,
} from "./models.js";

// Prerequisites
export {
  checkOpenCodeInstalled,
  checkOpenCodeVersion,
  checkOpenCodeSkillsPlugin,
  installOpenCodeSkillsPlugin,
  checkWritePermissions,
  getOpenCodeConfigDir,
  getOpenCodeConfigPath,
} from "./prerequisites.js";

// Manifest
export {
  loadManifest,
  discoverPlugins,
  getExpectedCounts,
  getAllArtifactNames,
} from "./manifest.js";

// Installer
export {
  copyArtifacts,
  backupExistingInstallation,
  installRp1,
  getDefaultArtifactsDir,
} from "./installer.js";

// Verifier
export { verifyInstallation, listInstalledCommands } from "./verifier.js";

// Config
export {
  backupConfig,
  readOpenCodeConfig,
  updateOpenCodeConfig,
  getConfigDir,
  getConfigPath,
} from "./config.js";

// Command
export {
  executeInstall,
  executeVerify,
  executeList,
  parseInstallArgs,
} from "./command.js";
