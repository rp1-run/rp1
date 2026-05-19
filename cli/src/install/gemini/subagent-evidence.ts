import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
	GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES,
	type GeminiAcknowledgementCaveat,
	type GeminiAcknowledgementEvidence,
	type GeminiAcknowledgementScope,
	type GeminiCustomSubagentEvidence,
	type GeminiDelegatedFailure,
	type GeminiDelegatedFailureEvidence,
	type GeminiDelegationEvidence,
	type GeminiDelegationEvidenceStatus,
	type GeminiFanoutEvidence,
	type GeminiFanoutOutput,
	type GeminiWorkflowSupportClassification,
} from "./models.js";

export const GEMINI_SUBAGENT_MARKERS = {
	alpha: "ALPHA_MARKER_FROM_rp1-alpha",
	beta: "BETA_MARKER_FROM_rp1-beta",
} as const;

export const GEMINI_RUNTIME_FAIL_AGENT_NAME = "rp1-runtime-fail";
export const GEMINI_SUBAGENT_MARKDOWN_FILENAME = "gemini-subagents.md";
export const GEMINI_SUBAGENT_JSON_FILENAME = "gemini-subagents.json";
export const GEMINI_SUBAGENT_WORKFLOW_NAME = "gemini-harness-subagents";
export const GEMINI_SUBAGENT_HARNESS = "gemini-cli";

export interface GeminiSubagentReductionPayload {
	readonly alpha_agent?: unknown;
	readonly alpha_output?: unknown;
	readonly beta_agent?: unknown;
	readonly beta_output?: unknown;
	readonly failing_agent?: unknown;
	readonly failing_output?: unknown;
	readonly failing_error?: unknown;
	readonly failing_status?: unknown;
	readonly overall_status?: unknown;
	readonly acknowledgement_required?: unknown;
	readonly acknowledgement_scope?: unknown;
	readonly acknowledgement_reason?: unknown;
	readonly acknowledgement_user_action?: unknown;
}

export interface GeminiSubagentEvidenceContext {
	readonly featureId: string;
	readonly runId: string;
	readonly geminiVersion?: string;
	readonly runContext?: string;
}

export interface GeminiSubagentEvidenceWriteOptions
	extends GeminiSubagentEvidenceContext {
	readonly workRoot: string;
	readonly parentPayload: unknown;
}

export interface GeminiSubagentEvidenceArtifactResult {
	readonly evidence: GeminiDelegationEvidence;
	readonly markdownPath: string;
	readonly jsonPath: string;
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
}

export interface GeminiSubagentEvidenceCommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type GeminiSubagentEvidenceCommandRunner = (
	command: readonly string[],
) => Promise<GeminiSubagentEvidenceCommandResult>;

export interface GeminiSubagentEvidencePersistOptions
	extends GeminiSubagentEvidenceWriteOptions {
	readonly workflow?: string;
	readonly harness?: string;
	readonly rp1Command?: readonly string[];
	readonly commandRunner?: GeminiSubagentEvidenceCommandRunner;
}

export interface GeminiSubagentEvidencePersistResult
	extends GeminiSubagentEvidenceArtifactResult {
	readonly registrationResults: readonly GeminiSubagentEvidenceCommandResult[];
	readonly terminalStatusResult: GeminiSubagentEvidenceCommandResult;
}

const EXPECTED_SUCCESS_UNITS = [
	{
		unitId: "alpha",
		agentName: "rp1-alpha",
		marker: GEMINI_SUBAGENT_MARKERS.alpha,
	},
	{
		unitId: "beta",
		agentName: "rp1-beta",
		marker: GEMINI_SUBAGENT_MARKERS.beta,
	},
] as const;

const EXPECTED_FAILURE_UNIT = {
	unitId: "fail",
	agentName: GEMINI_RUNTIME_FAIL_AGENT_NAME,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (
	payload: Record<string, unknown>,
	key: string,
): string | undefined => {
	const value = payload[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
};

const booleanField = (
	payload: Record<string, unknown>,
	key: string,
): boolean | undefined => {
	const value = payload[key];
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return undefined;

	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "yes") return true;
	if (normalized === "false" || normalized === "no") return false;
	return undefined;
};

const normalizeAgentName = (agentName: string | undefined): string =>
	(agentName ?? "").trim().replace(/^@/, "");

const markerInOutput = (output: string | undefined): string | undefined => {
	if (!output) return undefined;
	return Object.values(GEMINI_SUBAGENT_MARKERS).find((marker) =>
		output.includes(marker),
	);
};

const safeFeatureId = (featureId: string): string => {
	const trimmed = featureId.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
		throw new Error(`Invalid Gemini evidence feature id: ${featureId}`);
	}
	return trimmed;
};

export const getGeminiSubagentEvidenceRelativePaths = (
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
			GEMINI_SUBAGENT_MARKDOWN_FILENAME,
		),
		jsonRelativePath: posix.join(
			"features",
			safeId,
			GEMINI_SUBAGENT_JSON_FILENAME,
		),
	};
};

const issueText = (issues: readonly string[]): string | undefined =>
	issues.length > 0 ? issues.join("; ") : undefined;

const buildFanoutOutput = (
	payload: Record<string, unknown>,
	unit: (typeof EXPECTED_SUCCESS_UNITS)[number],
): GeminiFanoutOutput => {
	const agentName = stringField(payload, `${unit.unitId}_agent`);
	const output = stringField(payload, `${unit.unitId}_output`);
	const actualMarker = markerInOutput(output);
	const issues: string[] = [];

	if (!agentName) {
		issues.push("missing agent name");
	} else if (normalizeAgentName(agentName) !== unit.agentName) {
		issues.push(`expected agent ${unit.agentName}, got ${agentName}`);
	}

	if (!output) {
		issues.push("missing output");
	} else if (actualMarker !== unit.marker) {
		issues.push(`expected marker ${unit.marker}`);
	}

	return {
		unitId: unit.unitId,
		agentName: agentName ?? unit.agentName,
		status: issues.length > 0 ? "failed" : "passed",
		expectedMarker: unit.marker,
		actualMarker,
		output,
		issue: issueText(issues),
	};
};

const duplicateFanoutUnits = (
	payload: Record<string, unknown>,
	outputs: readonly GeminiFanoutOutput[],
): readonly string[] => {
	const duplicates = new Set<string>();
	const markerCounts = new Map<string, number>();

	for (const output of outputs) {
		if (!output.actualMarker) continue;
		markerCounts.set(
			output.actualMarker,
			(markerCounts.get(output.actualMarker) ?? 0) + 1,
		);
	}

	for (const output of outputs) {
		if (
			output.actualMarker &&
			(markerCounts.get(output.actualMarker) ?? 0) > 1
		) {
			duplicates.add(output.unitId);
		}
	}

	const alphaAgent = normalizeAgentName(stringField(payload, "alpha_agent"));
	const betaAgent = normalizeAgentName(stringField(payload, "beta_agent"));
	if (alphaAgent.length > 0 && alphaAgent === betaAgent) {
		duplicates.add("alpha");
		duplicates.add("beta");
	}

	return [...duplicates].sort();
};

const buildFanoutEvidence = (
	payload: Record<string, unknown>,
): GeminiFanoutEvidence => {
	const outputs = EXPECTED_SUCCESS_UNITS.map((unit) =>
		buildFanoutOutput(payload, unit),
	);
	const missingUnits = outputs
		.filter((output) => output.status !== "passed")
		.map((output) => output.unitId);
	const duplicateUnits = duplicateFanoutUnits(payload, outputs);
	const issues = [
		missingUnits.length > 0
			? `missing or malformed expected outputs: ${missingUnits.join(", ")}`
			: undefined,
		duplicateUnits.length > 0
			? `duplicated expected outputs: ${duplicateUnits.join(", ")}`
			: undefined,
	].filter((issue): issue is string => issue !== undefined);

	return {
		status:
			missingUnits.length === 0 && duplicateUnits.length === 0
				? "passed"
				: "failed",
		expectedUnits: EXPECTED_SUCCESS_UNITS.map((unit) => unit.unitId),
		outputs,
		missingUnits,
		duplicateUnits,
		issue: issueText(issues),
	};
};

const buildCustomSubagentEvidence = (
	fanout: GeminiFanoutEvidence,
): GeminiCustomSubagentEvidence => {
	const alpha = fanout.outputs.find((output) => output.unitId === "alpha");
	return {
		status: alpha?.status === "passed" ? "passed" : "failed",
		agentName: EXPECTED_SUCCESS_UNITS[0].agentName,
		expectedOutput: EXPECTED_SUCCESS_UNITS[0].marker,
		actualOutput: alpha?.output,
		issue: alpha?.issue,
	};
};

const isVisibleFailureStatus = (status: string | undefined): boolean => {
	if (!status) return false;
	const normalized = status.toLowerCase();
	return (
		normalized.includes("fail") ||
		normalized.includes("blocked") ||
		normalized.includes("intentional")
	);
};

const buildFailureHandlingEvidence = (
	payload: Record<string, unknown>,
	fanout: GeminiFanoutEvidence,
): GeminiDelegatedFailureEvidence => {
	const agentName = stringField(payload, "failing_agent");
	const output = stringField(payload, "failing_output");
	const error = stringField(payload, "failing_error");
	const statusText = stringField(payload, "failing_status");
	const message = error ?? output;
	const issues: string[] = [];

	if (!agentName) {
		issues.push("missing failing agent name");
	} else if (
		normalizeAgentName(agentName) !== EXPECTED_FAILURE_UNIT.agentName
	) {
		issues.push(
			`expected failing agent ${EXPECTED_FAILURE_UNIT.agentName}, got ${agentName}`,
		);
	}

	if (!message) {
		issues.push("missing visible failure message");
	}

	if (!isVisibleFailureStatus(statusText)) {
		issues.push("missing visible failure status");
	}

	const failedUnitVisible = issues.length === 0;
	const preservedOutputs = fanout.outputs.filter(
		(output) => output.status === "passed",
	);
	const successfulOutputsPreserved =
		preservedOutputs.length === EXPECTED_SUCCESS_UNITS.length;
	const failure: GeminiDelegatedFailure = {
		unitId: EXPECTED_FAILURE_UNIT.unitId,
		agentName: agentName ?? EXPECTED_FAILURE_UNIT.agentName,
		status: failedUnitVisible ? "failed" : "incomplete",
		expectedFailure: true,
		message: message ?? statusText,
	};

	const handlingIssues = [
		issueText(issues),
		successfulOutputsPreserved
			? undefined
			: "successful alpha and beta outputs were not preserved",
	].filter((issue): issue is string => issue !== undefined);

	return {
		status:
			failedUnitVisible && successfulOutputsPreserved ? "passed" : "failed",
		failedUnitVisible,
		successfulOutputsPreserved,
		failures: [failure],
		preservedOutputs,
		issue: issueText(handlingIssues),
	};
};

const parseAcknowledgementScope = (
	value: string | undefined,
): GeminiAcknowledgementScope => {
	switch (value) {
		case "project":
		case "workspace":
		case "user":
		case "extension":
			return value;
		default:
			return "extension";
	}
};

const buildAcknowledgementEvidence = (
	payload: Record<string, unknown>,
): GeminiAcknowledgementEvidence => {
	const required =
		booleanField(payload, "acknowledgement_required") ??
		booleanField(payload, "ack_required") ??
		false;

	const caveats: GeminiAcknowledgementCaveat[] = required
		? [
				{
					scope: parseAcknowledgementScope(
						stringField(payload, "acknowledgement_scope"),
					),
					required: true,
					affectedWorkflowClasses: GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES,
					reason:
						stringField(payload, "acknowledgement_reason") ??
						"Gemini requires acknowledgement or setup before validation agents can run.",
					userAction:
						stringField(payload, "acknowledgement_user_action") ??
						"Enable the rp1 Gemini extension, restart Gemini CLI, and complete any acknowledgement Gemini prompts for.",
				},
			]
		: [];

	return {
		status: required ? "blocked" : "passed",
		usableWithoutExtraAcknowledgement: !required,
		caveats,
		issue: required ? caveats[0]?.reason : undefined,
	};
};

const overallStatusFor = (
	customSubagent: GeminiCustomSubagentEvidence,
	fanout: GeminiFanoutEvidence,
	failureHandling: GeminiDelegatedFailureEvidence,
	acknowledgement: GeminiAcknowledgementEvidence,
): GeminiDelegationEvidenceStatus => {
	if (acknowledgement.status === "blocked") return "blocked";
	if (
		customSubagent.status === "passed" &&
		fanout.status === "passed" &&
		failureHandling.status === "passed"
	) {
		return "passed";
	}
	return "failed";
};

const statusReason = (status: GeminiDelegationEvidenceStatus): string => {
	switch (status) {
		case "passed":
			return "Gemini P2 delegation evidence passed; heavyweight workflow classes remain experimental until maintainers upgrade support policy.";
		case "blocked":
			return "Gemini delegation validation is blocked by acknowledgement, trust, setup, or invocation requirements.";
		case "failed":
			return "Gemini delegation validation failed because one or more expected delegated outputs were missing, duplicated, malformed, or not visibly failed.";
		case "incomplete":
			return "Gemini delegation validation is incomplete.";
		case "not_run":
			return GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON;
	}
};

const buildWorkflowClassifications = (
	status: GeminiDelegationEvidenceStatus,
	evidenceArtifactPath: string,
): readonly GeminiWorkflowSupportClassification[] =>
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES.map((workflowClass) => ({
		workflowClass,
		status: status === "passed" ? "experimental" : "blocked",
		reason: statusReason(status),
		evidenceArtifactPath,
		evidenceStatus: status,
	}));

export const createGeminiSubagentEvidence = (
	context: GeminiSubagentEvidenceContext & {
		readonly parentPayload: unknown;
	},
): GeminiDelegationEvidence => {
	const payload = isRecord(context.parentPayload) ? context.parentPayload : {};
	const featureId = safeFeatureId(context.featureId);
	const fanout = buildFanoutEvidence(payload);
	const customSubagent = buildCustomSubagentEvidence(fanout);
	const failureHandling = buildFailureHandlingEvidence(payload, fanout);
	const acknowledgement = buildAcknowledgementEvidence(payload);
	const overallStatus = overallStatusFor(
		customSubagent,
		fanout,
		failureHandling,
		acknowledgement,
	);
	const { markdownRelativePath } =
		getGeminiSubagentEvidenceRelativePaths(featureId);

	return {
		featureId,
		runId: context.runId.trim(),
		geminiVersion: context.geminiVersion?.trim() || "unknown",
		customSubagent,
		fanout,
		failureHandling,
		acknowledgement,
		workflowClasses: buildWorkflowClassifications(
			overallStatus,
			markdownRelativePath,
		),
		overallStatus,
	};
};

const renderStatus = (status: GeminiDelegationEvidenceStatus): string =>
	status.toUpperCase();

const renderList = (values: readonly string[]): string =>
	values.length > 0 ? values.join(", ") : "none";

const renderOutputRows = (
	outputs: readonly GeminiFanoutOutput[],
): readonly string[] => [
	"| Unit | Agent | Status | Expected Marker | Actual Marker | Issue |",
	"|------|-------|--------|-----------------|---------------|-------|",
	...outputs.map(
		(output) =>
			`| ${output.unitId} | ${output.agentName} | ${output.status} | ${output.expectedMarker} | ${output.actualMarker ?? "missing"} | ${output.issue ?? "none"} |`,
	),
];

const renderFailureRows = (
	failures: readonly GeminiDelegatedFailure[],
): readonly string[] => [
	"| Unit | Agent | Status | Expected Failure | Message |",
	"|------|-------|--------|------------------|---------|",
	...failures.map(
		(failure) =>
			`| ${failure.unitId} | ${failure.agentName} | ${failure.status} | ${String(failure.expectedFailure)} | ${failure.message ?? "none"} |`,
	),
];

const renderCaveatRows = (
	caveats: readonly GeminiAcknowledgementCaveat[],
): readonly string[] =>
	caveats.length > 0
		? [
				"| Scope | Required | Affected Workflows | Reason | User Action |",
				"|-------|----------|--------------------|--------|-------------|",
				...caveats.map(
					(caveat) =>
						`| ${caveat.scope} | ${String(caveat.required)} | ${caveat.affectedWorkflowClasses.join(", ")} | ${caveat.reason} | ${caveat.userAction} |`,
				),
			]
		: ["No acknowledgement caveats were reported."];

const renderClassificationRows = (
	classifications: readonly GeminiWorkflowSupportClassification[],
): readonly string[] => [
	"| Workflow Class | Status | Evidence Status | Reason | Evidence |",
	"|----------------|--------|-----------------|--------|----------|",
	...classifications.map(
		(classification) =>
			`| ${classification.workflowClass} | ${classification.status} | ${classification.evidenceStatus ?? "none"} | ${classification.reason} | ${classification.evidenceArtifactPath ?? "none"} |`,
	),
];

export const renderGeminiSubagentEvidenceMarkdown = (
	evidence: GeminiDelegationEvidence,
	context: { readonly runContext?: string } = {},
): string =>
	[
		"# Gemini Subagent Validation Evidence",
		"",
		"## Summary",
		"",
		`- feature_id: ${evidence.featureId}`,
		`- run_id: ${evidence.runId}`,
		`- run_context: ${context.runContext?.trim() || "none"}`,
		`- gemini_version: ${evidence.geminiVersion}`,
		`- overall_status: ${evidence.overallStatus}`,
		`- custom_subagent: ${evidence.customSubagent.status}`,
		`- fanout: ${evidence.fanout.status}`,
		`- delegated_failure_handling: ${evidence.failureHandling.status}`,
		`- acknowledgement: ${evidence.acknowledgement.status}`,
		"",
		"## Expected Outputs",
		"",
		`- alpha: ${GEMINI_SUBAGENT_MARKERS.alpha}`,
		`- beta: ${GEMINI_SUBAGENT_MARKERS.beta}`,
		`- intentional_runtime_failure: ${EXPECTED_FAILURE_UNIT.agentName} reports failing_status=failed and a failure message`,
		"",
		"## Attribution",
		"",
		...renderOutputRows(evidence.fanout.outputs),
		"",
		`Missing units: ${renderList(evidence.fanout.missingUnits)}`,
		`Duplicate units: ${renderList(evidence.fanout.duplicateUnits)}`,
		`Fanout issue: ${evidence.fanout.issue ?? "none"}`,
		"",
		"## Delegated Failure",
		"",
		`- failed_unit_visible: ${String(evidence.failureHandling.failedUnitVisible)}`,
		`- successful_outputs_preserved: ${String(evidence.failureHandling.successfulOutputsPreserved)}`,
		`- issue: ${evidence.failureHandling.issue ?? "none"}`,
		"",
		...renderFailureRows(evidence.failureHandling.failures),
		"",
		"## Acknowledgement Caveats",
		"",
		`- usable_without_extra_acknowledgement: ${String(evidence.acknowledgement.usableWithoutExtraAcknowledgement)}`,
		`- issue: ${evidence.acknowledgement.issue ?? "none"}`,
		"",
		...renderCaveatRows(evidence.acknowledgement.caveats),
		"",
		"## Support Classification",
		"",
		...renderClassificationRows(evidence.workflowClasses),
		"",
		`Validation result: ${renderStatus(evidence.overallStatus)}`,
		"",
	].join("\n");

export const writeGeminiSubagentEvidenceArtifacts = async (
	options: GeminiSubagentEvidenceWriteOptions,
): Promise<GeminiSubagentEvidenceArtifactResult> => {
	const evidence = createGeminiSubagentEvidence(options);
	const { markdownRelativePath, jsonRelativePath } =
		getGeminiSubagentEvidenceRelativePaths(evidence.featureId);
	const markdownPath = join(options.workRoot, markdownRelativePath);
	const jsonPath = join(options.workRoot, jsonRelativePath);
	const markdown = renderGeminiSubagentEvidenceMarkdown(evidence, {
		runContext: options.runContext,
	});

	await mkdir(dirname(markdownPath), { recursive: true });
	await writeFile(markdownPath, markdown, "utf-8");
	await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");

	return {
		evidence,
		markdownPath,
		jsonPath,
		markdownRelativePath,
		jsonRelativePath,
	};
};

const defaultCommandRunner: GeminiSubagentEvidenceCommandRunner = async (
	command,
) => {
	const proc = Bun.spawn([...command], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	return {
		exitCode,
		stdout,
		stderr,
	};
};

const runRp1Emit = (
	options: GeminiSubagentEvidencePersistOptions,
	args: readonly string[],
): Promise<GeminiSubagentEvidenceCommandResult> => {
	const commandRunner = options.commandRunner ?? defaultCommandRunner;
	const rp1Command = options.rp1Command ?? ["rp1"];
	return commandRunner([...rp1Command, "agent-tools", "emit", ...args]);
};

const artifactRegistrationData = (
	path: string,
	featureId: string,
	format: "markdown" | "json",
): string =>
	JSON.stringify({
		path,
		feature: featureId,
		storageRoot: "work_dir",
		format,
		harness: GEMINI_SUBAGENT_HARNESS,
	});

const registrationArgs = (
	options: GeminiSubagentEvidencePersistOptions,
	path: string,
	format: "markdown" | "json",
): readonly string[] => [
	"--harness",
	options.harness ?? GEMINI_SUBAGENT_HARNESS,
	"--workflow",
	options.workflow ?? GEMINI_SUBAGENT_WORKFLOW_NAME,
	"--type",
	"artifact_registered",
	"--run-id",
	options.runId,
	"--step",
	"validation",
	"--data",
	artifactRegistrationData(path, safeFeatureId(options.featureId), format),
];

const registrationFailures = (
	results: readonly GeminiSubagentEvidenceCommandResult[],
): readonly GeminiSubagentEvidenceCommandResult[] =>
	results.filter((result) => result.exitCode !== 0);

const terminalStepFor = (
	evidenceStatus: GeminiDelegationEvidenceStatus,
	hasRegistrationFailure: boolean,
): "completed" | "failed" | "blocked" => {
	if (hasRegistrationFailure) return "failed";
	if (evidenceStatus === "passed") return "completed";
	if (evidenceStatus === "blocked") return "blocked";
	return "failed";
};

const terminalDataFor = (
	evidence: GeminiDelegationEvidence,
	hasRegistrationFailure: boolean,
): string => {
	const classification = hasRegistrationFailure
		? "failed"
		: evidence.overallStatus;
	const status = classification === "passed" ? "completed" : "failed";
	const reason = hasRegistrationFailure
		? "Artifact registration failed after Gemini subagent evidence was written."
		: statusReason(evidence.overallStatus);

	return JSON.stringify({
		status,
		feature: evidence.featureId,
		classification,
		reason,
	});
};

const terminalStatusArgs = (
	options: GeminiSubagentEvidencePersistOptions,
	evidence: GeminiDelegationEvidence,
	hasRegistrationFailure: boolean,
): readonly string[] => [
	"--harness",
	options.harness ?? GEMINI_SUBAGENT_HARNESS,
	"--workflow",
	options.workflow ?? GEMINI_SUBAGENT_WORKFLOW_NAME,
	"--type",
	"status_change",
	"--run-id",
	options.runId,
	"--step",
	terminalStepFor(evidence.overallStatus, hasRegistrationFailure),
	"--data",
	terminalDataFor(evidence, hasRegistrationFailure),
	"--close-run",
];

export const persistGeminiSubagentEvidence = async (
	options: GeminiSubagentEvidencePersistOptions,
): Promise<GeminiSubagentEvidencePersistResult> => {
	const artifactResult = await writeGeminiSubagentEvidenceArtifacts(options);
	const registrationResults = await Promise.all([
		runRp1Emit(
			options,
			registrationArgs(
				options,
				artifactResult.markdownRelativePath,
				"markdown",
			),
		),
		runRp1Emit(
			options,
			registrationArgs(options, artifactResult.jsonRelativePath, "json"),
		),
	]);
	const terminalStatusResult = await runRp1Emit(
		options,
		terminalStatusArgs(
			options,
			artifactResult.evidence,
			registrationFailures(registrationResults).length > 0,
		),
	);

	return {
		...artifactResult,
		registrationResults,
		terminalStatusResult,
	};
};
