/**
 * Type-safe data models for Claude Code installation.
 */

/**
 * Configuration options for Claude Code installation.
 */
export interface ClaudeCodeInstallConfig {
	readonly dryRun: boolean;
	readonly yes: boolean;
	readonly scope: "user" | "project" | "local";
}

/**
 * Default installation configuration.
 */
export const defaultClaudeCodeInstallConfig: ClaudeCodeInstallConfig = {
	dryRun: false,
	yes: false,
	scope: "user",
};

/**
 * Result of a prerequisite check.
 */
export interface ClaudeCodePrerequisiteResult {
	readonly check: string;
	readonly passed: boolean;
	readonly message: string;
	readonly value?: string;
}

/**
 * Result of installation operations.
 */
export interface ClaudeCodeInstallResult {
	readonly marketplaceAdded: boolean;
	readonly pluginsInstalled: readonly string[];
	readonly warnings: readonly string[];
}

/**
 * Verification report after installation.
 */
export interface ClaudeCodeVerificationReport {
	readonly marketplaceFound: boolean;
	readonly basePluginFound: boolean;
	readonly devPluginFound: boolean;
	readonly issues: readonly string[];
}

/**
 * Check if installation is healthy.
 * Returns true when marketplace and both plugins are found with no issues.
 */
export const isHealthy = (report: ClaudeCodeVerificationReport): boolean =>
	report.marketplaceFound &&
	report.basePluginFound &&
	report.devPluginFound &&
	report.issues.length === 0;
