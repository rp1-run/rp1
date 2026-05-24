#!/usr/bin/env bash
# Prove an existing-harness workflow can still register artifacts and run state
# without Antigravity setup.
set -euo pipefail

tmp_dir="$(mktemp -d)"
cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

project_root="$tmp_dir/project"
artifact_path="quick-builds/existing-harness-codex-artifact.md"
mkdir -p "$project_root/.rp1/work/quick-builds"
printf 'existing-harness-run-state-smoke\n' > "$project_root/.rp1/project_id"
printf '# Existing harness Codex artifact smoke\n\nHarness: codex\nWorkflow: build-fast\n' > "$project_root/.rp1/work/$artifact_path"

export RP1_DB="$tmp_dir/rp1.db"
run_id="$(bun -e 'console.log(crypto.randomUUID())')"
cd cli
agent_tools=(bun run src/main.ts agent-tools)

"${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step plan --name "Existing harness artifact smoke" --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
"${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step build --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
"${agent_tools[@]}" emit --harness codex --workflow build-fast --type artifact_registered --run-id "$run_id" --step build --project "$project_root" --data "{\"path\":\"$artifact_path\",\"feature\":\"quick-build\",\"storageRoot\":\"work_dir\"}" >/dev/null
"${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step review --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
"${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step review --project "$project_root" --data '{"status":"completed","feature":"quick-build"}' --close-run >/dev/null

state_json="$tmp_dir/workflow-state.json"
"${agent_tools[@]}" workflow-state --run-id "$run_id" --workflow build-fast --feature quick-build --parent-phases plan,build,review --recent-events 10 > "$state_json"
STATE_JSON="$state_json" ARTIFACT_PATH="$artifact_path" bun -e '
    const envelope = JSON.parse(await Bun.file(process.env.STATE_JSON).text());
    const artifactPath = process.env.ARTIFACT_PATH;
    const fail = (message) => {
        console.error(message);
        process.exit(1);
    };
    if (!envelope.success) fail("workflow-state did not return success");
    const data = envelope.data;
    if (data.run.harness !== "codex") fail(`expected codex harness, got ${data.run.harness}`);
    if (data.run.status !== "completed") fail(`expected completed run, got ${data.run.status}`);
    if (data.run.rp1WorkRoot !== `${data.run.rp1ProjectRoot}/.rp1/work`) fail("run roots do not point at the project work root");
    if (data.artifacts.length !== 1) fail(`expected one artifact, got ${data.artifacts.length}`);
    const artifact = data.artifacts[0];
    if (artifact.path !== artifactPath) fail(`expected artifact path ${artifactPath}, got ${artifact.path}`);
    if (artifact.storageRoot !== "work_dir") fail(`expected work_dir storage root, got ${artifact.storageRoot}`);
    if (artifact.step !== "build") fail(`expected build artifact step, got ${artifact.step}`);
    if (!data.recent_events.some((event) => event.type === "artifact_registered")) fail("artifact_registered event missing from recent workflow state");
    console.log(`Existing-harness artifact/run-state smoke passed: harness=${data.run.harness} workflow=${data.run.flow} status=${data.run.status} artifact=${artifact.path}`);
'
