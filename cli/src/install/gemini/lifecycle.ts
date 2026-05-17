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
