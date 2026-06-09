import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import { getInstalledVersion } from "../../lib/version.js";
import {
	isStale,
	readVersionMarker,
	writeVersionMarker,
} from "../version-marker.js";
import {
	type GooseBundleAssetManifestOptions,
	goosePluginsDisplayRoot,
	loadGooseBundleAssetManifest,
} from "./bundle-assets.js";

export const GOOSE_LIFECYCLE_STAGES = [
	"install",
	"verify",
	"update",
	"uninstall",
] as const;

export type GooseLifecycleStage = (typeof GOOSE_LIFECYCLE_STAGES)[number];

export const GOOSE_LIFECYCLE_STATES = [
	"current",
	"missing",
	"partial",
	"stale",
	"removed",
	"blocked",
] as const;

export type GooseLifecycleState = (typeof GOOSE_LIFECYCLE_STATES)[number];

export const GOOSE_ASSET_KINDS = [
	"skill",
	"agent",
	"recipe",
	"support_metadata",
	"plugin_manifest",
	"metadata",
] as const;

export type GooseAssetKind = (typeof GOOSE_ASSET_KINDS)[number];

export const GOOSE_ASSET_CONTENT_CHECKS = ["exact_content"] as const;

export type GooseAssetContentCheck =
	(typeof GOOSE_ASSET_CONTENT_CHECKS)[number];

export const GOOSE_ASSET_FRESHNESS_STATUSES = [
	"current",
	"missing",
	"stale",
	"unknown",
] as const;

export type GooseAssetFreshnessStatus =
	(typeof GOOSE_ASSET_FRESHNESS_STATUSES)[number];

export const GOOSE_VERSION_MARKER_STATUSES = [
	"current",
	"missing",
	"stale",
	"unknown",
] as const;

export type GooseVersionMarkerStatus =
	(typeof GOOSE_VERSION_MARKER_STATUSES)[number];

export interface GooseAssetManifestEntry {
	readonly relativePath: string;
	readonly displayPath: string;
	readonly kind: GooseAssetKind;
	readonly owner: "rp1";
	readonly contentCheck: GooseAssetContentCheck;
	readonly expectedContent: string;
	readonly safeRemovalEligible: boolean;
	readonly lifecycleStages: readonly GooseLifecycleStage[];
}

export interface GooseAssetLifecycleStatus {
	readonly asset: GooseAssetManifestEntry;
	readonly freshness: GooseAssetFreshnessStatus;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface GooseVersionMarkerLifecycleStatus {
	readonly freshness: GooseVersionMarkerStatus;
	readonly installedVersion: string | null;
	readonly currentVersion: string;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface GooseLifecycleStatus {
	readonly stage: GooseLifecycleStage;
	readonly state: GooseLifecycleState;
	readonly assets: readonly GooseAssetLifecycleStatus[];
	readonly versionMarker: GooseVersionMarkerLifecycleStatus;
	readonly issue: string | null;
	readonly userAction: string | null;
}

export interface GooseManifestLifecycleOptions {
	readonly homeDir?: string;
	readonly stage?: GooseLifecycleStage;
	readonly assetManifest?: readonly GooseAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
}

export interface GooseManifestRefreshOptions
	extends GooseManifestLifecycleOptions {
	readonly dryRun: boolean;
}

export interface GooseManifestRefreshResult {
	readonly dryRun: boolean;
	readonly initialStatus: GooseLifecycleStatus;
	readonly finalStatus: GooseLifecycleStatus;
	readonly refreshableAssets: readonly GooseAssetManifestEntry[];
	readonly refreshedAssets: readonly GooseAssetManifestEntry[];
	readonly versionMarkerWritten: boolean;
}

const PLATFORM_ID = "goose";

const homeDirFor = (homeDir?: string): string =>
	homeDir ?? process.env.HOME ?? homedir();

const errorCode = (error: unknown): string | undefined =>
	typeof error === "object" && error !== null && "code" in error
		? String((error as { readonly code?: unknown }).code)
		: undefined;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const userActionForState = (state: GooseLifecycleState): string => {
	if (state === "current") {
		return "Run `rp1 verify goose` to validate Goose binary, recipe, support metadata, and smoke status.";
	}

	if (state === "removed") {
		return "Run `rp1 install goose` before using rp1 Goose recipes.";
	}

	if (state === "blocked") {
		return `Check file permissions under ${goosePluginsDisplayRoot()} and ~/.agents/, then rerun \`rp1 install goose\`.`;
	}

	return "Run `rp1 install goose` to refresh manifest-owned Goose assets.";
};

const issueForState = (
	state: GooseLifecycleState,
	versionMarker: GooseVersionMarkerLifecycleStatus,
): string | null => {
	if (state === "current") return null;
	if (
		state === "stale" &&
		(versionMarker.freshness === "missing" ||
			versionMarker.freshness === "stale")
	) {
		return versionMarker.issue;
	}
	if (state === "missing") return "Goose assets are missing.";
	if (state === "partial") return "Goose assets are partially installed.";
	if (state === "stale") return "Goose assets are stale or locally modified.";
	if (state === "removed") return "No rp1-owned Goose assets are installed.";
	return "Goose lifecycle update is blocked by inaccessible assets.";
};

const markerBlocks = (
	versionMarker: GooseVersionMarkerLifecycleStatus,
): boolean => versionMarker.freshness === "unknown";

const markerIsStale = (
	versionMarker: GooseVersionMarkerLifecycleStatus,
): boolean =>
	versionMarker.freshness === "missing" || versionMarker.freshness === "stale";

const stateForAssets = (
	assets: readonly GooseAssetLifecycleStatus[],
	stage: GooseLifecycleStage,
	versionMarker: GooseVersionMarkerLifecycleStatus,
): GooseLifecycleState => {
	if (
		assets.some((assetStatus) => assetStatus.freshness === "unknown") ||
		markerBlocks(versionMarker)
	) {
		return "blocked";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "missing")) {
		return stage === "verify" || stage === "uninstall" ? "removed" : "missing";
	}

	if (assets.some((assetStatus) => assetStatus.freshness === "stale")) {
		return "stale";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "current")) {
		return markerIsStale(versionMarker) ? "stale" : "current";
	}

	const missingCount = assets.filter(
		(assetStatus) => assetStatus.freshness === "missing",
	).length;
	if (missingCount === 1) return "missing";

	return "partial";
};

const readAssetLifecycleStatus = async (
	homeDir: string,
	asset: GooseAssetManifestEntry,
	readAssetFile: (path: string) => Promise<string> = (path) =>
		readFile(path, "utf-8"),
): Promise<GooseAssetLifecycleStatus> => {
	const path = join(homeDir, asset.relativePath);

	try {
		const content = await readAssetFile(path);
		if (content === asset.expectedContent) {
			return {
				asset,
				freshness: "current",
				issue: null,
				remediation: null,
			};
		}

		return {
			asset,
			freshness: "stale",
			issue: `${asset.displayPath} does not match the bundled rp1 Goose asset.`,
			remediation: "Run `rp1 install goose` to refresh Goose assets.",
		};
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return {
				asset,
				freshness: "missing",
				issue: `${asset.displayPath} is missing.`,
				remediation: "Run `rp1 install goose` to write Goose assets.",
			};
		}

		return {
			asset,
			freshness: "unknown",
			issue: `Unable to inspect ${asset.displayPath}: ${errorMessage(error)}.`,
			remediation: `Check file permissions under ${goosePluginsDisplayRoot()} and ~/.agents/, then rerun \`rp1 install goose\`.`,
		};
	}
};

const readVersionMarkerStatus = async (
	homeDir: string,
): Promise<GooseVersionMarkerLifecycleStatus> => {
	const currentVersion = getInstalledVersion();
	const marker = await readVersionMarker(PLATFORM_ID, homeDir)();

	if (E.isLeft(marker)) {
		return {
			freshness: "unknown",
			installedVersion: null,
			currentVersion,
			issue: `Unable to inspect the rp1 Goose version marker: ${errorMessage(marker.left)}.`,
			remediation:
				"Check permissions for ~/.rp1/platform-versions.json, then rerun `rp1 verify goose`.",
		};
	}

	if (!marker.right) {
		return {
			freshness: "missing",
			installedVersion: null,
			currentVersion,
			issue: "The rp1 Goose version marker is missing.",
			remediation:
				"Run `rp1 install goose` to refresh assets and write the version marker.",
		};
	}

	if (isStale(marker.right, currentVersion)) {
		return {
			freshness: "stale",
			installedVersion: marker.right.version,
			currentVersion,
			issue: `The rp1 Goose version marker is stale: installed ${marker.right.version}, current ${currentVersion}.`,
			remediation:
				"Run `rp1 install goose` to refresh assets and the version marker.",
		};
	}

	return {
		freshness: "current",
		installedVersion: marker.right.version,
		currentVersion,
		issue: null,
		remediation: null,
	};
};

const readGooseManifestLifecycleStatus = async (
	options: GooseManifestLifecycleOptions = {},
): Promise<GooseLifecycleStatus> => {
	const homeDir = homeDirFor(options.homeDir);
	const manifestOptions: GooseBundleAssetManifestOptions = {
		assetManifest: options.assetManifest,
		bundledAssets: options.bundledAssets,
		distDir: options.distDir,
	};
	const assetManifest = await loadGooseBundleAssetManifest(manifestOptions);
	const assets = await Promise.all(
		assetManifest
			.filter((assetEntry) =>
				assetEntry.lifecycleStages.includes(options.stage ?? "update"),
			)
			.map((assetEntry) =>
				readAssetLifecycleStatus(homeDir, assetEntry, options.readAssetFile),
			),
	);
	const stage = options.stage ?? "update";
	const versionMarker = await readVersionMarkerStatus(homeDir);
	const state = stateForAssets(assets, stage, versionMarker);

	return {
		stage,
		state,
		assets,
		versionMarker,
		issue: issueForState(state, versionMarker),
		userAction: userActionForState(state),
	};
};

export const getGooseManifestLifecycleStatus = (
	options: GooseManifestLifecycleOptions = {},
): TE.TaskEither<CLIError, GooseLifecycleStatus> =>
	TE.tryCatch(
		() => readGooseManifestLifecycleStatus(options),
		(error) =>
			installError(
				"goose-lifecycle-status",
				`Failed to inspect Goose assets: ${errorMessage(error)}`,
			),
	);

const writeGooseVersionMarker = async (homeDir: string): Promise<boolean> => {
	const markerResult = await writeVersionMarker(
		PLATFORM_ID,
		getInstalledVersion(),
		homeDir,
	)();
	if (E.isLeft(markerResult)) throw markerResult.left;
	return true;
};

export const refreshGooseManifestAssets = (
	options: GooseManifestRefreshOptions,
): TE.TaskEither<CLIError, GooseManifestRefreshResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = homeDirFor(options.homeDir);
			const manifestOptions: GooseBundleAssetManifestOptions = {
				assetManifest: options.assetManifest,
				bundledAssets: options.bundledAssets,
				distDir: options.distDir,
			};
			const initialStatus = await readGooseManifestLifecycleStatus({
				homeDir,
				stage: "update",
				...manifestOptions,
				readAssetFile: options.readAssetFile,
			});
			const refreshableAssets =
				initialStatus.state === "blocked"
					? []
					: initialStatus.assets
							.filter((assetStatus) => assetStatus.freshness !== "current")
							.map((assetStatus) => assetStatus.asset);

			if (
				options.dryRun ||
				initialStatus.state === "blocked" ||
				(refreshableAssets.length === 0 &&
					initialStatus.versionMarker.freshness === "current")
			) {
				return {
					dryRun: options.dryRun,
					initialStatus,
					finalStatus: initialStatus,
					refreshableAssets,
					refreshedAssets: [],
					versionMarkerWritten: false,
				};
			}

			for (const assetEntry of refreshableAssets) {
				const assetPath = join(homeDir, assetEntry.relativePath);
				await mkdir(dirname(assetPath), { recursive: true });
				await writeFile(assetPath, assetEntry.expectedContent, "utf-8");
			}

			const versionMarkerWritten = await writeGooseVersionMarker(homeDir);
			const finalStatus = await readGooseManifestLifecycleStatus({
				homeDir,
				stage: "update",
				...manifestOptions,
				readAssetFile: options.readAssetFile,
			});

			return {
				dryRun: options.dryRun,
				initialStatus,
				finalStatus,
				refreshableAssets,
				refreshedAssets: refreshableAssets,
				versionMarkerWritten,
			};
		},
		(error) =>
			installError(
				"goose-lifecycle-update",
				`Failed to refresh Goose assets: ${errorMessage(
					error,
				)}. Next action: check permissions under ${goosePluginsDisplayRoot()} and ~/.agents/, then rerun \`rp1 install goose\`.`,
			),
	);

export const writeGooseManifestAssets = async (options: {
	readonly homeDir: string;
	readonly assets: readonly GooseAssetManifestEntry[];
}): Promise<boolean> => {
	for (const assetEntry of options.assets) {
		const assetPath = join(options.homeDir, assetEntry.relativePath);
		await mkdir(dirname(assetPath), { recursive: true });
		await writeFile(assetPath, assetEntry.expectedContent, "utf-8");
	}
	return writeGooseVersionMarker(options.homeDir);
};

export const getGooseManifestOwnedRelativePaths = async (
	options: GooseBundleAssetManifestOptions = {},
): Promise<readonly string[]> =>
	(await loadGooseBundleAssetManifest(options)).map(
		(entry) => entry.relativePath,
	);
