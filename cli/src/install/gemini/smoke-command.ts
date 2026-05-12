export const GEMINI_SMOKE_COMMAND_RELATIVE_PATH =
	".gemini/commands/rp1/smoke.toml";

export const GEMINI_SMOKE_COMMAND_DISPLAY_PATH =
	"~/.gemini/commands/rp1/smoke.toml";

export const GEMINI_SMOKE_COMMAND_TOML = String.raw`description = "Experimental rp1 smoke workflow for Gemini CLI."
prompt = '''
# rp1 Gemini Harness Smoke

Run this experimental smoke once. It validates only argument delivery, rp1 root resolution, work-root artifact writing, and artifact registration.

If Gemini blocks the shell command because project trust, shell execution approval, or sandbox approval is required, report exactly:

Gemini smoke status: blocked
State: degraded_trust_or_approval
Blocker: Gemini trust or approval prevented shell execution.
User action: Approve Gemini shell execution or trust this project, then retry the smoke command.

Shell output:
!{node - {{args}} <<'RP1_GEMINI_SMOKE'
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rawArgs = process.argv.slice(2).join(" ");
const commandPath = path.join(
	process.env.HOME || "",
	".gemini/commands/rp1/smoke.toml",
);

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
		console.log(line);
	}
	process.exit(code);
};

const parseSmokeArgs = (input) => {
	let featureId = "";
	let runContext = "";

	for (const token of input.trim().split(/\s+/).filter(Boolean)) {
		if (token.startsWith("FEATURE_ID=")) {
			featureId = token.slice("FEATURE_ID=".length);
		} else if (token.startsWith("RUN_CONTEXT=")) {
			runContext = token.slice("RUN_CONTEXT=".length);
		} else if (!featureId) {
			featureId = token;
		} else if (!runContext) {
			runContext = token;
		}
	}

	return {
		rawArgs: input,
		featureId,
		runContext,
		bootstrapArgs: [featureId, runContext].filter(Boolean).join(" "),
	};
};

const versionResult = run("gemini", ["--version"]);
if (versionResult.error && versionResult.error.code === "ENOENT") {
	printAndExit(127, [
		"Gemini smoke status: blocked",
		"State: degraded_missing_binary",
		"Blocker: Gemini CLI binary was not found in PATH while running the smoke command.",
		"User action: Install Gemini CLI or fix PATH, then run rp1 verify gemini.",
	]);
}

if (!fs.existsSync(commandPath)) {
	printAndExit(2, [
		"Gemini smoke status: blocked",
		"State: degraded_missing_command",
		"Blocker: Gemini smoke command is missing at " + commandPath + ".",
		"User action: Run rp1 install gemini, then retry /rp1:smoke.",
	]);
}

const geminiVersion =
	outputOf(versionResult)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean) || "unavailable";

const parsedArgs = parseSmokeArgs(rawArgs);
if (!parsedArgs.featureId) {
	printAndExit(2, [
		"Gemini smoke status: blocked",
		"Blocker: missing FEATURE_ID. Invoke /rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>.",
		"User action: Retry with FEATURE_ID=<feature-id>.",
	]);
}

const bootstrapResult = runRp1([
	"agent-tools",
	"workflow-bootstrap",
	"--name",
	"gemini-harness-smoke",
	"--schema-path",
	"plugins/dev/skills/gemini-harness-smoke/SKILL.md",
	"--args",
	parsedArgs.bootstrapArgs,
	"--project-root",
	process.cwd(),
	"--harness",
	"gemini-cli",
]);
const bootstrapText = outputOf(bootstrapResult);
if (statusOf(bootstrapResult) !== 0) {
	printAndExit(statusOf(bootstrapResult), [
		"Gemini smoke status: blocked",
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
		"Gemini smoke status: blocked",
		"Blocker: workflow-bootstrap returned non-JSON output.",
		"User action: Rerun with rp1 --verbose or inspect the workflow-bootstrap output.",
		bootstrapText.trim(),
	]);
}

if (!bootstrap.success) {
	printAndExit(1, [
		"Gemini smoke status: blocked",
		"Blocker: workflow-bootstrap returned an unsuccessful result.",
		"User action: Inspect the bootstrap error and retry from a valid rp1 project context.",
		bootstrap.error || bootstrapText.trim(),
	]);
}

const data = bootstrap.data;
const featureId = String(data.arguments.FEATURE_ID || "").trim();
const runContext = String(data.arguments.RUN_CONTEXT || "").trim();
if (!featureId) {
	printAndExit(1, [
		"Gemini smoke status: blocked",
		"Blocker: workflow-bootstrap did not resolve FEATURE_ID.",
		"User action: Retry with FEATURE_ID=<feature-id>.",
	]);
}

const artifactRelativePath = path.posix.join("features", featureId, "gemini-smoke.md");
const artifactPath = path.join(data.directories.workRoot, artifactRelativePath);
try {
	fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
} catch (error) {
	printAndExit(1, [
		"Gemini smoke status: blocked",
		"Blocker: artifact directory creation failed.",
		"User action: Check .rp1/work permissions and available disk space, then retry.",
		error instanceof Error ? error.message : String(error),
	]);
}

const lines = [
  "# Gemini Smoke Artifact",
  "",
  "- raw_args: " + parsedArgs.rawArgs,
  "- bootstrap_args: " + parsedArgs.bootstrapArgs,
  "- feature_id: " + featureId,
  "- run_context: " + runContext,
  "- run_id: " + data.run.runId,
  "- project_root: " + data.directories.projectRoot,
  "- kb_root: " + data.directories.kbRoot,
  "- work_root: " + data.directories.workRoot,
  "- code_root: " + data.directories.codeRoot,
  "- is_worktree: " + String(data.trace.isWorktree),
  "- rp1_command: " + [rp1Command, ...rp1Args([])].join(" "),
  "- command_path: " + commandPath,
  "- gemini_version: " + geminiVersion,
  "- artifact_path: " + artifactPath,
  "- artifact_relative_path: " + artifactRelativePath,
  "- registration_status: pending",
  "",
];

try {
	fs.writeFileSync(artifactPath, lines.join("\n"));
} catch (error) {
	printAndExit(1, [
		"Gemini smoke status: blocked",
		"Blocker: artifact write failed.",
		"User action: Check .rp1/work permissions and available disk space, then retry.",
		error instanceof Error ? error.message : String(error),
	]);
}

runRp1([
	"agent-tools",
	"emit",
	"--harness",
	"gemini-cli",
	"--workflow",
	"gemini-harness-smoke",
	"--type",
	"status_change",
	"--run-id",
	data.run.runId,
	"--step",
	"smoke",
	"--data",
	'{"status":"running"}',
]);

const emitData = JSON.stringify({
	path: artifactRelativePath,
	feature: featureId,
	storageRoot: "work_dir",
	format: "markdown",
	harness: "gemini-cli",
});

const registrationResult = runRp1([
	"agent-tools",
	"emit",
	"--harness",
	"gemini-cli",
	"--workflow",
	"gemini-harness-smoke",
	"--type",
	"artifact_registered",
	"--run-id",
	data.run.runId,
	"--step",
	"smoke",
	"--data",
	emitData,
]);
const registrationStatusCode = statusOf(registrationResult);
const registrationOutput = outputOf(registrationResult);
const registrationStatus =
	registrationStatusCode === 0 ? "registered" : "registration_failed";

let content = fs.readFileSync(artifactPath, "utf-8");
content = content.replace(
  "- registration_status: pending",
  "- registration_status: " + registrationStatus,
);
content += "\n## Registration Output\n\n" + registrationOutput.trim() + "\n";
fs.writeFileSync(artifactPath, content);

if (registrationStatusCode === 0) {
	runRp1([
		"agent-tools",
		"emit",
		"--harness",
		"gemini-cli",
		"--workflow",
		"gemini-harness-smoke",
		"--type",
		"status_change",
		"--run-id",
		data.run.runId,
		"--step",
		"smoke",
		"--close-run",
		"--data",
		'{"status":"completed"}',
	]);
	console.log("Gemini smoke status: passed");
	console.log("State: experimental_ready");
	console.log("Run: " + data.run.runId);
	console.log("Artifact: " + artifactRelativePath);
	console.log("Registration: registered");
	console.log("User action: Use the artifact as smoke evidence; Gemini remains experimental and smoke-only.");
} else {
	runRp1([
		"agent-tools",
		"emit",
		"--harness",
		"gemini-cli",
		"--workflow",
		"gemini-harness-smoke",
		"--type",
		"status_change",
		"--run-id",
		data.run.runId,
		"--step",
		"smoke",
		"--data",
		'{"status":"failed","reason":"artifact registration failed"}',
	]);
	console.log("Gemini smoke status: degraded");
	console.log("State: registration_failed");
	console.log("Run: " + data.run.runId);
	console.log("Artifact: " + artifactRelativePath);
	console.log("Registration: registration_failed");
	console.log("Blocker: artifact registration failed after the smoke artifact was written.");
	console.log("User action: Inspect Registration Output in " + artifactRelativePath + ", fix the rp1 emit failure, then rerun the smoke command.");
	console.log(registrationOutput);
	process.exit(registrationStatusCode);
}
RP1_GEMINI_SMOKE
}

Report exactly:
- Gemini smoke status
- State, when printed
- Run, when printed
- Artifact, when printed
- Registration, when printed
- Blocker, only if status is blocked or degraded
- User action, when printed

Do not inspect or modify any other files. Do not continue with unrelated analysis after reporting the shell output.
'''
`;
