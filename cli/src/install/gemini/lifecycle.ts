import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import {
	type GeminiBundleAssetManifestOptions,
	geminiExtensionDisplayRoot,
	loadGeminiBundleAssetManifest,
} from "./bundle-assets.js";

export const GEMINI_LIFECYCLE_STAGES = [
	"install",
	"verify",
	"update",
	"uninstall",
	"boundary_evidence",
] as const;

export type GeminiLifecycleStage = (typeof GEMINI_LIFECYCLE_STAGES)[number];

export const GEMINI_LIFECYCLE_STATES = [
	"current",
	"missing",
	"partial",
	"stale",
	"removed",
	"blocked",
	"legacy_pre_manifest",
] as const;

export type GeminiLifecycleState = (typeof GEMINI_LIFECYCLE_STATES)[number];

export const GEMINI_ASSET_KINDS = [
	"extension_manifest",
	"command",
	"agent",
	"skill",
	"context",
	"support_matrix",
	"metadata",
	"state_machine",
] as const;

export type GeminiAssetKind = (typeof GEMINI_ASSET_KINDS)[number];

export const GEMINI_ASSET_CONTENT_CHECKS = ["exact_content"] as const;

export type GeminiAssetContentCheck =
	(typeof GEMINI_ASSET_CONTENT_CHECKS)[number];

export const GEMINI_ASSET_FRESHNESS_STATUSES = [
	"current",
	"missing",
	"stale",
	"unknown",
] as const;

export type GeminiAssetFreshnessStatus =
	(typeof GEMINI_ASSET_FRESHNESS_STATUSES)[number];

export const GEMINI_SAFE_REMOVAL_RESULTS = [
	"would_remove",
	"removed",
	"skipped_missing",
	"blocked_unowned",
	"blocked_unexpected_leftovers",
	"failed",
] as const;

export type GeminiSafeRemovalResult =
	(typeof GEMINI_SAFE_REMOVAL_RESULTS)[number];

export const GEMINI_P3_LIFECYCLE_GAP_CONSTRAINT =
	"Gemini lifecycle routes are manifest-backed; legacy pre-manifest lifecycle evidence is retained only for historical artifact parsing.";

export interface GeminiAssetManifestEntry {
	readonly relativePath: string;
	readonly displayPath: string;
	readonly kind: GeminiAssetKind;
	readonly owner: "rp1";
	readonly contentCheck: GeminiAssetContentCheck;
	readonly expectedContent: string;
	readonly safeRemovalEligible: boolean;
	readonly lifecycleStages: readonly GeminiLifecycleStage[];
}

export interface GeminiAssetLifecycleStatus {
	readonly asset: GeminiAssetManifestEntry;
	readonly freshness: GeminiAssetFreshnessStatus;
	readonly issue: string | null;
	readonly remediation: string | null;
}

export interface GeminiLifecycleStatus {
	readonly stage: GeminiLifecycleStage;
	readonly state: GeminiLifecycleState;
	readonly assets: readonly GeminiAssetLifecycleStatus[];
	readonly issue: string | null;
	readonly userAction: string | null;
}

export interface GeminiSafeRemovalStatus {
	readonly asset: GeminiAssetManifestEntry;
	readonly result: GeminiSafeRemovalResult;
	readonly issue: string | null;
	readonly userAction: string | null;
}

export interface GeminiManifestLifecycleOptions {
	readonly homeDir?: string;
	readonly stage?: GeminiLifecycleStage;
	readonly assetManifest?: readonly GeminiAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
}

export interface GeminiManifestRefreshOptions
	extends GeminiManifestLifecycleOptions {
	readonly dryRun: boolean;
}

export interface GeminiManifestRefreshResult {
	readonly dryRun: boolean;
	readonly initialStatus: GeminiLifecycleStatus;
	readonly finalStatus: GeminiLifecycleStatus;
	readonly refreshableAssets: readonly GeminiAssetManifestEntry[];
	readonly refreshedAssets: readonly GeminiAssetManifestEntry[];
}

const homeDirFor = (homeDir?: string): string =>
	homeDir ?? process.env.HOME ?? homedir();

const errorCode = (error: unknown): string | undefined =>
	typeof error === "object" && error !== null && "code" in error
		? String((error as { readonly code?: unknown }).code)
		: undefined;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const userActionForState = (state: GeminiLifecycleState): string => {
	if (state === "current") {
		return "Run `rp1 verify gemini` to validate Gemini CLI readiness.";
	}

	if (state === "removed") {
		return "Run `rp1 install gemini` before using generated Gemini bundle assets.";
	}

	if (state === "blocked") {
		return `Check file permissions under ${geminiExtensionDisplayRoot()}, then rerun \`rp1 update plugins gemini\`.`;
	}

	return "Run `rp1 update plugins gemini` to refresh manifest-owned Gemini extension assets.";
};

const issueForState = (state: GeminiLifecycleState): string | null => {
	if (state === "current") return null;
	if (state === "missing") return "Gemini extension assets are missing.";
	if (state === "partial")
		return "Gemini extension assets are partially installed.";
	if (state === "stale")
		return "Gemini extension assets are stale or locally modified.";
	if (state === "removed")
		return "No rp1-owned Gemini extension assets are installed.";
	if (state === "blocked")
		return "Gemini lifecycle update is blocked by inaccessible extension assets.";
	return "Gemini lifecycle route came from legacy pre-manifest evidence.";
};

const stateForAssets = (
	assets: readonly GeminiAssetLifecycleStatus[],
	stage: GeminiLifecycleStage,
): GeminiLifecycleState => {
	if (assets.some((assetStatus) => assetStatus.freshness === "unknown")) {
		return "blocked";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "current")) {
		return "current";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "missing")) {
		return stage === "verify" || stage === "uninstall" ? "removed" : "missing";
	}

	if (assets.some((assetStatus) => assetStatus.freshness === "stale")) {
		return "stale";
	}

	const missingCount = assets.filter(
		(assetStatus) => assetStatus.freshness === "missing",
	).length;
	if (missingCount === 1) return "missing";

	return "partial";
};

const readAssetLifecycleStatus = async (
	homeDir: string,
	asset: GeminiAssetManifestEntry,
	readAssetFile: (path: string) => Promise<string> = (path) =>
		readFile(path, "utf-8"),
): Promise<GeminiAssetLifecycleStatus> => {
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
			issue: `${asset.displayPath} does not match the bundled rp1 Gemini asset.`,
			remediation:
				"Run `rp1 update plugins gemini` to refresh Gemini extension assets.",
		};
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return {
				asset,
				freshness: "missing",
				issue: `${asset.displayPath} is missing.`,
				remediation:
					"Run `rp1 update plugins gemini` to write Gemini extension assets.",
			};
		}

		return {
			asset,
			freshness: "unknown",
			issue: `Unable to inspect ${asset.displayPath}: ${errorMessage(error)}.`,
			remediation: `Check file permissions under ${geminiExtensionDisplayRoot()}, then rerun \`rp1 update plugins gemini\`.`,
		};
	}
};

const readGeminiManifestLifecycleStatus = async (
	options: GeminiManifestLifecycleOptions = {},
): Promise<GeminiLifecycleStatus> => {
	const homeDir = homeDirFor(options.homeDir);
	const manifestOptions: GeminiBundleAssetManifestOptions = {
		assetManifest: options.assetManifest,
		bundledAssets: options.bundledAssets,
		distDir: options.distDir,
	};
	const assetManifest = await loadGeminiBundleAssetManifest(manifestOptions);
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
	const state = stateForAssets(assets, stage);

	return {
		stage,
		state,
		assets,
		issue: issueForState(state),
		userAction: userActionForState(state),
	};
};

export const getGeminiManifestLifecycleStatus = (
	options: GeminiManifestLifecycleOptions = {},
): TE.TaskEither<CLIError, GeminiLifecycleStatus> =>
	TE.tryCatch(
		() => readGeminiManifestLifecycleStatus(options),
		(error) =>
			installError(
				"gemini-lifecycle-status",
				`Failed to inspect Gemini extension assets: ${errorMessage(error)}`,
			),
	);

export const refreshGeminiManifestAssets = (
	options: GeminiManifestRefreshOptions,
): TE.TaskEither<CLIError, GeminiManifestRefreshResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = homeDirFor(options.homeDir);
			const manifestOptions: GeminiBundleAssetManifestOptions = {
				assetManifest: options.assetManifest,
				bundledAssets: options.bundledAssets,
				distDir: options.distDir,
			};
			const initialStatus = await readGeminiManifestLifecycleStatus({
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
				refreshableAssets.length === 0 ||
				initialStatus.state === "blocked"
			) {
				return {
					dryRun: options.dryRun,
					initialStatus,
					finalStatus: initialStatus,
					refreshableAssets,
					refreshedAssets: [],
				};
			}

			for (const assetEntry of refreshableAssets) {
				const assetPath = join(homeDir, assetEntry.relativePath);
				await mkdir(dirname(assetPath), { recursive: true });
				await writeFile(assetPath, assetEntry.expectedContent, "utf-8");
			}

			const finalStatus = await readGeminiManifestLifecycleStatus({
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
			};
		},
		(error) =>
			installError(
				"gemini-lifecycle-update",
				`Failed to refresh Gemini extension assets: ${errorMessage(
					error,
				)}. Next action: check permissions under ${geminiExtensionDisplayRoot()}, then rerun \`rp1 update plugins gemini\`.`,
			),
	);

export const getGeminiManifestOwnedRelativePaths = async (
	options: GeminiBundleAssetManifestOptions = {},
): Promise<readonly string[]> =>
	(await loadGeminiBundleAssetManifest(options)).map(
		(entry) => entry.relativePath,
	);
