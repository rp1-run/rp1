export const GEMINI_SMOKE_COMMAND_RELATIVE_PATH =
	".gemini/commands/rp1/smoke.toml";

export const GEMINI_SMOKE_COMMAND_DISPLAY_PATH =
	"~/.gemini/commands/rp1/smoke.toml";

export const GEMINI_SMOKE_COMMAND_TOML = String.raw`description = "Experimental rp1 smoke workflow for Gemini CLI."
prompt = '''
# rp1 Gemini Harness Smoke

Run this experimental smoke once. It validates only argument delivery, rp1 root resolution, work-root artifact writing, and artifact registration.

Shell output:
!{bash <<'RP1_GEMINI_SMOKE'
set -u

RAW_ARGS="$(cat <<'RP1_GEMINI_ARGS'
{{args}}
RP1_GEMINI_ARGS
)"
COMMAND_PATH="${"${"}HOME}/.gemini/commands/rp1/smoke.toml"
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
	echo "Blocker: workflow-bootstrap failed. Verify this is an initialized rp1 project or worktree."
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
	echo "Run: $RUN_ID"
	echo "Artifact: $ARTIFACT_RELATIVE_PATH"
	echo "Registration: registered"
else
	rp1 agent-tools emit \
		--harness gemini-cli \
		--workflow gemini-harness-smoke \
		--type status_change \
		--run-id "$RUN_ID" \
		--step smoke \
		--data '{"status":"failed","reason":"artifact registration failed"}' >/dev/null 2>&1 || true
	echo "Gemini smoke status: blocked"
	echo "Run: $RUN_ID"
	echo "Artifact: $ARTIFACT_RELATIVE_PATH"
	echo "Registration: registration_failed"
	printf '%s\n' "$REGISTRATION_OUTPUT"
	exit "$REGISTRATION_STATUS_CODE"
fi
RP1_GEMINI_SMOKE
}

Report exactly:
- Gemini smoke status
- Run
- Artifact
- Registration
- Blocker, only if status is blocked

Do not inspect or modify any other files. Do not continue with unrelated analysis after reporting the shell output.
'''
`;
