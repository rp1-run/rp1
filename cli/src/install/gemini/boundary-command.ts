import {
	GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
	GEMINI_BOUNDARY_HARNESS,
	GEMINI_BOUNDARY_JSON_FILENAME,
	GEMINI_BOUNDARY_MARKDOWN_FILENAME,
	GEMINI_BOUNDARY_WORKFLOW_NAME,
} from "./boundary-evidence.js";
import {
	GEMINI_EXTENSION_DISPLAY_DIR,
	GEMINI_EXTENSION_RELATIVE_DIR,
} from "./smoke-command.js";

export const GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/commands/rp1/boundaries.toml`;

export const GEMINI_BOUNDARY_COMMAND_DISPLAY_PATH = `${GEMINI_EXTENSION_DISPLAY_DIR}/commands/rp1/boundaries.toml`;

export const GEMINI_BOUNDARY_COMMAND_INVOCATION =
	"/rp1:boundaries FEATURE_ID=<feature-id> SCENARIO=<scenario> MODE=<mode> STATUS=<status> STATE=<state>";

export const GEMINI_BOUNDARY_COMMAND_TOML = String.raw`description = "Experimental rp1 Gemini boundary evidence recorder."
prompt = '''
# rp1 Gemini Boundary Evidence

Record one Gemini P3 boundary scenario. This command is validation-only: it writes support-matrix-ready evidence and does not run full rp1 workflows or claim first-class Gemini support.

Arguments: {{args}}

Invocation: /rp1:boundaries FEATURE_ID=<feature-id> SCENARIO=<scenario> MODE=<mode> STATUS=<status> STATE=<state>

If Gemini blocks the shell command because auth, project trust, shell execution approval, sandbox approval, or headless command execution is required, report exactly:

Gemini boundary validation: blocked
State: blocked
Blocker: Gemini auth, trust, approval, or headless execution prevented boundary evidence collection.
User action: Complete the required Gemini auth, trust, approval, or interactive step, then retry /rp1:boundaries with the same FEATURE_ID and SCENARIO.

Shell output:
!{node - {{args}} <<'RP1_GEMINI_BOUNDARIES'
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;
const WORKFLOW = "gemini-harness-boundaries";
const HARNESS = "gemini-cli";
const MARKDOWN_FILENAME = "gemini-boundaries.md";
const JSON_FILENAME = "gemini-boundaries.json";
const COMMAND_PATH = path.join(
	process.env.HOME || "",
	".gemini/extensions/rp1-phase2-validation/commands/rp1/boundaries.toml",
);
const SCENARIOS = new Set([
	"user_input",
	"approval",
	"trust",
	"headless_no_gate",
	"headless_user_gate",
	"install_lifecycle",
	"verify_lifecycle",
	"update_lifecycle",
	"uninstall_lifecycle",
]);
const MODES = new Set(["interactive", "headless", "lifecycle"]);
const STATUSES = new Set([
	"passed",
	"degraded",
	"blocked",
	"unsupported",
	"failed",
	"not_run",
]);
const STATES = new Set([
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
]);
const STATUS_SEVERITY = {
	passed: 0,
	not_run: 1,
	degraded: 2,
	unsupported: 3,
	blocked: 4,
	failed: 5,
};
const HEAVYWEIGHT_WORKFLOWS = [
	"build_fast",
	"build",
	"knowledge_build",
	"deep_research",
	"pr_review",
];
const DEFAULTS = {
	user_input: {
		mode: "interactive",
		status: "blocked",
		state: "requires_user_input",
		blocker: "Gemini requires user input before this workflow can continue.",
		userAction: "Provide the requested input in Gemini, then retry or resume the tracked run.",
		resumeSupported: true,
	},
	approval: {
		mode: "interactive",
		status: "blocked",
		state: "requires_approval",
		blocker: "Gemini requires tool, shell, sandbox, or auth approval before this workflow can continue.",
		userAction: "Complete the required Gemini approval or auth step, then retry the boundary command.",
		resumeSupported: true,
	},
	trust: {
		mode: "interactive",
		status: "blocked",
		state: "requires_trust",
		blocker: "Gemini requires workspace trust before shell-backed rp1 evidence can run.",
		userAction: "Trust this workspace in Gemini, then retry /rp1:boundaries.",
		resumeSupported: true,
	},
	headless_no_gate: {
		mode: "headless",
		status: "passed",
		state: "headless_supported",
		blocker: null,
		userAction: "Use this artifact as evidence for a headless no-gate boundary result.",
		resumeSupported: true,
	},
	headless_user_gate: {
		mode: "headless",
		status: "unsupported",
		state: "headless_unsupported",
		blocker: "Gemini headless mode reached a user, trust, approval, or auth gate that cannot continue unattended.",
		userAction: "Satisfy the gate in an interactive Gemini session, then rerun the headless check.",
		resumeSupported: false,
	},
	install_lifecycle: {
		mode: "lifecycle",
		status: "not_run",
		state: "current",
		blocker: null,
		userAction: "Record the observed install lifecycle status with STATUS and STATE overrides.",
		resumeSupported: false,
		lifecycleStage: "install",
	},
	verify_lifecycle: {
		mode: "lifecycle",
		status: "not_run",
		state: "current",
		blocker: null,
		userAction: "Record the observed verify lifecycle status with STATUS and STATE overrides.",
		resumeSupported: false,
		lifecycleStage: "verify",
	},
	update_lifecycle: {
		mode: "lifecycle",
		status: "not_run",
		state: "unsupported_before_p3",
		blocker: "Named Gemini update support must be implemented explicitly in P3 before it can be treated as current.",
		userAction: "Run the explicit Gemini update route after P3 update support is implemented.",
		resumeSupported: false,
		lifecycleStage: "update",
	},
	uninstall_lifecycle: {
		mode: "lifecycle",
		status: "not_run",
		state: "unsupported_before_p3",
		blocker: "Named Gemini uninstall support must be implemented explicitly in P3 before it can be treated as current.",
		userAction: "Run the explicit Gemini uninstall route after P3 uninstall support is implemented.",
		resumeSupported: false,
		lifecycleStage: "uninstall",
	},
};

const outputOf = (result) =>
	[result.stdout, result.stderr, result.error ? result.error.message : ""]
		.filter(Boolean)
		.join("");

const statusOf = (result) =>
	typeof result.status === "number" ? result.status : 1;

const run = (command, args) =>
	cp.spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
		maxBuffer: 1024 * 1024 * 20,
	});

const localRp1CliPath = path.join(process.cwd(), "cli/src/main.ts");
const useLocalRp1Cli = fs.existsSync(localRp1CliPath);
const rp1Command = useLocalRp1Cli ? "bun" : "rp1";
const rp1Args = (args) =>
	useLocalRp1Cli ? ["run", localRp1CliPath, ...args] : args;
const runRp1 = (args) => run(rp1Command, rp1Args(args));

const printAndExit = (code, lines) => {
	for (const line of lines) {
		if (line !== undefined && line !== null && String(line).length > 0) {
			console.log(line);
		}
	}
	process.exit(code);
};

const parseBoundaryArgs = (tokens) => {
	const values = {};
	let positionalIndex = 0;

	for (const token of tokens) {
		const separator = token.indexOf("=");
		if (separator > 0) {
			const key = token.slice(0, separator).trim().toUpperCase();
			values[key] = token.slice(separator + 1).trim();
			continue;
		}

		const trimmed = token.trim();
		if (!trimmed) continue;
		if (positionalIndex === 0) values.FEATURE_ID = trimmed;
		if (positionalIndex === 1) values.SCENARIO = trimmed;
		if (positionalIndex === 2) values.MODE = trimmed;
		positionalIndex += 1;
	}

	return {
		rawArgs: tokens.join(" "),
		values,
	};
};

const boolValue = (value, fallback) => {
	if (value === undefined || value === null || value === "") return fallback;
	const normalized = String(value).trim().toLowerCase();
	if (normalized === "true" || normalized === "yes" || normalized === "1") {
		return true;
	}
	if (normalized === "false" || normalized === "no" || normalized === "0") {
		return false;
	}
	return fallback;
};

const requireAllowed = (label, value, allowed) => {
	if (allowed.has(value)) return null;
	return label + " must be one of: " + Array.from(allowed).join(", ");
};

const safeFeatureId = (featureId) => {
	const trimmed = String(featureId || "").trim();
	if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) return trimmed;
	return "";
};

const evidencePaths = (featureId) => ({
	markdownRelativePath: path.posix.join(
		"features",
		featureId,
		MARKDOWN_FILENAME,
	),
	jsonRelativePath: path.posix.join("features", featureId, JSON_FILENAME),
});

const statusReason = (status) => {
	switch (status) {
		case "passed":
			return "Gemini boundary evidence passed for the recorded scenario; Gemini remains experimental.";
		case "degraded":
			return "Gemini boundary evidence recorded a recoverable degraded condition with a user action.";
		case "blocked":
			return "Gemini boundary evidence is blocked by trust, approval, auth, lifecycle, or user input requirements.";
		case "unsupported":
			return "Gemini boundary evidence recorded an unsupported Gemini automation boundary.";
		case "failed":
			return "Gemini boundary evidence failed while recording or classifying the scenario.";
		default:
			return "Gemini boundary evidence has not recorded a completed scenario.";
	}
};

const workflowStatus = (status) => {
	if (status === "unsupported") return "unsupported";
	if (status === "passed" || status === "degraded") return "experimental";
	return "blocked";
};

const workflowEvidenceStatus = (status) => {
	if (status === "passed") return "passed";
	if (status === "not_run") return "not_run";
	if (status === "blocked" || status === "unsupported") return "blocked";
	return "failed";
};

const buildWorkflowClasses = (status, evidenceArtifactPath) =>
	HEAVYWEIGHT_WORKFLOWS.map((workflowClass) => ({
		workflowClass,
		status: workflowStatus(status),
		reason: statusReason(status),
		evidenceArtifactPath,
		evidenceStatus: workflowEvidenceStatus(status),
	}));

const scenarioKey = (scenario) => scenario.scenario + ":" + scenario.mode;

const overallStatusFor = (scenarios) => {
	let current = "passed";
	for (const scenario of scenarios) {
		if (STATUS_SEVERITY[scenario.status] > STATUS_SEVERITY[current]) {
			current = scenario.status;
		}
	}
	return scenarios.length === 0 ? "not_run" : current;
};

const cell = (value) =>
	String(value === undefined || value === null ? "none" : value)
		.replaceAll("|", "\\|")
		.replace(/\r?\n/g, " ");

const renderMarkdown = (evidence, registrationStatus) => {
	const scenarioRows = evidence.scenarios.map(
		(scenario) =>
			"| " +
			[
				scenario.scenario,
				scenario.mode,
				scenario.status,
				scenario.state,
				String(scenario.resumeSupported),
				scenario.blocker,
				scenario.userAction,
				(scenario.lifecycleStage || "none") +
					":" +
					(scenario.lifecycleState || "none"),
				scenario.evidenceArtifactPath,
			]
				.map(cell)
				.join(" | ") +
			" |",
	);
	const classificationRows = evidence.workflowClasses.map(
		(classification) =>
			"| " +
			[
				classification.workflowClass,
				classification.status,
				classification.evidenceStatus,
				classification.reason,
				classification.evidenceArtifactPath,
			]
				.map(cell)
				.join(" | ") +
			" |",
	);

	return [
		"# Gemini Boundary Evidence",
		"",
		"## Summary",
		"",
		"- schema_version: " + evidence.schemaVersion,
		"- feature_id: " + evidence.featureId,
		"- run_id: " + evidence.runId,
		"- run_context: " + evidence.runContext,
		"- gemini_version: " + evidence.geminiVersion,
		"- overall_status: " + evidence.overallStatus,
		"- registration_status: " + registrationStatus,
		"",
		"## Scenarios",
		"",
		"| Scenario | Mode | Status | State | Resume Supported | Blocker | User Action | Lifecycle | Evidence |",
		"|----------|------|--------|-------|------------------|---------|-------------|-----------|----------|",
		...scenarioRows,
		"",
		"## Support Classification",
		"",
		"| Workflow Class | Status | Evidence Status | Reason | Evidence |",
		"|----------------|--------|-----------------|--------|----------|",
		...classificationRows,
		"",
		"Boundary result: " + evidence.overallStatus.toUpperCase(),
		"",
	].join("\n");
};

const readExistingScenarios = (jsonPath, featureId) => {
	try {
		const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
		if (
			parsed &&
			parsed.schemaVersion === SCHEMA_VERSION &&
			parsed.featureId === featureId &&
			Array.isArray(parsed.scenarios)
		) {
			return parsed.scenarios;
		}
	} catch {}
	return [];
};

const createEvidence = (context) => {
	const byKey = new Map();
	for (const scenario of context.scenarios) {
		byKey.set(scenarioKey(scenario), scenario);
	}
	const scenarios = Array.from(byKey.values());
	const overallStatus = overallStatusFor(scenarios);

	return {
		schemaVersion: SCHEMA_VERSION,
		featureId: context.featureId,
		runId: context.runId,
		geminiVersion: context.geminiVersion,
		runContext: context.runContext || "none",
		scenarios,
		overallStatus,
		workflowClasses: buildWorkflowClasses(
			overallStatus,
			context.markdownRelativePath,
		),
	};
};

const terminalStepFor = (status, registrationFailed) => {
	if (registrationFailed || status === "failed") return "failed";
	if (status === "unsupported") return "unsupported";
	if (status === "blocked") return "blocked";
	return "completed";
};

const terminalStatusFor = (status, registrationFailed) => {
	if (registrationFailed) return "failed";
	if (status === "passed" || status === "degraded" || status === "not_run") {
		return "completed";
	}
	return "failed";
};

const emitStatus = (runId, step, data, closeRun) => {
	const args = [
		"agent-tools",
		"emit",
		"--harness",
		HARNESS,
		"--workflow",
		WORKFLOW,
		"--type",
		"status_change",
		"--run-id",
		runId,
		"--step",
		step,
		"--data",
		JSON.stringify(data),
	];
	if (closeRun) args.push("--close-run");
	return runRp1(args);
};

const emitArtifact = (runId, step, featureId, artifactPath, format) =>
	runRp1([
		"agent-tools",
		"emit",
		"--harness",
		HARNESS,
		"--workflow",
		WORKFLOW,
		"--type",
		"artifact_registered",
		"--run-id",
		runId,
		"--step",
		step,
		"--data",
		JSON.stringify({
			path: artifactPath,
			feature: featureId,
			storageRoot: "work_dir",
			format,
			harness: HARNESS,
		}),
	]);

const tokens = process.argv.slice(2);
const parsed = parseBoundaryArgs(tokens);
const featureId = safeFeatureId(parsed.values.FEATURE_ID);
if (!featureId) {
	printAndExit(2, [
		"Gemini boundary validation: blocked",
		"State: blocked",
		"Blocker: missing or invalid FEATURE_ID.",
		"User action: Retry with FEATURE_ID=gemini-phase-3 or another feature id using letters, numbers, dots, underscores, or dashes.",
	]);
}

const scenario = String(parsed.values.SCENARIO || "").trim();
if (!scenario || !SCENARIOS.has(scenario)) {
	printAndExit(2, [
		"Gemini boundary validation: blocked",
		"State: blocked",
		"Blocker: " + (requireAllowed("SCENARIO", scenario, SCENARIOS) || "missing SCENARIO."),
		"User action: Retry with SCENARIO=user_input, approval, trust, headless_no_gate, headless_user_gate, install_lifecycle, verify_lifecycle, update_lifecycle, or uninstall_lifecycle.",
	]);
}

const defaults = DEFAULTS[scenario];
let mode = String(parsed.values.MODE || defaults.mode).trim();
let status = String(parsed.values.STATUS || defaults.status).trim();
let state = String(parsed.values.STATE || defaults.state).trim();
const invalidMode = requireAllowed("MODE", mode, MODES);
const invalidStatus = requireAllowed("STATUS", status, STATUSES);
const invalidState = requireAllowed("STATE", state, STATES);
if (invalidMode || invalidStatus || invalidState) {
	printAndExit(2, [
		"Gemini boundary validation: blocked",
		"State: blocked",
		"Blocker: " + [invalidMode, invalidStatus, invalidState].filter(Boolean).join("; "),
		"User action: Retry with supported MODE, STATUS, and STATE values.",
	]);
}

if (
	mode === "headless" &&
	["user_input", "approval", "trust", "headless_user_gate"].includes(scenario) &&
	!parsed.values.STATUS
) {
	status = "unsupported";
	state = "headless_unsupported";
}

const versionResult = run("gemini", ["--version"]);
if (versionResult.error && versionResult.error.code === "ENOENT") {
	printAndExit(127, [
		"Gemini boundary validation: blocked",
		"State: blocked",
		"Blocker: Gemini CLI binary was not found in PATH while running the boundary command.",
		"User action: Install Gemini CLI or fix PATH, then run rp1 verify gemini.",
	]);
}

if (!fs.existsSync(COMMAND_PATH)) {
	printAndExit(2, [
		"Gemini boundary validation: blocked",
		"State: missing",
		"Blocker: Gemini boundary command is missing at " + COMMAND_PATH + ".",
		"User action: Run rp1 install gemini, then retry /rp1:boundaries.",
	]);
}

const geminiVersion =
	outputOf(versionResult)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean) || "unavailable";
const runContext = String(parsed.values.RUN_CONTEXT || "").trim();
const bootstrapArgs = [featureId, runContext].filter(Boolean).join(" ");
const bootstrapResult = runRp1([
	"agent-tools",
	"workflow-bootstrap",
	"--name",
	WORKFLOW,
	"--schema-path",
	"plugins/dev/skills/gemini-harness-boundaries/SKILL.md",
	"--args",
	bootstrapArgs,
	"--project-root",
	process.cwd(),
	"--harness",
	HARNESS,
]);
const bootstrapText = outputOf(bootstrapResult);
if (statusOf(bootstrapResult) !== 0) {
	printAndExit(statusOf(bootstrapResult), [
		"Gemini boundary validation: blocked",
		"State: blocked",
		"Blocker: root resolution failed. Missing or invalid rp1 project context.",
		"User action: Run from an initialized rp1 checkout or worktree, or run rp1 init before retrying.",
		bootstrapText.trim(),
	]);
}

let bootstrap;
try {
	bootstrap = JSON.parse(bootstrapResult.stdout || "{}");
} catch (error) {
	printAndExit(1, [
		"Gemini boundary validation: failed",
		"State: blocked",
		"Blocker: workflow-bootstrap returned non-JSON output.",
		"User action: Rerun with rp1 --verbose or inspect workflow-bootstrap output.",
		bootstrapText.trim(),
	]);
}

if (!bootstrap.success) {
	printAndExit(1, [
		"Gemini boundary validation: failed",
		"State: blocked",
		"Blocker: workflow-bootstrap returned an unsuccessful result.",
		"User action: Inspect the bootstrap error and retry from a valid rp1 project context.",
		bootstrap.error || bootstrapText.trim(),
	]);
}

const data = bootstrap.data;
const resolvedFeatureId = String(data.arguments.FEATURE_ID || featureId).trim();
const resolvedRunContext = String(data.arguments.RUN_CONTEXT || runContext).trim();
const paths = evidencePaths(resolvedFeatureId);
const markdownPath = path.join(data.directories.workRoot, paths.markdownRelativePath);
const jsonPath = path.join(data.directories.workRoot, paths.jsonRelativePath);
const workflowClasses = buildWorkflowClasses(status, paths.markdownRelativePath);
const scenarioEvidence = {
	scenario,
	mode,
	status,
	state,
	blocker: parsed.values.BLOCKER || defaults.blocker || null,
	userAction: parsed.values.USER_ACTION || defaults.userAction || null,
	resumeSupported: boolValue(parsed.values.RESUME_SUPPORTED, defaults.resumeSupported),
	workflowClasses,
	evidenceArtifactPath: paths.markdownRelativePath,
	lifecycleStage: defaults.lifecycleStage,
	lifecycleState: defaults.lifecycleStage ? state : undefined,
};

emitStatus(data.run.runId, "boundary", {
	status: "running",
	feature: resolvedFeatureId,
	scenario,
	mode,
});
emitStatus(data.run.runId, "evidence", {
	status: "running",
	feature: resolvedFeatureId,
	scenario,
	mode,
});

try {
	fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
} catch (error) {
	emitStatus(
		data.run.runId,
		"failed",
		{
			status: "failed",
			feature: resolvedFeatureId,
			classification: "failed",
			reason: "Artifact directory creation failed.",
		},
		true,
	);
	printAndExit(1, [
		"Gemini boundary validation: failed",
		"State: failed",
		"Run: " + data.run.runId,
		"Blocker: artifact directory creation failed.",
		"User action: Check .rp1/work permissions and available disk space, then retry.",
		error instanceof Error ? error.message : String(error),
	]);
}

const existingScenarios = readExistingScenarios(jsonPath, resolvedFeatureId);
const evidence = createEvidence({
	featureId: resolvedFeatureId,
	runId: data.run.runId,
	geminiVersion,
	runContext: resolvedRunContext || "none",
	markdownRelativePath: paths.markdownRelativePath,
	scenarios: [...existingScenarios, scenarioEvidence],
});

try {
	fs.writeFileSync(markdownPath, renderMarkdown(evidence, "pending"));
	fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2) + "\n");
} catch (error) {
	emitStatus(
		data.run.runId,
		"failed",
		{
			status: "failed",
			feature: resolvedFeatureId,
			classification: "failed",
			reason: "Artifact write failed.",
		},
		true,
	);
	printAndExit(1, [
		"Gemini boundary validation: failed",
		"State: failed",
		"Run: " + data.run.runId,
		"Blocker: artifact write failed.",
		"User action: Check .rp1/work permissions and available disk space, then retry.",
		error instanceof Error ? error.message : String(error),
	]);
}

const registrations = [
	emitArtifact(data.run.runId, "evidence", resolvedFeatureId, paths.markdownRelativePath, "markdown"),
	emitArtifact(data.run.runId, "evidence", resolvedFeatureId, paths.jsonRelativePath, "json"),
];
const registrationFailed = registrations.some((result) => statusOf(result) !== 0);
const registrationOutput = registrations.map(outputOf).filter(Boolean).join("\n");
const registrationStatus = registrationFailed ? "registration_failed" : "registered";
fs.writeFileSync(
	markdownPath,
	renderMarkdown(evidence, registrationStatus) +
		(registrationOutput.trim()
			? "\n## Registration Output\n\n" + registrationOutput.trim() + "\n"
			: ""),
);

const terminalStep = terminalStepFor(evidence.overallStatus, registrationFailed);
const terminalStatus = terminalStatusFor(evidence.overallStatus, registrationFailed);
emitStatus(
	data.run.runId,
	terminalStep,
	{
		status: terminalStatus,
		feature: resolvedFeatureId,
		classification: registrationFailed ? "failed" : evidence.overallStatus,
		reason: registrationFailed
			? "Artifact registration failed after Gemini boundary evidence was written."
			: statusReason(evidence.overallStatus),
	},
	true,
);

if (registrationFailed) {
	console.log("Gemini boundary validation: degraded");
	console.log("State: registration_failed");
	console.log("Run: " + data.run.runId);
	console.log("Artifacts:");
	console.log("- " + paths.markdownRelativePath);
	console.log("- " + paths.jsonRelativePath);
	console.log("Registration: registration_failed");
	console.log("Blocker: artifact registration failed after boundary evidence was written.");
	console.log("User action: Inspect Registration Output in " + paths.markdownRelativePath + ", fix the rp1 emit failure, then rerun the boundary command.");
	if (registrationOutput.trim()) console.log(registrationOutput.trim());
	process.exit(1);
}

console.log("Gemini boundary validation: " + evidence.overallStatus);
console.log("State: " + state);
console.log("Run: " + data.run.runId);
console.log("Artifacts:");
console.log("- " + paths.markdownRelativePath);
console.log("- " + paths.jsonRelativePath);
console.log("Registration: registered");
if (scenarioEvidence.blocker) console.log("Blocker: " + scenarioEvidence.blocker);
if (scenarioEvidence.userAction) console.log("User action: " + scenarioEvidence.userAction);
console.log("Classification: experimental boundary evidence only");
RP1_GEMINI_BOUNDARIES
}

Report exactly:
- Gemini boundary validation
- State
- Run, when printed
- Artifacts, when printed
- Registration, when printed
- Blocker, only if status is blocked, degraded, unsupported, or failed
- User action, when printed
- Classification, when printed

Do not inspect or modify any files outside the generated Gemini boundary evidence artifacts. Do not continue with unrelated analysis after reporting the shell output.
'''
`;

export const GEMINI_BOUNDARY_COMMAND_PROMPT_CONTRACT = {
	schemaVersion: GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
	workflow: GEMINI_BOUNDARY_WORKFLOW_NAME,
	harness: GEMINI_BOUNDARY_HARNESS,
	markdownFilename: GEMINI_BOUNDARY_MARKDOWN_FILENAME,
	jsonFilename: GEMINI_BOUNDARY_JSON_FILENAME,
} as const;
