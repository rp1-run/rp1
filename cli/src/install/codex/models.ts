/**
 * Type definitions for Codex CLI installation.
 */

/** Codex-specific install configuration. */
export interface CodexInstallConfig {
	readonly artifactsDir: string;
	readonly dryRun: boolean;
	readonly yes: boolean;
}

/** Result of a Codex installation. */
export interface CodexInstallResult {
	readonly skillsCopied: number;
	readonly configMerged: boolean;
	readonly backupPath: string | null;
	readonly warnings: readonly string[];
}

/** Result of a Codex uninstallation. */
export interface CodexUninstallResult {
	readonly skillsRemoved: number;
	readonly configCleaned: boolean;
}

/** Paths used during Codex installation. */
export interface CodexPaths {
	readonly skillsDir: string;
	readonly configDir: string;
	readonly configFile: string;
	readonly backupDir: string;
}
