/**
 * Type-safe data models for rp1 uninstallation.
 */

/**
 * Configuration options for uninstallation.
 */
export interface UninstallConfig {
	readonly dryRun: boolean;
	readonly yes: boolean;
	readonly scope: "user" | "project" | "local";
}

/**
 * Default uninstall configuration.
 */
export const defaultUninstallConfig: UninstallConfig = {
	dryRun: false,
	yes: false,
	scope: "user",
};

/**
 * Single uninstall action result.
 */
export type UninstallAction =
	| { readonly type: "removed_fenced_content"; readonly path: string }
	| { readonly type: "file_emptied"; readonly path: string }
	| { readonly type: "plugin_uninstalled"; readonly name: string }
	| {
			readonly type: "plugin_uninstall_failed";
			readonly name: string;
			readonly error: string;
	  }
	| { readonly type: "skipped"; readonly reason: string }
	| { readonly type: "no_changes"; readonly component: string };

/**
 * Overall uninstall result.
 */
export interface UninstallResult {
	readonly actions: readonly UninstallAction[];
	readonly warnings: readonly string[];
	readonly manualCleanup: readonly string[];
}
