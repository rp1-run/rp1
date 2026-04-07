/**
 * Copilot installer module public API.
 */

export {
	getDefaultCopilotArtifactsDir,
	installCopilot,
	installPlugin,
	previewCopilotInstallation,
	uninstallCopilot,
	updatePlugin,
	validateCopilotArtifacts,
} from "./installer.js";
export type {
	CopilotInstallConfig,
	CopilotInstallResult,
	CopilotPaths,
	CopilotUninstallResult,
} from "./models.js";
export { getCopilotPaths } from "./prerequisites.js";
export type {
	CopilotPluginVerification,
	CopilotVerificationResult,
	CopilotVerificationState,
} from "./verifier.js";
export {
	summarizeCopilotVerification,
	verifyCopilotInstallation,
} from "./verifier.js";
