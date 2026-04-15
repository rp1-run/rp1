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
	readonly marketplaceAdded: boolean;
	readonly warnings: readonly string[];
	readonly pluginsInstalled: readonly string[];
}

/** Result of a Copilot uninstallation. */
export interface CopilotUninstallResult {
	readonly pluginsUninstalled: readonly string[];
	readonly marketplaceRemoved: boolean;
	readonly marketplaceDeleted: boolean;
	readonly skillsRemoved: number;
	readonly agentsRemoved: boolean;
	readonly legacyConfigRemoved: boolean;
}

/** Paths used during Copilot installation. */
export interface CopilotPaths {
	readonly marketplaceDir: string;
	readonly marketplacePluginsDir: string;
	readonly marketplaceMetadataPath: string;
	readonly nativeInstalledPluginsDir: string;
	readonly nativeMarketplaceDir: string;
	readonly legacyConfigDir: string;
	readonly legacySkillsDir: string;
	readonly legacyAgentsDir: string;
	readonly configDir: string;
	readonly skillsDir: string;
	readonly agentsDir: string;
}
