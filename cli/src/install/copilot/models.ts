/**
 * Type definitions for Copilot CLI installation.
 */

/** Copilot-specific install configuration. */
export interface CopilotInstallConfig {
	readonly artifactsDir: string;
	readonly dryRun: boolean;
	readonly yes: boolean;
}

/** Result of a Copilot installation. */
export interface CopilotInstallResult {
	readonly skillsCopied: number;
	readonly agentsCopied: number;
	readonly backupPath: string | null;
	readonly warnings: readonly string[];
	readonly pluginsInstalled: readonly string[];
}

/** Result of a Copilot uninstallation. */
export interface CopilotUninstallResult {
	readonly skillsRemoved: number;
	readonly agentsRemoved: boolean;
}

/** Paths used during Copilot installation. */
export interface CopilotPaths {
	readonly skillsDir: string;
	readonly agentsDir: string;
	readonly configDir: string;
	readonly backupDir: string;
}
