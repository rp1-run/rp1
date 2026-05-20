import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import { getInstalledVersion } from "../../lib/version.js";
import { writeVersionMarker } from "../version-marker.js";
import {
	type AntigravityBundleAssetManifestOptions,
	antigravityPackageDisplayRoot,
	antigravityPackageNameFromDisplayDir,
	antigravityPackageRelativeRoot,
	loadAntigravityBundleAssetManifest,
} from "./bundle-assets.js";
import type {
	AntigravityAssetManifestEntry,
	AntigravityLifecycleState,
} from "./lifecycle.js";
import { getAntigravityManifestLifecycleStatus } from "./lifecycle.js";
import {
	type AntigravityInstallResult,
	type AntigravityPaths,
	type AntigravityPluginValidationResult,
	type AntigravitySmokeStatus,
	type AntigravityVerificationResult,
	getAntigravitySmokeStatusDetail,
} from "./models.js";
import {
	type AntigravityPluginValidationOptions,
	validateAntigravityPackages,
} from "./plugin-validation.js";

export interface AntigravityInstallOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly getAntigravityBinaryPath?: () => string | null;
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly runAgyPluginValidate?: AntigravityPluginValidationOptions["runAgyPluginValidate"];
}

export interface AntigravityVerifyDeps {
	readonly homeDir?: string;
	readonly getAntigravityBinaryPath?: () => string | null;
	readonly getAntigravityVersion?: () => Promise<string | null>;
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
	readonly runAgyPluginValidate?: AntigravityPluginValidationOptions["runAgyPluginValidate"];
}

const PLATFORM_ID = "antigravity";

const homeDirFor = (homeDir?: string): string =>
	homeDir ?? process.env.HOME ?? homedir();

export const getAntigravityPaths = (
	homeDir = process.env.HOME ?? homedir(),
): AntigravityPaths => ({
	packageRoot: join(homeDir, antigravityPackageRelativeRoot()),
	packageDisplayRoot: antigravityPackageDisplayRoot(),
});

const bundleOptionsFor = (
	options: AntigravityInstallOptions | AntigravityVerifyDeps,
): AntigravityBundleAssetManifestOptions => ({
	assetManifest: options.assetManifest,
	bundledAssets: options.bundledAssets,
	distDir: options.distDir,
});

const pluginRelativeDirs = (
	assets: readonly AntigravityAssetManifestEntry[],
): readonly string[] => [
	...new Set(
		assets.map((asset) => asset.relativePath.split("/").slice(0, 3).join("/")),
	),
];

const pluginDisplayDirs = (
	assets: readonly AntigravityAssetManifestEntry[],
): readonly string[] => [
	...new Set(
		assets.map((asset) => asset.displayPath.split("/").slice(0, 4).join("/")),
	),
];

const pluginDirs = (
	homeDir: string,
	assets: readonly AntigravityAssetManifestEntry[],
): readonly string[] =>
	pluginRelativeDirs(assets).map((relativeDir) => join(homeDir, relativeDir));

const notRunValidation = (
	binaryPath: string | null,
): AntigravityPluginValidationResult => ({
	status: "not_run",
	checked: false,
	binaryPath,
	plugins: [],
	issue:
		"Antigravity plugin validation was skipped because this was a dry run.",
	remediation:
		"Run `rp1 install antigravity`, then `rp1 verify antigravity` to validate installed packages.",
});

const defaultAntigravityVersion = async (): Promise<string | null> => {
	const binaryPath = Bun.which("agy");
	if (!binaryPath) return null;

	const proc = Bun.spawn([binaryPath, "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) return "unknown";

	const version = (await new Response(proc.stdout).text()).trim();
	return version.length > 0 ? version : "unknown";
};

const writeAntigravityVersionMarker = async (
	homeDir: string,
): Promise<boolean> => {
	const markerResult = await writeVersionMarker(
		PLATFORM_ID,
		getInstalledVersion(),
		homeDir,
	)();
	if (E.isLeft(markerResult)) throw markerResult.left;
	return true;
};

export const installAntigravityBundleAssets = (
	options: AntigravityInstallOptions,
): TE.TaskEither<CLIError, AntigravityInstallResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = homeDirFor(options.homeDir);
			const paths = getAntigravityPaths(homeDir);
			const assets = await loadAntigravityBundleAssetManifest(
				bundleOptionsFor(options),
			);
			const binaryPath =
				options.getAntigravityBinaryPath?.() ?? Bun.which("agy");
			const warnings: string[] = [];

			if (!binaryPath) {
				warnings.push(
					"Antigravity CLI was not found in PATH. Install Antigravity CLI before running rp1 Antigravity commands.",
				);
			}

			if (!options.dryRun) {
				for (const asset of assets) {
					const assetPath = join(homeDir, asset.relativePath);
					await mkdir(dirname(assetPath), { recursive: true });
					await writeFile(assetPath, asset.expectedContent, "utf-8");
				}
			}

			const versionMarkerWritten = options.dryRun
				? false
				: await writeAntigravityVersionMarker(homeDir);
			const pluginDirsToValidate = pluginDirs(homeDir, assets);
			const pluginDisplayDirsToValidate = pluginDisplayDirs(assets);
			const validation = options.dryRun
				? notRunValidation(binaryPath)
				: await validateAntigravityPackages({
						pluginDirs: pluginDirsToValidate,
						pluginDisplayDirs: pluginDisplayDirsToValidate,
						getAntigravityBinaryPath: () => binaryPath,
						runAgyPluginValidate: options.runAgyPluginValidate,
					});

			if (validation.status === "unsupported") {
				warnings.push(
					"Antigravity plugin validation is unavailable in the detected `agy` binary.",
				);
			}
			if (validation.status === "failed") {
				warnings.push("Antigravity plugin validation failed.");
			}

			return {
				packageRoot: paths.packageRoot,
				packageDisplayRoot: paths.packageDisplayRoot,
				assetsWritten: !options.dryRun,
				assets,
				assetCount: assets.length,
				pluginDisplayDirs: pluginDisplayDirsToValidate,
				pluginDirs: pluginDirsToValidate,
				validation,
				versionMarkerWritten,
				warnings,
			};
		},
		(error) =>
			installError(
				"antigravity-package-assets",
				error instanceof Error
					? error.message
					: "Failed to install Antigravity package assets",
			),
	);

const smokeStatusFrom = (
	antigravityInstalled: boolean,
	lifecycleState: AntigravityLifecycleState,
	validation: AntigravityPluginValidationResult,
): AntigravitySmokeStatus => {
	if (!antigravityInstalled) return "degraded_missing_binary";
	if (lifecycleState === "removed" || lifecycleState === "missing") {
		return "degraded_missing_assets";
	}
	if (lifecycleState === "partial") return "degraded_missing_assets";
	if (lifecycleState === "blocked") return "degraded_blocked_assets";
	if (validation.status === "passed") return "ready";
	if (validation.status === "unsupported" || validation.status === "not_run") {
		return "degraded_validation_unavailable";
	}
	if (lifecycleState === "stale") return "degraded_stale_assets";
	return "degraded_validation_failed";
};

export const verifyAntigravityBundleSetup = async (
	deps: AntigravityVerifyDeps = {},
): Promise<AntigravityVerificationResult> => {
	const homeDir = homeDirFor(deps.homeDir);
	const assets = await loadAntigravityBundleAssetManifest(
		bundleOptionsFor(deps),
	);
	const paths = getAntigravityPaths(homeDir);
	const getAntigravityBinaryPath =
		deps.getAntigravityBinaryPath ?? (() => Bun.which("agy"));
	const antigravityBinaryPath = getAntigravityBinaryPath();
	const antigravityInstalled = Boolean(antigravityBinaryPath);
	const antigravityVersion = antigravityInstalled
		? await (deps.getAntigravityVersion?.() ?? defaultAntigravityVersion())
		: null;
	const lifecycle = await getAntigravityManifestLifecycleStatus({
		homeDir,
		stage: "verify",
		assetManifest: deps.assetManifest,
		bundledAssets: deps.bundledAssets,
		distDir: deps.distDir,
		readAssetFile: deps.readAssetFile,
	})();
	const lifecycleState = E.isRight(lifecycle)
		? lifecycle.right.state
		: "blocked";
	const validation = await validateAntigravityPackages({
		pluginDirs: pluginDirs(homeDir, assets),
		pluginDisplayDirs: pluginDisplayDirs(assets),
		getAntigravityBinaryPath,
		runAgyPluginValidate: deps.runAgyPluginValidate,
	});
	const status = smokeStatusFrom(
		antigravityInstalled,
		lifecycleState,
		validation,
	);
	const detail = getAntigravitySmokeStatusDetail(status);
	const issues: string[] = [];
	const remediation: string[] = [];

	if (detail.issue) issues.push(detail.issue);
	remediation.push(detail.remediation);

	if (E.isLeft(lifecycle)) {
		issues.push(formatError(lifecycle.left, false));
	} else {
		if (lifecycle.right.issue) issues.push(lifecycle.right.issue);
		if (lifecycle.right.versionMarker.issue) {
			issues.push(lifecycle.right.versionMarker.issue);
		}
		for (const asset of lifecycle.right.assets.filter(
			(assetStatus) => assetStatus.freshness !== "current",
		)) {
			if (asset.issue) issues.push(asset.issue);
		}
		if (lifecycle.right.userAction) {
			remediation.push(lifecycle.right.userAction);
		}
	}

	if (validation.issue) issues.push(validation.issue);
	remediation.push(validation.remediation);

	return {
		status,
		verified: status === "ready",
		antigravityInstalled,
		antigravityVersion,
		packageRoot: paths.packageRoot,
		packageDisplayRoot: paths.packageDisplayRoot,
		bundleAssetCount: assets.length,
		pluginValidation: validation,
		issues: [...new Set(issues)],
		remediation: [...new Set(remediation)],
	};
};

export const antigravityBundleScope = (result: {
	readonly pluginDisplayDirs: readonly string[];
}): readonly string[] =>
	result.pluginDisplayDirs.map(antigravityPackageNameFromDisplayDir);

export {
	ANTIGRAVITY_BUNDLE_DIR_ENV,
	antigravityPackageDisplayRoot,
	antigravityPackageNameFromDisplayDir,
	antigravityPackageRelativeRoot,
	getAntigravityManifestAsset,
	loadAntigravityBundleAssetManifest,
} from "./bundle-assets.js";
export type {
	AntigravityAssetFreshnessStatus,
	AntigravityAssetKind,
	AntigravityAssetLifecycleStatus,
	AntigravityAssetManifestEntry,
	AntigravityLifecycleStage,
	AntigravityLifecycleState,
	AntigravityLifecycleStatus,
	AntigravityManifestLifecycleOptions,
	AntigravityManifestRefreshOptions,
	AntigravityManifestRefreshResult,
	AntigravityVersionMarkerLifecycleStatus,
	AntigravityVersionMarkerStatus,
} from "./lifecycle.js";
export {
	ANTIGRAVITY_ASSET_CONTENT_CHECKS,
	ANTIGRAVITY_ASSET_FRESHNESS_STATUSES,
	ANTIGRAVITY_ASSET_KINDS,
	ANTIGRAVITY_LIFECYCLE_STAGES,
	ANTIGRAVITY_LIFECYCLE_STATES,
	ANTIGRAVITY_VERSION_MARKER_STATUSES,
	getAntigravityManifestLifecycleStatus,
	getAntigravityManifestOwnedRelativePaths,
	refreshAntigravityManifestAssets,
} from "./lifecycle.js";
export type {
	AntigravityInstallResult,
	AntigravityPaths,
	AntigravityPluginValidationPluginResult,
	AntigravityPluginValidationResult,
	AntigravityPluginValidationStatus,
	AntigravitySmokeStatus,
	AntigravityStatusDetail,
	AntigravityVerificationResult,
} from "./models.js";
export {
	ANTIGRAVITY_SMOKE_STATUS_DETAILS,
	getAntigravitySmokeStatusDetail,
} from "./models.js";
export type { AntigravityPluginValidationOptions } from "./plugin-validation.js";
export { validateAntigravityPackages } from "./plugin-validation.js";
export type {
	AntigravitySafeRemovalResult,
	AntigravitySafeRemovalStatus,
	AntigravityUninstallOptions,
	AntigravityUninstallResult,
} from "./uninstaller.js";
export {
	ANTIGRAVITY_SAFE_REMOVAL_RESULTS,
	uninstallAntigravityPackageAssets,
} from "./uninstaller.js";
