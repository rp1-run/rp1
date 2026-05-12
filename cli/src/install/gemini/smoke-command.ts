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
!{bash <<'RP1_GEMINI_SMOKE'
set -u

RAW_ARGS="$(cat <<'RP1_GEMINI_ARGS'
{{args}}
RP1_GEMINI_ARGS
)"
COMMAND_PATH="${"${"}HOME}/.gemini/commands/rp1/smoke.toml"

if ! command -v gemini >/dev/null 2>&1; then
	echo "Gemini smoke status: blocked"
	echo "State: degraded_missing_binary"
	echo "Blocker: Gemini CLI binary was not found in PATH while running the smoke command."
	echo "User action: Install Gemini CLI or fix PATH, then run rp1 verify gemini."
	exit 127
fi

if [ ! -f "$COMMAND_PATH" ]; then
	echo "Gemini smoke status: blocked"
	echo "State: degraded_missing_command"
	echo "Blocker: Gemini smoke command is missing at $COMMAND_PATH."
	echo "User action: Run rp1 install gemini, then retry /rp1:smoke."
	exit 2
fi

GEMINI_VERSION="$(gemini --version 2>&1 | head -n 1 || true)"

FEATURE_ID=""
RUN_CONTEXT=""

for token in $RAW_ARGS; do
	case "$token" in
		FEATURE_ID=*)
			FEATURE_ID="${"${"}token#FEATURE_ID=}"
			;;
		RUN_CONTEXT=*)
			RUN_CONTEXT="${"${"}token#RUN_CONTEXT=}"
			;;
		*)
			if [ -z "$FEATURE_ID" ]; then
				FEATURE_ID="$token"
			elif [ -z "$RUN_CONTEXT" ]; then
				RUN_CONTEXT="$token"
			fi
			;;
	esac
done

if [ -z "$FEATURE_ID" ]; then
	echo "Gemini smoke status: blocked"
	echo "Blocker: missing FEATURE_ID. Invoke /rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>."
	echo "User action: Retry with FEATURE_ID=<feature-id>."
	exit 2
fi

BOOTSTRAP_ARGS="$FEATURE_ID"
if [ -n "$RUN_CONTEXT" ]; then
	BOOTSTRAP_ARGS="$BOOTSTRAP_ARGS $RUN_CONTEXT"
fi

BOOTSTRAP_JSON="$(rp1 agent-tools workflow-bootstrap \
	--name gemini-harness-smoke \
	--schema-path plugins/dev/skills/gemini-harness-smoke/SKILL.md \
	--args "$BOOTSTRAP_ARGS" \
	--project-root "$PWD" \
	--harness gemini-cli 2>&1)"
BOOTSTRAP_STATUS=$?

if [ "$BOOTSTRAP_STATUS" -ne 0 ]; then
	echo "Gemini smoke status: blocked"
	echo "Blocker: root resolution failed. Missing or invalid rp1 project context."
	echo "User action: Run from an initialized rp1 checkout or worktree, or run rp1 init before retrying."
	printf '%s\n' "$BOOTSTRAP_JSON"
	exit "$BOOTSTRAP_STATUS"
fi

export RAW_ARGS
export BOOTSTRAP_ARGS
export BOOTSTRAP_JSON
export COMMAND_PATH
export GEMINI_VERSION

ARTIFACT_SETUP="$(node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const bootstrap = JSON.parse(process.env.BOOTSTRAP_JSON || "{}");
if (!bootstrap.success) {
  throw new Error(bootstrap.error || "workflow-bootstrap returned an unsuccessful result");
}

const data = bootstrap.data;
const featureId = String(data.arguments.FEATURE_ID || "").trim();
const runContext = String(data.arguments.RUN_CONTEXT || "").trim();
if (!featureId) {
  throw new Error("workflow-bootstrap did not resolve FEATURE_ID");
}

const artifactRelativePath = path.posix.join("features", featureId, "gemini-smoke.md");
const artifactPath = path.join(data.directories.workRoot, artifactRelativePath);
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });

const lines = [
  "# Gemini Smoke Artifact",
  "",
  "- raw_args: " + (process.env.RAW_ARGS || ""),
  "- bootstrap_args: " + (process.env.BOOTSTRAP_ARGS || ""),
  "- feature_id: " + featureId,
  "- run_context: " + runContext,
  "- run_id: " + data.run.runId,
  "- project_root: " + data.directories.projectRoot,
  "- kb_root: " + data.directories.kbRoot,
  "- work_root: " + data.directories.workRoot,
  "- code_root: " + data.directories.codeRoot,
  "- is_worktree: " + String(data.trace.isWorktree),
  "- command_path: " + (process.env.COMMAND_PATH || ""),
  "- gemini_version: " + (process.env.GEMINI_VERSION || "unavailable"),
  "- artifact_path: " + artifactPath,
  "- artifact_relative_path: " + artifactRelativePath,
  "- registration_status: pending",
  "",
];

fs.writeFileSync(artifactPath, lines.join("\n"));
console.log(JSON.stringify({
  artifactPath,
  artifactRelativePath,
  featureId,
  runId: data.run.runId
}));
NODE
)"
ARTIFACT_STATUS=$?

if [ "$ARTIFACT_STATUS" -ne 0 ]; then
	echo "Gemini smoke status: blocked"
	echo "Blocker: artifact write failed."
	echo "User action: Check .rp1/work permissions and available disk space, then retry."
	printf '%s\n' "$ARTIFACT_SETUP"
	exit "$ARTIFACT_STATUS"
fi

export ARTIFACT_SETUP
eval "$(node <<'NODE'
const setup = JSON.parse(process.env.ARTIFACT_SETUP || "{}");
const quote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
process.stdout.write("ARTIFACT_PATH=" + quote(setup.artifactPath) + "\n");
process.stdout.write("ARTIFACT_RELATIVE_PATH=" + quote(setup.artifactRelativePath) + "\n");
process.stdout.write("FEATURE_ID=" + quote(setup.featureId) + "\n");
process.stdout.write("RUN_ID=" + quote(setup.runId) + "\n");
process.stdout.write("EMIT_DATA=" + quote(JSON.stringify({
  path: setup.artifactRelativePath,
  feature: setup.featureId,
  storageRoot: "work_dir",
  format: "markdown",
  harness: "gemini-cli"
})) + "\n");
NODE
)"

rp1 agent-tools emit \
	--harness gemini-cli \
	--workflow gemini-harness-smoke \
	--type status_change \
	--run-id "$RUN_ID" \
	--step smoke \
	--data '{"status":"running"}' >/dev/null 2>&1 || true

REGISTRATION_OUTPUT="$(rp1 agent-tools emit \
	--harness gemini-cli \
	--workflow gemini-harness-smoke \
	--type artifact_registered \
	--run-id "$RUN_ID" \
	--step smoke \
	--data "$EMIT_DATA" 2>&1)"
REGISTRATION_STATUS_CODE=$?

export ARTIFACT_PATH
export REGISTRATION_OUTPUT

if [ "$REGISTRATION_STATUS_CODE" -eq 0 ]; then
	REGISTRATION_STATUS="registered"
else
	REGISTRATION_STATUS="registration_failed"
fi
export REGISTRATION_STATUS

node <<'NODE'
const fs = require("node:fs");

const artifactPath = process.env.ARTIFACT_PATH;
const status = process.env.REGISTRATION_STATUS || "registration_failed";
const output = process.env.REGISTRATION_OUTPUT || "";
if (!artifactPath) {
  process.exit(0);
}

let content = fs.readFileSync(artifactPath, "utf-8");
content = content.replace(
  "- registration_status: pending",
  "- registration_status: " + status,
);
content += "\n## Registration Output\n\n" + output.trim() + "\n";
fs.writeFileSync(artifactPath, content);
NODE

if [ "$REGISTRATION_STATUS_CODE" -eq 0 ]; then
	rp1 agent-tools emit \
		--harness gemini-cli \
		--workflow gemini-harness-smoke \
		--type status_change \
		--run-id "$RUN_ID" \
		--step smoke \
		--close-run \
		--data '{"status":"completed"}' >/dev/null 2>&1 || true
	echo "Gemini smoke status: passed"
	echo "State: experimental_ready"
	echo "Run: $RUN_ID"
	echo "Artifact: $ARTIFACT_RELATIVE_PATH"
	echo "Registration: registered"
	echo "User action: Use the artifact as smoke evidence; Gemini remains experimental and smoke-only."
else
	rp1 agent-tools emit \
		--harness gemini-cli \
		--workflow gemini-harness-smoke \
		--type status_change \
		--run-id "$RUN_ID" \
		--step smoke \
		--data '{"status":"failed","reason":"artifact registration failed"}' >/dev/null 2>&1 || true
	echo "Gemini smoke status: degraded"
	echo "State: registration_failed"
	echo "Run: $RUN_ID"
	echo "Artifact: $ARTIFACT_RELATIVE_PATH"
	echo "Registration: registration_failed"
	echo "Blocker: artifact registration failed after the smoke artifact was written."
	echo "User action: Inspect Registration Output in $ARTIFACT_RELATIVE_PATH, fix the rp1 emit failure, then rerun the smoke command."
	printf '%s\n' "$REGISTRATION_OUTPUT"
	exit "$REGISTRATION_STATUS_CODE"
fi
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
