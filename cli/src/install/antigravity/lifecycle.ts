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
	type AntigravityBundleAssetManifestOptions,
	antigravityPackageDisplayRoot,
	loadAntigravityBundleAssetManifest,
} from "./bundle-assets.js";

export const ANTIGRAVITY_LIFECYCLE_STAGES = [
	"install",
	"verify",
	"update",
	"uninstall",
] as const;

export type AntigravityLifecycleStage =
	(typeof ANTIGRAVITY_LIFECYCLE_STAGES)[number];

export const ANTIGRAVITY_LIFECYCLE_STATES = [
	"current",
	"missing",
	"partial",
	"stale",
	"removed",
	"blocked",
] as const;

export type AntigravityLifecycleState =
	(typeof ANTIGRAVITY_LIFECYCLE_STATES)[number];

export const ANTIGRAVITY_ASSET_KINDS = [
	"plugin_manifest",
	"command",
	"agent",
	"skill",
	"context",
	"hooks",
	"mcp_config",
	"rules",
	"support_matrix",
	"support_metadata",
	"delegation_definition",
	"metadata",
	"state_machine",
] as const;

export type AntigravityAssetKind = (typeof ANTIGRAVITY_ASSET_KINDS)[number];

export const ANTIGRAVITY_ASSET_CONTENT_CHECKS = ["exact_content"] as const;

export type AntigravityAssetContentCheck =
	(typeof ANTIGRAVITY_ASSET_CONTENT_CHECKS)[number];

export const ANTIGRAVITY_ASSET_FRESHNESS_STATUSES = [
	"current",
	"missing",
	"stale",
	"unknown",
] as const;

export type AntigravityAssetFreshnessStatus =
	(typeof ANTIGRAVITY_ASSET_FRESHNESS_STATUSES)[number];

export const ANTIGRAVITY_VERSION_MARKER_STATUSES = [
	"current",
	"missing",
	"stale",
	"unknown",
] as const;

export type AntigravityVersionMarkerStatus =
	(typeof ANTIGRAVITY_VERSION_MARKER_STATUSES)[number];

export interface AntigravityAssetManifestEntry {
	readonly relativePath: string;
	readonly displayPath: string;
	readonly kind: AntigravityAssetKind;
	readonly owner: "rp1";
	readonly contentCheck: AntigravityAssetContentCheck;
	readonly expectedContent: string;
	readonly safeRemovalEligible: boolean;
	readonly lifecycleStages: readonly AntigravityLifecycleStage[];
}

export interface AntigravityAssetLifecycleStatus {
	readonly asset: AntigravityAssetManifestEntry;
	readonly freshness: AntigravityAssetFreshnessStatus;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface AntigravityVersionMarkerLifecycleStatus {
	readonly freshness: AntigravityVersionMarkerStatus;
	readonly installedVersion: string | null;
	readonly currentVersion: string;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface AntigravityLifecycleStatus {
	readonly stage: AntigravityLifecycleStage;
	readonly state: AntigravityLifecycleState;
	readonly assets: readonly AntigravityAssetLifecycleStatus[];
	readonly versionMarker: AntigravityVersionMarkerLifecycleStatus;
	readonly issue: string | null;
	readonly userAction: string | null;
}

export interface AntigravityManifestLifecycleOptions {
	readonly homeDir?: string;
	readonly stage?: AntigravityLifecycleStage;
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
}

export interface AntigravityManifestRefreshOptions
	extends AntigravityManifestLifecycleOptions {
	readonly dryRun: boolean;
}

export interface AntigravityManifestRefreshResult {
	readonly dryRun: boolean;
	readonly initialStatus: AntigravityLifecycleStatus;
	readonly finalStatus: AntigravityLifecycleStatus;
	readonly refreshableAssets: readonly AntigravityAssetManifestEntry[];
	readonly refreshedAssets: readonly AntigravityAssetManifestEntry[];
	readonly versionMarkerWritten: boolean;
}

const PLATFORM_ID = "antigravity";

const homeDirFor = (homeDir?: string): string =>
	homeDir ?? process.env.HOME ?? homedir();

const errorCode = (error: unknown): string | undefined =>
	typeof error === "object" && error !== null && "code" in error
		? String((error as { readonly code?: unknown }).code)
		: undefined;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const userActionForState = (state: AntigravityLifecycleState): string => {
	if (state === "current") {
		return "Run `rp1 verify antigravity` to validate Antigravity CLI readiness and plugin validation.";
	}

	if (state === "removed") {
		return "Run `rp1 install antigravity` before using Antigravity rp1 commands.";
	}

	if (state === "blocked") {
		return `Check file permissions under ${antigravityPackageDisplayRoot()}, then rerun \`rp1 update plugins antigravity\`.`;
	}

	return "Run `rp1 update plugins antigravity -y` to refresh manifest-owned Antigravity package assets.";
};

const issueForState = (
	state: AntigravityLifecycleState,
	versionMarker: AntigravityVersionMarkerLifecycleStatus,
): string | null => {
	if (state === "current") return null;
	if (
		state === "stale" &&
		(versionMarker.freshness === "missing" ||
			versionMarker.freshness === "stale")
	) {
		return versionMarker.issue;
	}
	if (state === "missing") return "Antigravity package assets are missing.";
	if (state === "partial")
		return "Antigravity package assets are partially installed.";
	if (state === "stale")
		return "Antigravity package assets are stale or locally modified.";
	if (state === "removed")
		return "No rp1-owned Antigravity package assets are installed.";
	return "Antigravity lifecycle update is blocked by inaccessible package assets.";
};

const markerBlocks = (
	versionMarker: AntigravityVersionMarkerLifecycleStatus,
): boolean => versionMarker.freshness === "unknown";

const markerIsStale = (
	versionMarker: AntigravityVersionMarkerLifecycleStatus,
): boolean =>
	versionMarker.freshness === "missing" || versionMarker.freshness === "stale";

const stateForAssets = (
	assets: readonly AntigravityAssetLifecycleStatus[],
	stage: AntigravityLifecycleStage,
	versionMarker: AntigravityVersionMarkerLifecycleStatus,
): AntigravityLifecycleState => {
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
	asset: AntigravityAssetManifestEntry,
	readAssetFile: (path: string) => Promise<string> = (path) =>
		readFile(path, "utf-8"),
): Promise<AntigravityAssetLifecycleStatus> => {
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
			issue: `${asset.displayPath} does not match the bundled rp1 Antigravity asset.`,
			remediation:
				"Run `rp1 update plugins antigravity -y` to refresh Antigravity package assets.",
		};
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return {
				asset,
				freshness: "missing",
				issue: `${asset.displayPath} is missing.`,
				remediation:
					"Run `rp1 update plugins antigravity -y` to write Antigravity package assets.",
			};
		}

		return {
			asset,
			freshness: "unknown",
			issue: `Unable to inspect ${asset.displayPath}: ${errorMessage(error)}.`,
			remediation: `Check file permissions under ${antigravityPackageDisplayRoot()}, then rerun \`rp1 update plugins antigravity\`.`,
		};
	}
};

const readVersionMarkerStatus = async (
	homeDir: string,
): Promise<AntigravityVersionMarkerLifecycleStatus> => {
	const currentVersion = getInstalledVersion();
	const marker = await readVersionMarker(PLATFORM_ID, homeDir)();

	if (E.isLeft(marker)) {
		return {
			freshness: "unknown",
			installedVersion: null,
			currentVersion,
			issue: `Unable to inspect the rp1 Antigravity version marker: ${errorMessage(marker.left)}.`,
			remediation:
				"Check permissions for ~/.rp1/platform-versions.json, then rerun `rp1 verify antigravity`.",
		};
	}

	if (!marker.right) {
		return {
			freshness: "missing",
			installedVersion: null,
			currentVersion,
			issue: "The rp1 Antigravity version marker is missing.",
			remediation:
				"Run `rp1 update plugins antigravity -y` to refresh assets and write the version marker.",
		};
	}

	if (isStale(marker.right, currentVersion)) {
		return {
			freshness: "stale",
			installedVersion: marker.right.version,
			currentVersion,
			issue: `The rp1 Antigravity version marker is stale: installed ${marker.right.version}, current ${currentVersion}.`,
			remediation:
				"Run `rp1 update plugins antigravity -y` to refresh assets and the version marker.",
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

const readAntigravityManifestLifecycleStatus = async (
	options: AntigravityManifestLifecycleOptions = {},
): Promise<AntigravityLifecycleStatus> => {
	const homeDir = homeDirFor(options.homeDir);
	const manifestOptions: AntigravityBundleAssetManifestOptions = {
		assetManifest: options.assetManifest,
		bundledAssets: options.bundledAssets,
		distDir: options.distDir,
	};
	const assetManifest =
		await loadAntigravityBundleAssetManifest(manifestOptions);
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

export const getAntigravityManifestLifecycleStatus = (
	options: AntigravityManifestLifecycleOptions = {},
): TE.TaskEither<CLIError, AntigravityLifecycleStatus> =>
	TE.tryCatch(
		() => readAntigravityManifestLifecycleStatus(options),
		(error) =>
			installError(
				"antigravity-lifecycle-status",
				`Failed to inspect Antigravity package assets: ${errorMessage(error)}`,
			),
	);

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

export const refreshAntigravityManifestAssets = (
	options: AntigravityManifestRefreshOptions,
): TE.TaskEither<CLIError, AntigravityManifestRefreshResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = homeDirFor(options.homeDir);
			const manifestOptions: AntigravityBundleAssetManifestOptions = {
				assetManifest: options.assetManifest,
				bundledAssets: options.bundledAssets,
				distDir: options.distDir,
			};
			const initialStatus = await readAntigravityManifestLifecycleStatus({
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

			const versionMarkerWritten = await writeAntigravityVersionMarker(homeDir);
			const finalStatus = await readAntigravityManifestLifecycleStatus({
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
				"antigravity-lifecycle-update",
				`Failed to refresh Antigravity package assets: ${errorMessage(
					error,
				)}. Next action: check permissions under ${antigravityPackageDisplayRoot()}, then rerun \`rp1 update plugins antigravity\`.`,
			),
	);

export const getAntigravityManifestOwnedRelativePaths = async (
	options: AntigravityBundleAssetManifestOptions = {},
): Promise<readonly string[]> =>
	(await loadAntigravityBundleAssetManifest(options)).map(
		(entry) => entry.relativePath,
	);
