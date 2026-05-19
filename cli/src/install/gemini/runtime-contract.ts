import type {
	GeminiWorkflowSupportEntry,
	GeminiWorkflowSupportExclusion,
	GeminiWorkflowSupportMatrix,
} from "../../catalog/index.js";
import type { GeminiAssetManifestEntry } from "./lifecycle.js";

export const GEMINI_RUNTIME_CONTRACT_SCHEMA_VERSION = 1;

export const GEMINI_RUNTIME_WORKFLOW_STATUSES = [
	"passed",
	"failed",
	"blocked",
	"unsupported",
	"not_run",
] as const;

export type GeminiRuntimeWorkflowStatus =
	(typeof GEMINI_RUNTIME_WORKFLOW_STATUSES)[number];

export interface GeminiRuntimeWorkflowEvidence {
	readonly workflowId: string;
	readonly status: GeminiRuntimeWorkflowStatus;
	readonly launchedFromBundle: boolean;
	readonly artifactRelativePath: string | null;
	readonly artifactStorageRoot: "work_dir" | "project" | "absolute" | null;
	readonly artifactRegistered: boolean;
	readonly activeRunId: string | null;
	readonly workRoot: string | null;
	readonly failureAttribution: string | null;
	readonly unsupportedRationale: string | null;
	readonly userAction: string | null;
}

export interface GeminiRuntimeContractEvidence {
	readonly schemaVersion: typeof GEMINI_RUNTIME_CONTRACT_SCHEMA_VERSION;
	readonly featureId: string;
	readonly runId: string;
	readonly geminiVersion: string;
	readonly generatedBundle: boolean;
	readonly workflows: readonly GeminiRuntimeWorkflowEvidence[];
}

export interface GeminiRuntimeContractWorkflowResult {
	readonly workflowId: string;
	readonly status: GeminiRuntimeWorkflowStatus;
	readonly issue: string | null;
	readonly userAction: string | null;
	readonly artifactRelativePath: string | null;
	readonly activeRunId: string | null;
}

export interface GeminiRuntimeContractEvaluation {
	readonly status: "passed" | "failed" | "not_run";
	readonly supportedWorkflowCount: number;
	readonly unsupportedWorkflowCount: number;
	readonly workflows: readonly GeminiRuntimeContractWorkflowResult[];
	readonly issue: string | null;
}

export interface GeminiWorkflowAttemptAttribution {
	readonly workflowId: string;
	readonly status: "supported" | "unsupported" | "excluded" | "unknown";
	readonly productOwnedScope: boolean;
	readonly rationale: string;
	readonly userAction: string;
	readonly evidenceSource: string | null;
	readonly exceptionOwner: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isSupportEntry = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.workflowId === "string" &&
	(value.status === "supported" || value.status === "unsupported") &&
	typeof value.userAction === "string";

const isSupportExclusion = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.workflowId === "string" &&
	typeof value.rationale === "string";

export const parseGeminiWorkflowSupportMatrix = (
	content: string,
): GeminiWorkflowSupportMatrix => {
	const parsed = JSON.parse(content) as unknown;
	if (
		!isRecord(parsed) ||
		typeof parsed.updatedAt !== "string" ||
		!Array.isArray(parsed.entries) ||
		!Array.isArray(parsed.excludedEntries) ||
		!parsed.entries.every(isSupportEntry) ||
		!parsed.excludedEntries.every(isSupportExclusion)
	) {
		throw new Error("Gemini support matrix asset is incomplete.");
	}

	return {
		updatedAt: parsed.updatedAt,
		entries: parsed.entries as readonly GeminiWorkflowSupportEntry[],
		excludedEntries:
			parsed.excludedEntries as readonly GeminiWorkflowSupportExclusion[],
	};
};

export const loadGeminiWorkflowSupportMatrixFromAssets = (
	assets: readonly GeminiAssetManifestEntry[],
): GeminiWorkflowSupportMatrix => {
	const supportMatrixAsset = assets.find(
		(asset) => asset.kind === "support_matrix",
	);
	if (!supportMatrixAsset) {
		throw new Error("Gemini support matrix asset is missing from the bundle.");
	}

	return parseGeminiWorkflowSupportMatrix(supportMatrixAsset.expectedContent);
};

export const attributeGeminiWorkflowAttempt = (
	matrix: GeminiWorkflowSupportMatrix,
	workflowId: string,
): GeminiWorkflowAttemptAttribution => {
	const entry = matrix.entries.find((item) => item.workflowId === workflowId);
	if (entry?.status === "unsupported") {
		return {
			workflowId,
			status: "unsupported",
			productOwnedScope: true,
			rationale: entry.unsupportedRationale,
			userAction: entry.userAction,
			evidenceSource: null,
			exceptionOwner: entry.exceptionOwner,
		};
	}

	if (entry?.status === "supported") {
		return {
			workflowId,
			status: "supported",
			productOwnedScope: false,
			rationale: `Gemini support matrix marks ${workflowId} supported by accepted runtime evidence.`,
			userAction: entry.userAction,
			evidenceSource: entry.evidenceSource,
			exceptionOwner: null,
		};
	}

	const exclusion = matrix.excludedEntries.find(
		(item) => item.workflowId === workflowId,
	);
	if (exclusion) {
		return {
			workflowId,
			status: "excluded",
			productOwnedScope: true,
			rationale: exclusion.rationale,
			userAction:
				"Use a user-facing workflow from the Gemini support matrix; this entry is not a Gemini product workflow claim.",
			evidenceSource: null,
			exceptionOwner: "rp1-maintainers",
		};
	}

	return {
		workflowId,
		status: "unknown",
		productOwnedScope: true,
		rationale: `${workflowId} is not present in the generated Gemini support matrix.`,
		userAction:
			"Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI unless a Gemini support matrix row is added with accepted evidence.",
		evidenceSource: null,
		exceptionOwner: "rp1-maintainers",
	};
};

const failedWorkflowResult = (
	workflowId: string,
	issue: string,
	userAction: string,
	evidence?: GeminiRuntimeWorkflowEvidence,
): GeminiRuntimeContractWorkflowResult => ({
	workflowId,
	status: evidence?.status === "blocked" ? "blocked" : "failed",
	issue,
	userAction,
	artifactRelativePath: evidence?.artifactRelativePath ?? null,
	activeRunId: evidence?.activeRunId ?? null,
});

const evaluateSupportedWorkflow = (
	workflowId: string,
	evidence: GeminiRuntimeWorkflowEvidence | undefined,
): GeminiRuntimeContractWorkflowResult => {
	if (!evidence) {
		return failedWorkflowResult(
			workflowId,
			`Supported Gemini workflow ${workflowId} has no runtime contract evidence.`,
			"Run the workflow through the generated Gemini bundle and record work-root artifact registration evidence.",
		);
	}

	if (evidence.status !== "passed") {
		return failedWorkflowResult(
			workflowId,
			evidence.failureAttribution ??
				`Supported Gemini workflow ${workflowId} did not pass runtime contract evidence.`,
			evidence.userAction ??
				"Fix the recorded Gemini workflow failure, then rerun runtime verification.",
			evidence,
		);
	}

	if (!evidence.launchedFromBundle) {
		return failedWorkflowResult(
			workflowId,
			`Supported Gemini workflow ${workflowId} was not launched from generated bundle assets.`,
			"Launch the workflow from the generated Gemini extension bundle before promoting the support row.",
			evidence,
		);
	}

	if (
		evidence.artifactStorageRoot !== "work_dir" ||
		!evidence.artifactRelativePath ||
		!evidence.artifactRegistered ||
		!evidence.activeRunId
	) {
		return failedWorkflowResult(
			workflowId,
			`Supported Gemini workflow ${workflowId} did not register the expected work-root artifact to the active run.`,
			"Rerun the workflow and verify artifact_registered output uses storageRoot=work_dir for the active run.",
			evidence,
		);
	}

	return {
		workflowId,
		status: "passed",
		issue: null,
		userAction: evidence.userAction,
		artifactRelativePath: evidence.artifactRelativePath,
		activeRunId: evidence.activeRunId,
	};
};

export const evaluateGeminiRuntimeContract = (
	matrix: GeminiWorkflowSupportMatrix,
	evidence: GeminiRuntimeContractEvidence | null,
): GeminiRuntimeContractEvaluation => {
	const supportedEntries = matrix.entries.filter(
		(entry) => entry.status === "supported",
	);
	const unsupportedWorkflowCount = matrix.entries.filter(
		(entry) => entry.status === "unsupported",
	).length;

	if (supportedEntries.length === 0) {
		return {
			status: "not_run",
			supportedWorkflowCount: 0,
			unsupportedWorkflowCount,
			workflows: [],
			issue:
				"No generated Gemini support matrix row is currently marked supported, so no supported workflow runtime contract can be claimed.",
		};
	}

	const workflows = supportedEntries.map((entry) =>
		evaluateSupportedWorkflow(
			entry.workflowId,
			evidence?.workflows.find(
				(workflow) => workflow.workflowId === entry.workflowId,
			),
		),
	);
	const failed = workflows.find((workflow) => workflow.status !== "passed");

	return {
		status: failed ? "failed" : "passed",
		supportedWorkflowCount: supportedEntries.length,
		unsupportedWorkflowCount,
		workflows,
		issue: failed?.issue ?? null,
	};
};
