import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import type {
	GeminiLifecycleStage,
	GeminiLifecycleState,
} from "./lifecycle.js";
import type { GeminiWorkflowSupportClassification } from "./models.js";
import { GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES } from "./models.js";

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

export interface GeminiBoundaryEvidenceContext {
	readonly featureId: string;
	readonly runId: string;
	readonly geminiVersion?: string;
	readonly runContext?: string;
}

export interface GeminiBoundaryEvidenceWriteOptions
	extends GeminiBoundaryEvidenceContext {
	readonly workRoot: string;
	readonly scenarios: readonly GeminiBoundaryScenarioEvidence[];
	readonly mergeExisting?: boolean;
}

export interface GeminiBoundaryEvidenceArtifactResult {
	readonly evidence: GeminiBoundaryEvidence;
	readonly markdownPath: string;
	readonly jsonPath: string;
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
}

export interface GeminiBoundaryEvidenceCommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type GeminiBoundaryEvidenceCommandRunner = (
	command: readonly string[],
) => Promise<GeminiBoundaryEvidenceCommandResult>;

export interface GeminiBoundaryEvidencePersistOptions
	extends GeminiBoundaryEvidenceWriteOptions {
	readonly workflow?: string;
	readonly harness?: string;
	readonly rp1Command?: readonly string[];
	readonly commandRunner?: GeminiBoundaryEvidenceCommandRunner;
}

export interface GeminiBoundaryEvidencePersistResult
	extends GeminiBoundaryEvidenceArtifactResult {
	readonly registrationResults: readonly GeminiBoundaryEvidenceCommandResult[];
	readonly terminalStatusResult: GeminiBoundaryEvidenceCommandResult;
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

const STATUS_SEVERITY: Record<GeminiBoundaryStatus, number> = {
	passed: 0,
	not_run: 1,
	degraded: 2,
	unsupported: 3,
	blocked: 4,
	failed: 5,
};

const overallStatusFor = (
	scenarios: readonly GeminiBoundaryScenarioEvidence[],
): GeminiBoundaryStatus => {
	if (scenarios.length === 0) return "not_run";

	return scenarios.reduce<GeminiBoundaryStatus>(
		(current, scenario) =>
			STATUS_SEVERITY[scenario.status] > STATUS_SEVERITY[current]
				? scenario.status
				: current,
		"passed",
	);
};

const statusReason = (status: GeminiBoundaryStatus): string => {
	switch (status) {
		case "passed":
			return "Gemini boundary evidence passed for the recorded scenario; workflow support remains scoped by the Gemini support matrix.";
		case "degraded":
			return "Gemini boundary evidence recorded a recoverable degraded condition with a user action.";
		case "blocked":
			return "Gemini boundary evidence is blocked by trust, approval, auth, lifecycle, or user input requirements.";
		case "unsupported":
			return "Gemini boundary evidence recorded an unsupported Gemini automation boundary.";
		case "failed":
			return "Gemini boundary evidence failed while recording or classifying the scenario.";
		case "not_run":
			return "Gemini boundary evidence has not recorded a completed scenario.";
	}
};

const buildWorkflowClassifications = (
	status: GeminiBoundaryStatus,
	evidenceArtifactPath: string,
): readonly GeminiWorkflowSupportClassification[] =>
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES.map((workflowClass) => ({
		workflowClass,
		status:
			status === "unsupported"
				? "unsupported"
				: status === "passed" || status === "degraded"
					? "experimental"
					: "blocked",
		reason: statusReason(status),
		evidenceArtifactPath,
		evidenceStatus:
			status === "passed"
				? "passed"
				: status === "not_run"
					? "not_run"
					: status === "blocked" || status === "unsupported"
						? "blocked"
						: "failed",
	}));

const scenarioKey = (scenario: GeminiBoundaryScenarioEvidence): string =>
	`${scenario.scenario}:${scenario.mode}`;

const normalizeScenarios = (
	scenarios: readonly GeminiBoundaryScenarioEvidence[],
	markdownRelativePath: string,
): readonly GeminiBoundaryScenarioEvidence[] => {
	const byKey = new Map<string, GeminiBoundaryScenarioEvidence>();
	for (const scenario of scenarios) {
		const evidenceArtifactPath =
			scenario.evidenceArtifactPath ?? markdownRelativePath;
		byKey.set(scenarioKey(scenario), {
			...scenario,
			workflowClasses:
				scenario.workflowClasses.length > 0
					? scenario.workflowClasses
					: buildWorkflowClassifications(scenario.status, evidenceArtifactPath),
			evidenceArtifactPath,
		});
	}
	return [...byKey.values()];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isBoundaryEvidence = (
	value: unknown,
	featureId: string,
): value is GeminiBoundaryEvidence =>
	isRecord(value) &&
	value.schemaVersion === GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION &&
	value.featureId === featureId &&
	Array.isArray(value.scenarios);

const readExistingEvidence = async (
	jsonPath: string,
	featureId: string,
): Promise<readonly GeminiBoundaryScenarioEvidence[]> => {
	try {
		const parsed = JSON.parse(await readFile(jsonPath, "utf-8")) as unknown;
		return isBoundaryEvidence(parsed, featureId) ? parsed.scenarios : [];
	} catch {
		return [];
	}
};

export const createGeminiBoundaryEvidence = (
	context: GeminiBoundaryEvidenceContext & {
		readonly scenarios: readonly GeminiBoundaryScenarioEvidence[];
	},
): GeminiBoundaryEvidence => {
	const featureId = safeFeatureId(context.featureId);
	const { markdownRelativePath } =
		getGeminiBoundaryEvidenceRelativePaths(featureId);
	const scenarios = normalizeScenarios(context.scenarios, markdownRelativePath);
	const overallStatus = overallStatusFor(scenarios);

	return {
		schemaVersion: GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
		featureId,
		runId: context.runId.trim(),
		geminiVersion: context.geminiVersion?.trim() || "unknown",
		runContext: context.runContext?.trim() || "none",
		scenarios,
		overallStatus,
		workflowClasses: buildWorkflowClassifications(
			overallStatus,
			markdownRelativePath,
		),
	};
};

const cell = (value: string | boolean | null | undefined): string =>
	String(value ?? "none")
		.replaceAll("|", "\\|")
		.replaceAll(/\r?\n/g, " ");

const renderScenarioRows = (
	scenarios: readonly GeminiBoundaryScenarioEvidence[],
): readonly string[] => [
	"| Scenario | Mode | Status | State | Resume Supported | Blocker | User Action | Lifecycle | Evidence |",
	"|----------|------|--------|-------|------------------|---------|-------------|-----------|----------|",
	...scenarios.map(
		(scenario) =>
			`| ${cell(scenario.scenario)} | ${cell(scenario.mode)} | ${cell(scenario.status)} | ${cell(scenario.state)} | ${cell(scenario.resumeSupported)} | ${cell(scenario.blocker)} | ${cell(scenario.userAction)} | ${cell(scenario.lifecycleStage ?? null)}:${cell(scenario.lifecycleState ?? null)} | ${cell(scenario.evidenceArtifactPath)} |`,
	),
];

const renderClassificationRows = (
	classifications: readonly GeminiWorkflowSupportClassification[],
): readonly string[] => [
	"| Workflow Class | Status | Evidence Status | Reason | Evidence |",
	"|----------------|--------|-----------------|--------|----------|",
	...classifications.map(
		(classification) =>
			`| ${cell(classification.workflowClass)} | ${cell(classification.status)} | ${cell(classification.evidenceStatus)} | ${cell(classification.reason)} | ${cell(classification.evidenceArtifactPath)} |`,
	),
];

export const renderGeminiBoundaryEvidenceMarkdown = (
	evidence: GeminiBoundaryEvidence,
): string =>
	[
		"# Gemini Boundary Evidence",
		"",
		"## Summary",
		"",
		`- schema_version: ${evidence.schemaVersion}`,
		`- feature_id: ${evidence.featureId}`,
		`- run_id: ${evidence.runId}`,
		`- run_context: ${evidence.runContext}`,
		`- gemini_version: ${evidence.geminiVersion}`,
		`- overall_status: ${evidence.overallStatus}`,
		`- registration_status: pending`,
		"",
		"## Scenarios",
		"",
		...renderScenarioRows(evidence.scenarios),
		"",
		"## Support Classification",
		"",
		...renderClassificationRows(evidence.workflowClasses),
		"",
		`Boundary result: ${evidence.overallStatus.toUpperCase()}`,
		"",
	].join("\n");

export const writeGeminiBoundaryEvidenceArtifacts = async (
	options: GeminiBoundaryEvidenceWriteOptions,
): Promise<GeminiBoundaryEvidenceArtifactResult> => {
	const featureId = safeFeatureId(options.featureId);
	const { markdownRelativePath, jsonRelativePath } =
		getGeminiBoundaryEvidenceRelativePaths(featureId);
	const markdownPath = join(options.workRoot, markdownRelativePath);
	const jsonPath = join(options.workRoot, jsonRelativePath);
	const existingScenarios =
		options.mergeExisting === false
			? []
			: await readExistingEvidence(jsonPath, featureId);
	const evidence = createGeminiBoundaryEvidence({
		featureId,
		runId: options.runId,
		geminiVersion: options.geminiVersion,
		runContext: options.runContext,
		scenarios: [...existingScenarios, ...options.scenarios],
	});
	const markdown = renderGeminiBoundaryEvidenceMarkdown(evidence);

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

const defaultCommandRunner: GeminiBoundaryEvidenceCommandRunner = async (
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
	options: GeminiBoundaryEvidencePersistOptions,
	args: readonly string[],
): Promise<GeminiBoundaryEvidenceCommandResult> => {
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
		harness: GEMINI_BOUNDARY_HARNESS,
	});

const registrationArgs = (
	options: GeminiBoundaryEvidencePersistOptions,
	path: string,
	format: "markdown" | "json",
): readonly string[] => [
	"--harness",
	options.harness ?? GEMINI_BOUNDARY_HARNESS,
	"--workflow",
	options.workflow ?? GEMINI_BOUNDARY_WORKFLOW_NAME,
	"--type",
	"artifact_registered",
	"--run-id",
	options.runId,
	"--step",
	"evidence",
	"--data",
	artifactRegistrationData(path, safeFeatureId(options.featureId), format),
];

const registrationFailures = (
	results: readonly GeminiBoundaryEvidenceCommandResult[],
): readonly GeminiBoundaryEvidenceCommandResult[] =>
	results.filter((result) => result.exitCode !== 0);

const terminalStepFor = (
	evidenceStatus: GeminiBoundaryStatus,
	hasRegistrationFailure: boolean,
): "completed" | "unsupported" | "blocked" | "failed" => {
	if (hasRegistrationFailure) return "failed";
	switch (evidenceStatus) {
		case "unsupported":
			return "unsupported";
		case "blocked":
			return "blocked";
		case "failed":
			return "failed";
		case "passed":
		case "degraded":
		case "not_run":
			return "completed";
	}
};

const terminalDataFor = (
	evidence: GeminiBoundaryEvidence,
	hasRegistrationFailure: boolean,
): string => {
	const classification = hasRegistrationFailure
		? "failed"
		: evidence.overallStatus;
	const status =
		classification === "passed" ||
		classification === "degraded" ||
		classification === "not_run"
			? "completed"
			: "failed";
	const reason = hasRegistrationFailure
		? "Artifact registration failed after Gemini boundary evidence was written."
		: statusReason(evidence.overallStatus);

	return JSON.stringify({
		status,
		feature: evidence.featureId,
		classification,
		reason,
	});
};

const terminalStatusArgs = (
	options: GeminiBoundaryEvidencePersistOptions,
	evidence: GeminiBoundaryEvidence,
	hasRegistrationFailure: boolean,
): readonly string[] => [
	"--harness",
	options.harness ?? GEMINI_BOUNDARY_HARNESS,
	"--workflow",
	options.workflow ?? GEMINI_BOUNDARY_WORKFLOW_NAME,
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

export const persistGeminiBoundaryEvidence = async (
	options: GeminiBoundaryEvidencePersistOptions,
): Promise<GeminiBoundaryEvidencePersistResult> => {
	const artifactResult = await writeGeminiBoundaryEvidenceArtifacts(options);
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
