import type { GeminiWorkflowSupportMatrix } from "../../catalog/index.js";
import type { GeminiLifecycleState } from "./lifecycle.js";
import type { GeminiRuntimeContractEvaluation } from "./runtime-contract.js";

export const GEMINI_RELEASE_READINESS_SCHEMA_VERSION = 1;

export const GEMINI_RELEASE_READINESS_GATE_IDS = [
	"inventory",
	"lifecycle",
	"bundle",
	"runtime",
	"docs",
	"cleanup",
	"existing_harness_regression",
	"first_class_install",
] as const;

export type GeminiReleaseReadinessGateId =
	(typeof GEMINI_RELEASE_READINESS_GATE_IDS)[number];

export type GeminiReleaseReadinessGateStatus =
	| "pass"
	| "product_exception"
	| "blocking_gap";

export type GeminiReleaseReadinessStatus = "pass" | "warn" | "fail";

export interface GeminiExistingHarnessRegression {
	readonly harness: "claude-code" | "opencode" | "codex" | "copilot";
	readonly status: "pass" | "fail";
	readonly evidence: string;
}

export interface GeminiReleaseReadinessGate {
	readonly id: GeminiReleaseReadinessGateId;
	readonly label: string;
	readonly status: GeminiReleaseReadinessGateStatus;
	readonly evidence: string;
	readonly rationale: string;
	readonly userAction: string | null;
}

export interface GeminiReleaseReadinessRecord {
	readonly schemaVersion: typeof GEMINI_RELEASE_READINESS_SCHEMA_VERSION;
	readonly featureId: string;
	readonly runId: string;
	readonly generatedAt: string;
	readonly readinessStatus: GeminiReleaseReadinessStatus;
	readonly readyForRelease: boolean;
	readonly gates: readonly GeminiReleaseReadinessGate[];
	readonly blockingGaps: readonly GeminiReleaseReadinessGateId[];
}

export interface BuildGeminiReleaseReadinessRecordOptions {
	readonly featureId: string;
	readonly runId: string;
	readonly generatedAt: string;
	readonly matrix: GeminiWorkflowSupportMatrix;
	readonly lifecycleState: GeminiLifecycleState;
	readonly bundleAssetCount: number;
	readonly runtimeEvaluation: GeminiRuntimeContractEvaluation;
	readonly docsAligned: boolean;
	readonly cleanupRecorded: boolean;
	readonly existingHarnessRegressions: readonly GeminiExistingHarnessRegression[];
	readonly nonGeminiSetupRequired: boolean;
}

const gate = (
	id: GeminiReleaseReadinessGateId,
	label: string,
	status: GeminiReleaseReadinessGateStatus,
	evidence: string,
	rationale: string,
	userAction: string | null = null,
): GeminiReleaseReadinessGate => ({
	id,
	label,
	status,
	evidence,
	rationale,
	userAction,
});

const inventoryGate = (
	matrix: GeminiWorkflowSupportMatrix,
): GeminiReleaseReadinessGate => {
	const classified = matrix.entries.length;
	const excluded = matrix.excludedEntries.length;

	if (classified === 0) {
		return gate(
			"inventory",
			"Catalog inventory",
			"blocking_gap",
			`classified=${classified}; excluded=${excluded}; updated=${matrix.updatedAt}`,
			"The Gemini support matrix has no classified workflow rows.",
			"Regenerate the catalog-backed Gemini support matrix before release.",
		);
	}

	return gate(
		"inventory",
		"Catalog inventory",
		"pass",
		`classified=${classified}; excluded=${excluded}; updated=${matrix.updatedAt}`,
		"Every user-facing catalog workflow has a Gemini support row or cataloged exclusion.",
	);
};

const lifecycleGate = (
	lifecycleState: GeminiLifecycleState,
): GeminiReleaseReadinessGate =>
	lifecycleState === "current"
		? gate(
				"lifecycle",
				"Lifecycle",
				"pass",
				`state=${lifecycleState}`,
				"Gemini install, verify, update, and uninstall operate on manifest-owned extension assets.",
			)
		: gate(
				"lifecycle",
				"Lifecycle",
				"blocking_gap",
				`state=${lifecycleState}`,
				"Gemini lifecycle assets are not current.",
				"Run `rp1 install gemini` or `rp1 update plugins gemini`, then verify again.",
			);

const bundleGate = (assetCount: number): GeminiReleaseReadinessGate =>
	assetCount > 0
		? gate(
				"bundle",
				"Gemini extension assets",
				"pass",
				`manifest_assets=${assetCount}`,
				"Gemini extension assets are present and manifest-owned.",
			)
		: gate(
				"bundle",
				"Gemini extension assets",
				"blocking_gap",
				"manifest_assets=0",
				"No Gemini CLI extension assets were available for the release gate.",
				"Run `rp1 build --platform gemini` and rerun release readiness.",
			);

const runtimeGate = (
	runtimeEvaluation: GeminiRuntimeContractEvaluation,
): GeminiReleaseReadinessGate => {
	if (runtimeEvaluation.status === "passed") {
		return gate(
			"runtime",
			"Runtime contract",
			"pass",
			`supported=${runtimeEvaluation.supportedWorkflowCount}; unsupported=${runtimeEvaluation.unsupportedWorkflowCount}`,
			"Supported Gemini workflow rows are backed by first-class Gemini extension assets; per-workflow runtime attestation is optional release evidence.",
		);
	}

	if (
		runtimeEvaluation.status === "not_run" &&
		runtimeEvaluation.supportedWorkflowCount === 0 &&
		runtimeEvaluation.unsupportedWorkflowCount > 0
	) {
		return gate(
			"runtime",
			"Runtime contract",
			"product_exception",
			`supported=0; unsupported=${runtimeEvaluation.unsupportedWorkflowCount}`,
			"No Gemini support matrix row is promoted to supported, so runtime success is not claimed.",
			"Regenerate the Gemini support matrix from current catalog sources before release.",
		);
	}

	return gate(
		"runtime",
		"Runtime contract",
		"blocking_gap",
		`supported=${runtimeEvaluation.supportedWorkflowCount}; unsupported=${runtimeEvaluation.unsupportedWorkflowCount}; status=${runtimeEvaluation.status}`,
		runtimeEvaluation.issue ?? "Gemini runtime contract evidence did not pass.",
		"Fix the failed runtime evidence before promoting supported Gemini workflows.",
	);
};

const docsGate = (aligned: boolean): GeminiReleaseReadinessGate =>
	aligned
		? gate(
				"docs",
				"Docs and CLI language",
				"pass",
				"docs_aligned=true",
				"Public docs and CLI language use the same first-class Gemini support wording.",
			)
		: gate(
				"docs",
				"Docs and CLI language",
				"blocking_gap",
				"docs_aligned=false",
				"Documentation alignment is still pending after CLI language alignment.",
				"Complete TD1-TD5 before final release readiness is green.",
			);

const cleanupGate = (recorded: boolean): GeminiReleaseReadinessGate =>
	recorded
		? gate(
				"cleanup",
				"Validation asset cleanup",
				"pass",
				"cleanup_recorded=true",
				"Validation-only Gemini assets have replacement coverage or retained rationale.",
			)
		: gate(
				"cleanup",
				"Validation asset cleanup",
				"blocking_gap",
				"cleanup_recorded=false",
				"Validation-only Gemini asset cleanup evidence is missing.",
				"Record cleanup inventory and replacement coverage before release.",
			);

const existingHarnessRegressionGate = (
	regressions: readonly GeminiExistingHarnessRegression[],
): GeminiReleaseReadinessGate => {
	const required = new Set(["claude-code", "opencode", "codex", "copilot"]);
	for (const regression of regressions) {
		if (regression.status === "pass") required.delete(regression.harness);
	}
	const failures = regressions.filter(
		(regression) => regression.status === "fail",
	);

	if (required.size === 0 && failures.length === 0) {
		return gate(
			"existing_harness_regression",
			"Existing harness regression",
			"pass",
			regressions
				.map((regression) => `${regression.harness}:${regression.evidence}`)
				.join("; "),
			"Claude Code, OpenCode, Codex, and Copilot gates passed with Gemini changes present.",
		);
	}

	return gate(
		"existing_harness_regression",
		"Existing harness regression",
		"blocking_gap",
		`missing=${[...required].join(",") || "none"}; failures=${failures.map((regression) => regression.harness).join(",") || "none"}`,
		"Existing harness regression evidence is incomplete or failed.",
		"Run and record Claude Code, OpenCode, Codex, and Copilot regression gates before release.",
	);
};

const firstClassInstallGate = (
	nonGeminiSetupRequired: boolean,
): GeminiReleaseReadinessGate =>
	nonGeminiSetupRequired
		? gate(
				"first_class_install",
				"First-class install",
				"blocking_gap",
				"default_install_includes_gemini=false",
				"Default install/update flow is missing a stable harness.",
				"Keep Gemini in the stable tools registry and automatic install/update flow.",
			)
		: gate(
				"first_class_install",
				"First-class install",
				"pass",
				"default_install_includes_gemini=true",
				"Gemini participates in the same default install/update flow as other stable harnesses.",
			);

export const buildGeminiReleaseReadinessRecord = (
	options: BuildGeminiReleaseReadinessRecordOptions,
): GeminiReleaseReadinessRecord => {
	const gates = [
		inventoryGate(options.matrix),
		lifecycleGate(options.lifecycleState),
		bundleGate(options.bundleAssetCount),
		runtimeGate(options.runtimeEvaluation),
		docsGate(options.docsAligned),
		cleanupGate(options.cleanupRecorded),
		existingHarnessRegressionGate(options.existingHarnessRegressions),
		firstClassInstallGate(options.nonGeminiSetupRequired),
	];
	const blockingGaps = gates
		.filter((item) => item.status === "blocking_gap")
		.map((item) => item.id);
	const hasProductException = gates.some(
		(item) => item.status === "product_exception",
	);

	return {
		schemaVersion: GEMINI_RELEASE_READINESS_SCHEMA_VERSION,
		featureId: options.featureId,
		runId: options.runId,
		generatedAt: options.generatedAt,
		readinessStatus:
			blockingGaps.length > 0 ? "fail" : hasProductException ? "warn" : "pass",
		readyForRelease: blockingGaps.length === 0,
		gates,
		blockingGaps,
	};
};

export const renderGeminiReleaseReadinessMarkdown = (
	record: GeminiReleaseReadinessRecord,
): string => {
	const gateRows = record.gates.map(
		(item) =>
			`| ${item.id} | ${item.status} | ${item.evidence} | ${item.rationale} | ${item.userAction ?? "none"} |`,
	);

	return [
		"# Gemini Release Readiness",
		"",
		`- feature_id: ${record.featureId}`,
		`- run_id: ${record.runId}`,
		`- generated_at: ${record.generatedAt}`,
		`- readiness_status: ${record.readinessStatus}`,
		`- ready_for_release: ${record.readyForRelease}`,
		`- blocking_gaps: ${record.blockingGaps.length === 0 ? "[]" : record.blockingGaps.join(", ")}`,
		"",
		"| Gate | Status | Evidence | Rationale | User action |",
		"|------|--------|----------|-----------|-------------|",
		...gateRows,
		"",
	].join("\n");
};
