import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import {
	GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH,
	GEMINI_BOUNDARY_COMMAND_TOML,
} from "./boundary-command.js";
import {
	GEMINI_EXTENSION_DISPLAY_DIR,
	GEMINI_EXTENSION_RELATIVE_DIR,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
} from "./smoke-command.js";
import {
	GEMINI_ALPHA_AGENT_MARKDOWN,
	GEMINI_ALPHA_AGENT_RELATIVE_PATH,
	GEMINI_BETA_AGENT_MARKDOWN,
	GEMINI_BETA_AGENT_RELATIVE_PATH,
	GEMINI_EXTENSION_MANIFEST_JSON,
	GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH,
	GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
	GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_TOML,
} from "./subagent-command.js";

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
	"unsupported_before_p3",
] as const;

export type GeminiLifecycleState = (typeof GEMINI_LIFECYCLE_STATES)[number];

export const GEMINI_ASSET_KINDS = [
	"extension_manifest",
	"command",
	"validation_agent",
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
	"Before Gemini P3, named Gemini update and uninstall lifecycle routes are not assumed to exist; callers must surface unsupported_before_p3 or implement explicit manifest-backed update and removal behavior.";

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

const displayPathFor = (relativePath: string): string =>
	relativePath.replace(
		GEMINI_EXTENSION_RELATIVE_DIR,
		GEMINI_EXTENSION_DISPLAY_DIR,
	);

const asset = (
	relativePath: string,
	kind: GeminiAssetKind,
	expectedContent: string,
	lifecycleStages: readonly GeminiLifecycleStage[],
): GeminiAssetManifestEntry => ({
	relativePath,
	displayPath: displayPathFor(relativePath),
	kind,
	owner: "rp1",
	contentCheck: "exact_content",
	expectedContent,
	safeRemovalEligible: true,
	lifecycleStages,
});

export const GEMINI_ASSET_MANIFEST = [
	asset(
		GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH,
		"extension_manifest",
		GEMINI_EXTENSION_MANIFEST_JSON,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
		"command",
		GEMINI_SMOKE_COMMAND_TOML,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH,
		"command",
		GEMINI_SUBAGENT_COMMAND_TOML,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH,
		"command",
		GEMINI_BOUNDARY_COMMAND_TOML,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_ALPHA_AGENT_RELATIVE_PATH,
		"validation_agent",
		GEMINI_ALPHA_AGENT_MARKDOWN,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_BETA_AGENT_RELATIVE_PATH,
		"validation_agent",
		GEMINI_BETA_AGENT_MARKDOWN,
		["install", "verify", "update", "uninstall"],
	),
	asset(
		GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH,
		"validation_agent",
		GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
		["install", "verify", "update", "uninstall"],
	),
] as const satisfies readonly GeminiAssetManifestEntry[];

export const GEMINI_MANIFEST_OWNED_RELATIVE_PATHS = GEMINI_ASSET_MANIFEST.map(
	(entry) => entry.relativePath,
);

export const getGeminiManifestAsset = (
	relativePath: string,
): GeminiAssetManifestEntry | undefined =>
	GEMINI_ASSET_MANIFEST.find((entry) => entry.relativePath === relativePath);

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

	if (state === "blocked") {
		return "Check file permissions under ~/.gemini/extensions/rp1-phase2-validation, then rerun `rp1 update plugins gemini`.";
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
	if (state === "blocked")
		return "Gemini lifecycle update is blocked by inaccessible extension assets.";
	return "Gemini lifecycle route is unsupported before P3.";
};

const stateForAssets = (
	assets: readonly GeminiAssetLifecycleStatus[],
): GeminiLifecycleState => {
	if (assets.some((assetStatus) => assetStatus.freshness === "unknown")) {
		return "blocked";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "current")) {
		return "current";
	}

	if (assets.every((assetStatus) => assetStatus.freshness === "missing")) {
		return "missing";
	}

	if (assets.some((assetStatus) => assetStatus.freshness === "stale")) {
		return "stale";
	}

	return "partial";
};

const readAssetLifecycleStatus = async (
	homeDir: string,
	asset: GeminiAssetManifestEntry,
): Promise<GeminiAssetLifecycleStatus> => {
	const path = join(homeDir, asset.relativePath);

	try {
		const content = await readFile(path, "utf-8");
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
			remediation:
				"Check file permissions under ~/.gemini/extensions/rp1-phase2-validation, then rerun `rp1 update plugins gemini`.",
		};
	}
};

const readGeminiManifestLifecycleStatus = async (
	options: GeminiManifestLifecycleOptions = {},
): Promise<GeminiLifecycleStatus> => {
	const homeDir = homeDirFor(options.homeDir);
	const assets = await Promise.all(
		GEMINI_ASSET_MANIFEST.map((assetEntry) =>
			readAssetLifecycleStatus(homeDir, assetEntry),
		),
	);
	const state = stateForAssets(assets);

	return {
		stage: options.stage ?? "update",
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
			const initialStatus = await readGeminiManifestLifecycleStatus({
				homeDir,
				stage: "update",
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
				)}. Next action: check permissions under ~/.gemini/extensions/rp1-phase2-validation, then rerun \`rp1 update plugins gemini\`.`,
			),
	);
