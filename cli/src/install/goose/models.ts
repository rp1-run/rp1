import type { GooseAssetManifestEntry } from "./lifecycle.js";

export type GooseVerificationStatus =
	| "ready"
	| "degraded_missing_binary"
	| "degraded_unsupported_version"
	| "degraded_missing_assets"
	| "degraded_stale_assets"
	| "degraded_blocked_assets"
	| "degraded_recipe_validation_failed"
	| "degraded_recipe_render_failed"
	| "degraded_support_metadata_failed";

export type GooseRecipeCheckStatus =
	| "passed"
	| "missing_binary"
	| "missing_assets"
	| "validation_failed"
	| "render_failed"
	| "not_run";

export type GooseSupportMetadataStatus =
	| "passed"
	| "missing"
	| "invalid"
	| "not_run";

export type GooseRuntimeSmokeStatus =
	| "passed"
	| "failed"
	| "blocked"
	| "not_run";

export interface GooseStatusDetail {
	readonly label: string;
	readonly issue: string | null;
	readonly remediation: string;
}

export const GOOSE_STATUS_DETAILS = {
	ready: {
		label: "ready",
		issue: null,
		remediation:
			"Run installed rp1 recipes with `goose run --recipe <recipe-name> --params ARGUMENTS='<args>'`.",
	},
	degraded_missing_binary: {
		label: "degraded: Goose binary missing",
		issue: "Goose CLI not found in PATH.",
		remediation: "Install Goose CLI, then confirm `goose --version` succeeds.",
	},
	degraded_unsupported_version: {
		label: "degraded: Goose version unsupported",
		issue:
			"The detected Goose version is older than the rp1 Goose requirement.",
		remediation: "Upgrade Goose, then rerun `rp1 verify goose`.",
	},
	degraded_missing_assets: {
		label: "degraded: Goose assets missing",
		issue: "rp1 Goose assets are missing.",
		remediation: "Install Goose assets with `rp1 install goose`.",
	},
	degraded_stale_assets: {
		label: "degraded: Goose assets stale",
		issue: "One or more rp1 Goose assets or the rp1 version marker are stale.",
		remediation: "Refresh Goose assets with `rp1 install goose`.",
	},
	degraded_blocked_assets: {
		label: "degraded: Goose assets blocked",
		issue: "rp1 could not inspect one or more Goose assets.",
		remediation:
			"Fix file permissions under ~/.agents/, then rerun `rp1 verify goose`.",
	},
	degraded_recipe_validation_failed: {
		label: "degraded: Goose recipe validation failed",
		issue: "Goose rejected one or more rp1 recipe files.",
		remediation:
			"Inspect `goose recipe validate` output, refresh with `rp1 install goose`, then rerun verification.",
	},
	degraded_recipe_render_failed: {
		label: "degraded: Goose recipe render failed",
		issue: "Goose could not render an installed rp1 recipe.",
		remediation:
			"Inspect `goose run --recipe ... --render-recipe` output, refresh with `rp1 install goose`, then rerun verification.",
	},
	degraded_support_metadata_failed: {
		label: "degraded: Goose support metadata invalid",
		issue: "rp1 Goose support metadata is missing or invalid.",
		remediation:
			"Rebuild Goose assets, run `rp1 install goose`, then verify again.",
	},
} as const satisfies Record<GooseVerificationStatus, GooseStatusDetail>;

export const getGooseStatusDetail = (
	status: GooseVerificationStatus,
): GooseStatusDetail => GOOSE_STATUS_DETAILS[status];

export interface GoosePaths {
	readonly skillsRoot: string;
	readonly skillsDisplayRoot: string;
	readonly agentsRoot: string;
	readonly agentsDisplayRoot: string;
	readonly recipesRoot: string;
	readonly recipesDisplayRoot: string;
	readonly pluginsRoot: string;
	readonly pluginsDisplayRoot: string;
}

export interface GooseInstallResult {
	readonly paths: GoosePaths;
	readonly assetsWritten: boolean;
	readonly assetCount: number;
	readonly assets: readonly GooseAssetManifestEntry[];
	readonly skillCount: number;
	readonly agentCount: number;
	readonly recipeCount: number;
	readonly metadataCount: number;
	readonly pluginDisplayDirs: readonly string[];
	readonly versionMarkerWritten: boolean;
	readonly warnings: readonly string[];
}

export interface GooseBinaryCheck {
	readonly installed: boolean;
	readonly binaryPath: string | null;
	readonly version: string | null;
	readonly minVersion: string;
	readonly satisfiesMinVersion: boolean;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface GooseRecipeCheckRecipeResult {
	readonly recipeName: string;
	readonly recipePath: string;
	readonly displayPath: string;
	readonly validationStatus: GooseRecipeCheckStatus;
	readonly renderStatus: GooseRecipeCheckStatus;
	readonly validationCommand: readonly string[] | null;
	readonly renderCommand: readonly string[] | null;
	readonly issue: string | null;
}

export interface GooseRecipeCheckResult {
	readonly status: GooseRecipeCheckStatus;
	readonly checked: boolean;
	readonly renderedRecipeName: string | null;
	readonly recipes: readonly GooseRecipeCheckRecipeResult[];
	readonly issue: string | null;
	readonly remediation: string;
}

export interface GooseSupportMetadataResult {
	readonly status: GooseSupportMetadataStatus;
	readonly checked: boolean;
	readonly metadataFiles: readonly string[];
	readonly recipeCount: number;
	readonly agentCount: number;
	readonly issue: string | null;
	readonly remediation: string;
}

export interface GooseRuntimeSmokeResult {
	readonly status: GooseRuntimeSmokeStatus;
	readonly checked: boolean;
	readonly evidencePath: string | null;
	readonly issue: string | null;
	readonly remediation: string;
}

export interface GooseVerificationResult {
	readonly status: GooseVerificationStatus;
	readonly verified: boolean;
	readonly binary: GooseBinaryCheck;
	readonly paths: GoosePaths;
	readonly bundleAssetCount: number;
	readonly recipeCheck: GooseRecipeCheckResult;
	readonly supportMetadata: GooseSupportMetadataResult;
	readonly runtimeSmoke: GooseRuntimeSmokeResult;
	readonly issues: readonly string[];
	readonly remediation: readonly string[];
}
