/**
 * Codex installer module public API.
 */

export {
	backupCodexInstallation,
	copyCodexSkills,
	getDefaultCodexArtifactsDir,
	installCodex,
	previewCodexInstallation,
	uninstallCodex,
	validateCodexArtifacts,
} from "./installer.js";
export type {
	CodexInstallConfig,
	CodexInstallResult,
	CodexPaths,
	CodexUninstallResult,
} from "./models.js";
export { getCodexPaths } from "./prerequisites.js";
