import { posix } from "node:path";
import type {
	GeminiLifecycleStage,
	GeminiLifecycleState,
} from "./lifecycle.js";
import type { GeminiWorkflowSupportClassification } from "./models.js";

export const GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION = 1;
export const GEMINI_BOUNDARY_MARKDOWN_FILENAME = "gemini-boundaries.md";
export const GEMINI_BOUNDARY_JSON_FILENAME = "gemini-boundaries.json";
export const GEMINI_BOUNDARY_WORKFLOW_NAME = "gemini-harness-boundaries";
export const GEMINI_BOUNDARY_HARNESS = "gemini-cli";

export const GEMINI_BOUNDARY_SCENARIOS = [
	"user_input",
	"approval",
	"trust",
	"headless_no_gate",
	"headless_user_gate",
	"install_lifecycle",
	"verify_lifecycle",
	"update_lifecycle",
	"uninstall_lifecycle",
] as const;

export type GeminiBoundaryScenario = (typeof GEMINI_BOUNDARY_SCENARIOS)[number];

export const GEMINI_BOUNDARY_MODES = [
	"interactive",
	"headless",
	"lifecycle",
] as const;

export type GeminiBoundaryMode = (typeof GEMINI_BOUNDARY_MODES)[number];

export const GEMINI_BOUNDARY_STATUSES = [
	"passed",
	"degraded",
	"blocked",
	"unsupported",
	"failed",
	"not_run",
] as const;

export type GeminiBoundaryStatus = (typeof GEMINI_BOUNDARY_STATUSES)[number];

export const GEMINI_BOUNDARY_STATES = [
	"completed",
	"requires_user_input",
	"requires_approval",
	"requires_trust",
	"headless_supported",
	"headless_unsupported",
	"current",
	"missing",
	"partial",
	"stale",
	"removed",
	"blocked",
	"unsupported_before_p3",
] as const;

export type GeminiBoundaryState = (typeof GEMINI_BOUNDARY_STATES)[number];

export interface GeminiBoundaryScenarioEvidence {
	readonly scenario: GeminiBoundaryScenario;
	readonly mode: GeminiBoundaryMode;
	readonly status: GeminiBoundaryStatus;
	readonly state: GeminiBoundaryState;
	readonly blocker: string | null;
	readonly userAction: string | null;
	readonly resumeSupported: boolean;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
	readonly evidenceArtifactPath: string | null;
	readonly lifecycleStage?: GeminiLifecycleStage;
	readonly lifecycleState?: GeminiLifecycleState;
}

export interface GeminiBoundaryEvidence {
	readonly schemaVersion: typeof GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION;
	readonly featureId: string;
	readonly runId: string;
	readonly geminiVersion: string;
	readonly runContext: string;
	readonly scenarios: readonly GeminiBoundaryScenarioEvidence[];
	readonly overallStatus: GeminiBoundaryStatus;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
}

export interface GeminiBoundaryArtifactRegistration {
	readonly path: string;
	readonly feature: string;
	readonly storageRoot: "work_dir";
	readonly format: "markdown" | "json";
	readonly harness: typeof GEMINI_BOUNDARY_HARNESS;
}

const safeFeatureId = (featureId: string): string => {
	const trimmed = featureId.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
		throw new Error(
			`Invalid Gemini boundary evidence feature id: ${featureId}`,
		);
	}
	return trimmed;
};

export const getGeminiBoundaryEvidenceRelativePaths = (
	featureId: string,
): {
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
} => {
	const safeId = safeFeatureId(featureId);
	return {
		markdownRelativePath: posix.join(
			"features",
			safeId,
			GEMINI_BOUNDARY_MARKDOWN_FILENAME,
		),
		jsonRelativePath: posix.join(
			"features",
			safeId,
			GEMINI_BOUNDARY_JSON_FILENAME,
		),
	};
};
