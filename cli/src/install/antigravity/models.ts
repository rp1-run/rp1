import type { AntigravityAssetManifestEntry } from "./lifecycle.js";

export type AntigravitySmokeStatus =
	| "ready"
	| "degraded_missing_binary"
	| "degraded_missing_assets"
	| "degraded_stale_assets"
	| "degraded_blocked_assets"
	| "degraded_validation_unavailable"
	| "degraded_validation_failed";

export type AntigravityPluginValidationStatus =
	| "passed"
	| "missing_binary"
	| "unsupported"
	| "failed"
	| "not_run";

export type AntigravityPluginInstallStatus =
	| "passed"
	| "missing_binary"
	| "failed"
	| "not_run";

export interface AntigravityPluginValidationPluginResult {
	readonly pluginName: string;
	readonly pluginDir: string;
	readonly displayDir: string;
	readonly status: AntigravityPluginValidationStatus;
	readonly command: readonly string[] | null;
	readonly issue: string | null;
}

export interface AntigravityPluginValidationResult {
	readonly status: AntigravityPluginValidationStatus;
	readonly checked: boolean;
	readonly binaryPath: string | null;
	readonly plugins: readonly AntigravityPluginValidationPluginResult[];
	readonly issue: string | null;
	readonly remediation: string;
}

export interface AntigravityPluginInstallPluginResult {
	readonly pluginName: string;
	readonly pluginDir: string;
	readonly displayDir: string;
	readonly status: AntigravityPluginInstallStatus;
	readonly command: readonly string[] | null;
	readonly issue: string | null;
}

export interface AntigravityPluginInstallResult {
	readonly status: AntigravityPluginInstallStatus;
	readonly checked: boolean;
	readonly binaryPath: string | null;
	readonly plugins: readonly AntigravityPluginInstallPluginResult[];
	readonly issue: string | null;
	readonly remediation: string;
}

export interface AntigravityStatusDetail {
	readonly label: string;
	readonly issue: string | null;
	readonly remediation: string;
}

export const ANTIGRAVITY_SMOKE_STATUS_DETAILS = {
	ready: {
		label: "ready",
		issue: null,
		remediation:
			"Restart Antigravity CLI, then run installed rp1 workflows from Antigravity commands.",
	},
	degraded_missing_binary: {
		label: "degraded: Antigravity CLI binary missing",
		issue: "Antigravity CLI not found in PATH.",
		remediation:
			"Install Antigravity CLI, then confirm `agy --version` succeeds.",
	},
	degraded_missing_assets: {
		label: "degraded: package assets missing",
		issue: "Antigravity package assets are not installed.",
		remediation: "Install Antigravity assets with `rp1 install antigravity`.",
	},
	degraded_stale_assets: {
		label: "degraded: package assets stale",
		issue:
			"Antigravity package assets or the rp1 version marker do not match the current rp1 build.",
		remediation:
			"Refresh Antigravity assets with `rp1 update plugins antigravity -y`.",
	},
	degraded_blocked_assets: {
		label: "degraded: package assets blocked",
		issue: "rp1 could not inspect one or more Antigravity package assets.",
		remediation:
			"Fix permissions under ~/.gemini/antigravity-cli/, then rerun `rp1 verify antigravity`.",
	},
	degraded_validation_unavailable: {
		label: "degraded: plugin validation unavailable",
		issue:
			"Antigravity plugin validation could not be run with the detected `agy` binary.",
		remediation:
			"Update Antigravity CLI or validate the package manually with `agy plugin validate ~/.gemini/antigravity-cli/rp1-base`.",
	},
	degraded_validation_failed: {
		label: "degraded: plugin validation failed",
		issue: "Antigravity rejected one or more rp1 plugin packages.",
		remediation:
			"Inspect `agy plugin validate` output, refresh with `rp1 update plugins antigravity -y`, then rerun verification.",
	},
} as const satisfies Record<AntigravitySmokeStatus, AntigravityStatusDetail>;

export const getAntigravitySmokeStatusDetail = (
	status: AntigravitySmokeStatus,
): AntigravityStatusDetail => ANTIGRAVITY_SMOKE_STATUS_DETAILS[status];

export interface AntigravityPaths {
	readonly packageRoot: string;
	readonly packageDisplayRoot: string;
}

export interface AntigravityInstallResult {
	readonly packageRoot: string;
	readonly packageDisplayRoot: string;
	readonly assetsWritten: boolean;
	readonly assetCount: number;
	readonly assets: readonly AntigravityAssetManifestEntry[];
	readonly pluginDisplayDirs: readonly string[];
	readonly pluginDirs: readonly string[];
	readonly activePluginInstall: AntigravityPluginInstallResult;
	readonly validation: AntigravityPluginValidationResult;
	readonly versionMarkerWritten: boolean;
	readonly warnings: readonly string[];
}

export interface AntigravityVerificationResult {
	readonly status: AntigravitySmokeStatus;
	readonly verified: boolean;
	readonly antigravityInstalled: boolean;
	readonly antigravityVersion: string | null;
	readonly packageRoot: string;
	readonly packageDisplayRoot: string;
	readonly bundleAssetCount: number;
	readonly pluginValidation: AntigravityPluginValidationResult;
	readonly issues: readonly string[];
	readonly remediation: readonly string[];
}
