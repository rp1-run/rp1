/**
 * Copilot installer module public API.
 */

export {
	backupCopilotInstallation,
	copyCopilotAgents,
	copyCopilotSkills,
	getDefaultCopilotArtifactsDir,
	installCopilot,
	previewCopilotInstallation,
	uninstallCopilot,
	validateCopilotArtifacts,
} from "./installer.js";
export type {
	CopilotInstallConfig,
	CopilotInstallResult,
	CopilotPaths,
	CopilotUninstallResult,
} from "./models.js";
export { getCopilotPaths } from "./prerequisites.js";
