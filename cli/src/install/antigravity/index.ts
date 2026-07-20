import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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
	type AntigravityPluginInstallPluginResult,
	type AntigravityPluginInstallResult,
	type AntigravityPluginInstallStatus,
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
	readonly runAgyPluginInstall?: (
		binaryPath: string,
		pluginDir: string,
	) => Promise<{
		readonly exitCode: number;
		readonly stdout: string;
		readonly stderr: string;
	}>;
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

export interface AntigravityActivePluginSyncOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly getAntigravityBinaryPath?: () => string | null;
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
	readonly runAgyPluginInstall?: AntigravityInstallOptions["runAgyPluginInstall"];
}

export interface AntigravityActivePluginSyncResult {
	readonly driftDetected: boolean;
	readonly driftIssue: string | null;
	readonly install: AntigravityPluginInstallResult | null;
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
	options:
		| AntigravityInstallOptions
		| AntigravityVerifyDeps
		| AntigravityActivePluginSyncOptions,
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

/**
 * Candidate locations of an asset in Antigravity's active plugin registry,
 * most current layout first. Antigravity CLI >= 1.1.x imports plugins into
 * `~/.gemini/config/plugins/`; older releases used
 * `~/.gemini/antigravity-cli/plugins/`. The first readable candidate is the
 * authoritative active copy — a stale file left behind in the legacy
 * location must not be reported as drift once the current registry matches.
 */
const activePluginRelativePaths = (
	asset: AntigravityAssetManifestEntry,
): readonly string[] => {
	const parts = asset.relativePath.split("/");
	if (
		parts[0] !== ".gemini" ||
		parts[1] !== "antigravity-cli" ||
		!parts[2] ||
		parts.length < 4
	) {
		return [];
	}

	const pluginSuffix = [parts[2], ...parts.slice(3)];
	return [
		[".gemini", "config", "plugins", ...pluginSuffix].join("/"),
		[".gemini", "antigravity-cli", "plugins", ...pluginSuffix].join("/"),
	].map((path) => path.replace(/\/+/g, "/"));
};

const ACTIVE_IMPORT_MANIFEST_RELATIVE_PATHS = [
	".gemini/config/import_manifest.json",
	".gemini/antigravity-cli/import_manifest.json",
] as const;

const readJsonFile = async (path: string): Promise<unknown | null> => {
	try {
		return JSON.parse(await readFile(path, "utf-8"));
	} catch (error) {
		const code =
			typeof error === "object" && error !== null && "code" in error
				? String((error as { readonly code?: unknown }).code)
				: undefined;
		if (code === "ENOENT") return null;
		return null;
	}
};

const inspectActiveAntigravityImports = async (options: {
	readonly homeDir: string;
	readonly assets: readonly AntigravityAssetManifestEntry[];
	readonly readAssetFile?: (path: string) => Promise<string>;
}): Promise<{
	readonly issue: string;
	readonly remediation: string;
} | null> => {
	const expectedPlugins = new Set(
		pluginRelativeDirs(options.assets).map((relativeDir) =>
			relativeDir.split("/").at(-1),
		),
	);
	let importManifest: unknown | null = null;
	for (const manifestRelativePath of ACTIVE_IMPORT_MANIFEST_RELATIVE_PATHS) {
		importManifest = await readJsonFile(
			join(options.homeDir, manifestRelativePath),
		);
		if (importManifest !== null) break;
	}
	if (
		importManifest &&
		typeof importManifest === "object" &&
		"imports" in importManifest &&
		Array.isArray((importManifest as { readonly imports?: unknown }).imports)
	) {
		const latestImportSourceByName = new Map<string, unknown>();
		for (const entry of (importManifest as { readonly imports: unknown[] })
			.imports) {
			if (typeof entry !== "object" || entry === null) continue;
			const name = (entry as { readonly name?: unknown }).name;
			const source = (entry as { readonly source?: unknown }).source;
			if (typeof name === "string" && expectedPlugins.has(name)) {
				latestImportSourceByName.set(name, source);
			}
		}

		for (const [name, source] of latestImportSourceByName) {
			if (source === "gemini-cli") {
				return {
					issue: `${name} is still imported into Antigravity from Gemini CLI assets.`,
					remediation:
						"Run `rp1 install antigravity` to import the rp1 Antigravity package assets into the active Antigravity plugin registry.",
				};
			}
		}
	}

	const readActiveAsset =
		options.readAssetFile ?? ((path: string) => readFile(path, "utf-8"));
	const activeComparableKinds = new Set<AntigravityAssetManifestEntry["kind"]>([
		"plugin_manifest",
		"command",
		"skill",
		"context",
		"support_matrix",
		"support_metadata",
	]);
	for (const asset of options.assets) {
		if (!activeComparableKinds.has(asset.kind)) continue;
		for (const activeRelativePath of activePluginRelativePaths(asset)) {
			const activePath = join(options.homeDir, activeRelativePath);
			let activeContent: string;
			try {
				activeContent = await readActiveAsset(activePath);
			} catch {
				continue;
			}
			if (activeContent !== asset.expectedContent) {
				return {
					issue: `Active Antigravity plugin asset ~/${activeRelativePath} does not match the installed rp1 Antigravity package asset.`,
					remediation:
						"Run `rp1 update plugins antigravity -y` (or `rp1 install antigravity`) to refresh Antigravity's active plugin registry.",
				};
			}
			break;
		}
	}

	return null;
};

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

const activePluginInstallRemediation = (
	status: AntigravityPluginInstallStatus,
): string => {
	if (status === "passed") {
		return "Antigravity active plugin registry was refreshed for all rp1 packages.";
	}
	if (status === "missing_binary") {
		return "Install Antigravity CLI, then rerun `rp1 install antigravity` so rp1 packages are imported into the active Antigravity registry.";
	}
	if (status === "failed") {
		return "Inspect `agy plugin install` output, then rerun `rp1 install antigravity`.";
	}
	return "Run `rp1 install antigravity` to import package assets into the active Antigravity plugin registry.";
};

const notRunActivePluginInstall = (
	binaryPath: string | null,
): AntigravityPluginInstallResult => ({
	status: "not_run",
	checked: false,
	binaryPath,
	plugins: [],
	issue:
		"Antigravity active plugin install was skipped because this was a dry run.",
	remediation: activePluginInstallRemediation("not_run"),
});

const defaultRunAgyPluginInstall = async (
	binaryPath: string,
	pluginDir: string,
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> => {
	const proc = Bun.spawn([binaryPath, "plugin", "install", pluginDir], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

const activePluginInstallStatus = (
	results: readonly { readonly status: AntigravityPluginInstallStatus }[],
): AntigravityPluginInstallStatus => {
	if (results.some((result) => result.status === "failed")) return "failed";
	if (
		results.length > 0 &&
		results.every((result) => result.status === "passed")
	) {
		return "passed";
	}
	return "not_run";
};

const installAntigravityActivePlugins = async (options: {
	readonly binaryPath: string | null;
	readonly pluginDirs: readonly string[];
	readonly pluginDisplayDirs: readonly string[];
	readonly runAgyPluginInstall?: AntigravityInstallOptions["runAgyPluginInstall"];
}): Promise<AntigravityPluginInstallResult> => {
	if (!options.binaryPath) {
		return {
			status: "missing_binary",
			checked: false,
			binaryPath: null,
			plugins: [],
			issue: "Antigravity CLI was not found in PATH.",
			remediation: activePluginInstallRemediation("missing_binary"),
		};
	}

	if (options.pluginDirs.length === 0) {
		return {
			status: "not_run",
			checked: false,
			binaryPath: options.binaryPath,
			plugins: [],
			issue:
				"No Antigravity plugin package directories were available to import.",
			remediation: activePluginInstallRemediation("not_run"),
		};
	}

	const runInstall = options.runAgyPluginInstall ?? defaultRunAgyPluginInstall;
	const plugins: AntigravityPluginInstallPluginResult[] = [];

	for (let i = 0; i < options.pluginDirs.length; i++) {
		const pluginDir = options.pluginDirs[i]!;
		const displayDir = options.pluginDisplayDirs[i] ?? pluginDir;
		const command = [
			options.binaryPath,
			"plugin",
			"install",
			pluginDir,
		] as const;
		const result = await runInstall(options.binaryPath, pluginDir);
		const output = `${result.stdout}\n${result.stderr}`.trim();
		const status: AntigravityPluginInstallStatus =
			result.exitCode === 0 ? "passed" : "failed";
		plugins.push({
			pluginName: basename(pluginDir),
			pluginDir,
			displayDir,
			status,
			command,
			issue:
				status === "passed"
					? null
					: output || "Antigravity plugin install failed.",
		});
	}

	const status = activePluginInstallStatus(plugins);
	const issue =
		status === "passed"
			? null
			: (plugins.find((plugin) => plugin.issue)?.issue ??
				"Antigravity active plugin install did not pass.");

	return {
		status,
		checked: status === "passed" || status === "failed",
		binaryPath: options.binaryPath,
		plugins,
		issue,
		remediation: activePluginInstallRemediation(status),
	};
};

/**
 * Re-imports rp1 package assets into Antigravity's active plugin registry
 * (`~/.gemini/antigravity-cli/plugins/`) when the registry has drifted from
 * the installed package assets. Used by the update flow so that
 * `rp1 update plugins antigravity` clears the drift that
 * `rp1 verify antigravity` reports, instead of requiring a full
 * `rp1 install antigravity`.
 */
export const syncAntigravityActivePlugins = async (
	options: AntigravityActivePluginSyncOptions,
): Promise<AntigravityActivePluginSyncResult> => {
	const homeDir = homeDirFor(options.homeDir);
	const assets = await loadAntigravityBundleAssetManifest(
		bundleOptionsFor(options),
	);
	const drift = await inspectActiveAntigravityImports({
		homeDir,
		assets,
		readAssetFile: options.readAssetFile,
	});
	if (!drift) {
		return { driftDetected: false, driftIssue: null, install: null };
	}
	if (options.dryRun) {
		return { driftDetected: true, driftIssue: drift.issue, install: null };
	}

	const binaryPath = options.getAntigravityBinaryPath?.() ?? Bun.which("agy");
	const install = await installAntigravityActivePlugins({
		binaryPath,
		pluginDirs: pluginDirs(homeDir, assets),
		pluginDisplayDirs: pluginDisplayDirs(assets),
		runAgyPluginInstall: options.runAgyPluginInstall,
	});
	return { driftDetected: true, driftIssue: drift.issue, install };
};

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

			const pluginDirsToValidate = pluginDirs(homeDir, assets);
			const pluginDisplayDirsToValidate = pluginDisplayDirs(assets);
			const activePluginInstall = options.dryRun
				? notRunActivePluginInstall(binaryPath)
				: await installAntigravityActivePlugins({
						binaryPath,
						pluginDirs: pluginDirsToValidate,
						pluginDisplayDirs: pluginDisplayDirsToValidate,
						runAgyPluginInstall: options.runAgyPluginInstall,
					});
			if (activePluginInstall.status === "failed") {
				throw new Error(
					activePluginInstall.issue ??
						"Antigravity active plugin install failed.",
				);
			}

			const versionMarkerWritten = options.dryRun
				? false
				: await writeAntigravityVersionMarker(homeDir);
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
			if (activePluginInstall.status === "missing_binary") {
				warnings.push(
					"Antigravity active plugin import was skipped because `agy` was not found.",
				);
			}

			return {
				packageRoot: paths.packageRoot,
				packageDisplayRoot: paths.packageDisplayRoot,
				assetsWritten: !options.dryRun,
				assets,
				assetCount: assets.length,
				pluginDisplayDirs: pluginDisplayDirsToValidate,
				pluginDirs: pluginDirsToValidate,
				activePluginInstall,
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
	const activeImportIssue = await inspectActiveAntigravityImports({
		homeDir,
		assets,
		readAssetFile: deps.readAssetFile,
	});
	const validation = await validateAntigravityPackages({
		pluginDirs: pluginDirs(homeDir, assets),
		pluginDisplayDirs: pluginDisplayDirs(assets),
		getAntigravityBinaryPath,
		runAgyPluginValidate: deps.runAgyPluginValidate,
	});
	const baseStatus = smokeStatusFrom(
		antigravityInstalled,
		lifecycleState,
		validation,
	);
	const status = activeImportIssue ? "degraded_stale_assets" : baseStatus;
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
	if (activeImportIssue) {
		issues.push(activeImportIssue.issue);
		remediation.push(activeImportIssue.remediation);
	}

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
