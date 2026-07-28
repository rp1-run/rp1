# Implementation and Release Phases

Sections §PHASE-3 (implementation, task dispatch, verification aggregation,
readiness) and §PHASE-4 (release and archive). Load once planning completes
and the workflow enters implementation, or when resuming directly into the
implementation or release phase.

## §PHASE-3: Implementation

**Skip if**: `START_PHASE` is after `implementation`.

**Resume checkpoint**: If `WAITING_PHASE.phase == "implementation"`, inspect the latest parent waiting/status event from `WORKFLOW_STATE.recent_events`:

- `reason = "review_retry_exhausted"` -> resume the repair/skip/stop decision before any new builder dispatch.
- `reason = "readiness_add_task"` or `reason = "release_add_task"` -> run §4.1 against the updated `tasks.json`, then continue implementation from remaining task units.
- `reason = "missing_readiness_contract"` -> jump to §4.6 verification/readiness.
- otherwise jump directly to the Implementation checkpoint if a registered `features/{FEATURE_ID}/build-readiness.md` artifact exists.

Do not dispatch task-builder, validators, or comment-cleaner before the matching resumed decision path is selected.

### §4.1 Plan Task Units

Use the schema-backed task plan sidecar. Do not parse `tasks.md` for machine planning.

```bash
rp1 agent-tools build-task-plan \
  --tasks-path "{workRoot}/features/{FEATURE_ID}/tasks.json" \
  --max-simple-batch 3 \
  --complex-isolated true
```

Parse the JSON `ToolResult`.

- Extract `task_units`, `implementation_tasks`, `documentation_tasks`, and `warnings`.
- Set `TASK_PLAN = data`.
- For each `task_unit`, derive `TASK_UNIT_IDS = task_unit.task_ids.join(",")`. This is the only source for builder/reviewer `TASK_IDS`.
- Preserve `warnings` as `task_plan_warnings` for readiness/release notes.
- If the tool fails or returns malformed output, emit `implementation` waiting with the tool error and STOP. Do not infer task state from markdown.
- If `task_units` is empty, skip task-builder/task-reviewer and continue to documentation follow-ups, cleanup manifest handling, and verification.

### §4.2 Cleanup Manifest Baseline

Before the first task-builder unit, snapshot the build-start repository state:

```bash
rp1 agent-tools change-manifest snapshot \
  --code-root "{codeRoot}" \
  --out "{workRoot}/features/{FEATURE_ID}/change-manifest-baseline.json"
```

Parse the `ToolResult` envelope. On failure: continue the build but record `cleanup_manifest_result` as skipped (`skipReason: "baseline_snapshot_failed"`, `files: 0`, `ownedLineCount: 0`). Do not dispatch `comment-cleaner` later unless `change-manifest generate` explicitly returns `status: "created"` with non-empty ownership.

### §4.3 Builder-Reviewer Loop

Process `TASK_PLAN.task_units` via the `schedule-wave` tool. Never derive task IDs from `tasks.md`; use the tool output. Do not edit `tasks.json` from the orchestrator; the reviewer owns task-plan persistence.

#### Dispatch Cycle

Initialize `COMPLETED_TASK_IDS` as an empty list. Repeat until `schedule-wave` returns an empty dispatch:

```bash
CLEAN_TREE=$([ -z "$(git -C "{codeRoot}" status --porcelain)" ] && echo true || echo false)

rp1 agent-tools schedule-wave \
  --tasks-path "{workRoot}/features/{FEATURE_ID}/tasks.json" \
  --completed-task-ids "{COMPLETED_TASK_IDS}" \
  --max-builders 4 \
  --git-commit {GIT_COMMIT} \
  --clean-tree "$CLEAN_TREE"
```

Parse the JSON `ToolResult`. Extract `mode`, `dispatch`, `reviewer_pipelining`, and `held`.

If `dispatch` is empty and uncompleted units remain, emit `implementation` waiting with `reason: "dependency_deadlock"` and STOP.

#### Dispatching from `schedule-wave` Output

**Parallel-wave mode** (`mode == "parallel-wave"`): Dispatch all units in `dispatch` as concurrent builders. The first entry (role `primary`) runs on `codeRoot`; each `secondary` entry runs on a dedicated worktree (see `references/parallel-builders.md` for worktree lifecycle). Dispatch all builder blocks back-to-back in one message:

{% dispatch_agent "rp1-dev:task-builder", background %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot or worktreePath}, TASK_IDS={dispatch[n].task_ids}, GIT_COMMIT={GIT_COMMIT}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Wait for all builders to complete. Review the primary unit first. On primary reviewer success, integrate each secondary worktree per `references/parallel-builders.md`, then review each integrated secondary on the primary `codeRoot`. If the primary reviewer fails, abandon all secondary worktrees, retry or escalate the primary per the Reviewer Failure section, and rebuild secondaries serially after the primary passes. If integration fails for a secondary, apply the Conflict Fallback (discard worktree, rebuild that unit serially).

**Serial mode** (`mode == "serial"`): Dispatch the single `primary` unit's builder:

{% dispatch_agent "rp1-dev:task-builder" %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}, TASK_IDS={dispatch[0].task_ids}, GIT_COMMIT={GIT_COMMIT}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

After the builder completes, check `reviewer_pipelining`. If a pair exists matching this unit as `review_unit_id`, dispatch the reviewer and the paired `build_unit_id`'s builder as parallel agents in one message:

{% dispatch_agent "rp1-dev:task-reviewer", background %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}, TASK_IDS={completed_unit_task_ids}, GIT_COMMIT={GIT_COMMIT}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:task-builder", background %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}, TASK_IDS={pipelined_unit_task_ids}, GIT_COMMIT={GIT_COMMIT}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Wait for both to complete. Process the reviewer result first. If no pipelining pair exists, dispatch the reviewer alone and wait.

#### Reviewer Success

Reviewer contract: `SUCCESS` + `task_plan_updated = true` completes the unit. Append the unit's `task_ids` to `COMPLETED_TASK_IDS` and call `schedule-wave` again for the next cycle.

#### Reviewer Failure

`attempt = 1`, `max = 2`. On FAILURE with attempt < max: build `PREVIOUS_FEEDBACK` JSON from `issues`/`summary`, re-spawn task-builder with feedback (if `GIT_COMMIT=true`, pass `REWRITE_COMMITS=true`):

{% dispatch_agent "rp1-dev:task-builder" %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}, TASK_IDS={TASK_UNIT_IDS}, GIT_COMMIT={GIT_COMMIT}, REWRITE_COMMITS={GIT_COMMIT}, PREVIOUS_FEEDBACK={PREVIOUS_FEEDBACK}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Re-run task-reviewer for the same unit. On second failure, escalate per §4.3.7.

If a pipelined builder was in flight when the reviewer failed: wait for it to finish, resolve the failed unit's retry first, then review the already-built pipelined unit only after the failed unit passes. If retry is exhausted, the pipelined unit is abandoned alongside it.

#### Exhausted-Retry Escalation {#s4-3-7}

Escalate without marking parent `implementation` failed while recovery remains.

- Interactive: emit `waiting_for_user` on `implementation` with prompt "Task review failed after retry. Repair, Skip task, or Stop?" and context about the failing task unit. Then emit `implementation` waiting with `task_unit: "{TASK_UNIT_IDS}"` and `reason: "review_retry_exhausted"`. STOP with `/build {FEATURE_ID}` resume instructions.
- AFK: if an explicit skip policy exists, record the skipped `TASK_UNIT_IDS` as release follow-ups; otherwise emit parent `implementation` failed only because no skip/repair path remains.

#### Safety Rules

1. **Never reviewer and builder on the same unit.** A unit's reviewer dispatches only after that unit's builder completes.
2. **Failure isolation.** When a pipelined reviewer fails, wait for any in-flight builder to finish, then resolve the retry before any new dispatch.
3. **Serial fallback.** When in doubt about preconditions, file overlap, or worktree health, fall back to serial. Parallel-wave is an optimization, not a requirement. The tool may always be called with `--clean-tree false` to force serial mode.
4. **Emit namespacing unchanged.** Both primary and secondary builders emit with the same `task-builder:` step prefix. The `--unit` parameter distinguishes their events.

See `references/parallel-builders.md` for the full worktree lifecycle protocol: creation, CODE_ROOT routing, integration, conflict fallback, cleanup, and failure handling.

### §4.4 Post-Build

Documentation tasks from `TASK_PLAN.documentation_tasks`:

- Complete only through a declared supported workflow.
- Current build has no declared docs implementation workflow; create `documentation_followups` from each docs task with `id`, `title`, `target`, `acceptance_refs`, `dependencies`, and `blocks_release = false`.
- Carry `documentation_followups` into readiness/release `manual_items`.
- Do not spawn undeclared documentation agents.

### §4.5 Cleanup Manifest Generation

After builders, reviewers, and documentation follow-up collection finish, generate the durable cleanup handoff before verification:

```bash
rp1 agent-tools change-manifest generate \
  --code-root "{codeRoot}" \
  --out "{workRoot}/features/{FEATURE_ID}/change-manifest-001.json" \
  --status-out "{workRoot}/features/{FEATURE_ID}/change-manifest-status.json" \
  --source build \
  --baseline "{workRoot}/features/{FEATURE_ID}/change-manifest-baseline.json"
```

Parse the `ToolResult` envelope into `cleanup_manifest_result`. If `data.status == "created"` with `files > 0` and `ownedLineCount > 0`, `comment-cleaner` may participate using `data.manifestPath`. If `data.status == "skipped"`, preserve `statusPath`/`skipReason` for the aggregator. On failure: set skipped with `skipReason: "change_manifest_generate_failed"`, `files: 0`, `ownedLineCount: 0`.

### §4.6 Verification And Readiness

#### Step 1 — Resolve comment-cleaner participation

Evaluate the cleanup manifest result BEFORE dispatching any verification agent. Comment-cleaner participates only when ALL of: `cleanup_manifest_result.data.status == "created"`, `cleanup_manifest_result.data.files > 0`, `cleanup_manifest_result.data.ownedLineCount > 0`, and `cleanup_manifest_result.data.manifestPath` is present. Do not dispatch comment-cleaner with branch, unstaged, commit-range, base-branch, mode, or commit parameters; the generated manifest is the only safe cleanup boundary.

If comment-cleaner will NOT participate, set the `comment_cleaner` phase result now (before dispatch): `status: "WARN"`, empty `blocking_issues`, one warning noting "Automatic comment cleanup skipped because no non-empty generated manifest was available" with `evidence` from `cleanup_manifest_result.data.statusPath`, one artifact entry for the status path with `storageRoot: "absolute"`, one evidence entry with `status: "not_applicable"` and `summary` from `skipReason`, `files_checked: 0`, `manifest_path: null`, and `manifest_status_path`/`skip_reason` from the cleanup manifest result.

#### Step 2 — Parallel dispatch

Emit all dispatch blocks below back-to-back in one message, with no text between them — prose between blocks breaks the parallel dispatch. Always include `code-checker` and `feature-verifier`. Include `comment-cleaner` only when Step 1 resolved it as participating; when not, omit its block entirely. No prose, conditionals, or explanatory text may appear between dispatch blocks.

{% dispatch_agent "rp1-dev:code-checker", background %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:feature-verifier", background %}
FEATURE_ID={FEATURE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, CODE_ROOT={codeRoot}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:comment-cleaner", background %}
CHANGE_MANIFEST={cleanup_manifest_result.data.manifestPath}, CODE_ROOT={codeRoot}
{% enddispatch_agent %}

#### Step 3 — Wait for all before aggregation

Wait for ALL dispatched verification agents to complete before proceeding. Do not begin aggregation until every agent result is available. Collect each agent's response into its corresponding slot below.

Build `PHASE_RESULTS_JSON` with keys: `code_checker` (validation envelope or legacy), `feature_verifier` (validation envelope or legacy), `comment_cleaner` (validation envelope or synthetic warning), and `implementation_context` containing `task_plan_warnings` and `documentation_followups` arrays. These MUST be the preserved arrays from §4.1 and §4.4 -- never hardcode to `[]` unless actually empty.

{% dispatch_agent "rp1-dev:build-verify-aggregator" %}
PHASE_RESULTS={PHASE_RESULTS_JSON}, FEATURE_ID={FEATURE_ID}, WORK_ROOT={workRoot}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Extract `readiness_status`, `release_behavior`, `ready_for_release`, `blocking_issues`, `warnings`, and `manual_items`. Preserve compatibility fields `overall_status` and `ready_for_merge` when present.

Readiness release behavior:

- PASS/proceed: release may start.
- WARN/proceed_with_notes: release may start with warnings/manual notes visible.
- FAIL/return_to_implementation: keep parent `implementation` running for planned repair or waiting for a user decision.
- WAITING/wait_for_human: emit parent `implementation` waiting for required manual evidence.

If readiness has blocking failures or missing required components, keep parent `implementation` running for planned repair or waiting for a user decision. Emit parent `implementation` failed only when no repair/decision path remains.

If readiness is FAIL or WAITING in interactive mode, present the readiness evidence before stopping: emit `waiting_for_user` on `implementation` with prompt "Readiness needs work. Repair, Add Task, Review feedback from Arcade, or Stop?" and readiness context (status, blocker/warning/manual-item counts, readiness artifact path). Then emit `implementation` waiting with `readiness_status`. STOP with `/build {FEATURE_ID}` resume instructions.

If AFK and readiness is FAIL or WAITING, emit `implementation` failed unless an explicit repair/skip policy is already available.

When readiness is PASS or WARN and can proceed to release, present the human gate before release.

**Implementation checkpoint** (after readiness; skip if AFK):

Emit `waiting_for_user` on `implementation` with prompt "Release, Add Task, Review feedback from Arcade, or Stop?" and readiness context.

{% ask_user "Release, Add Task, Review feedback from Arcade, or Stop?", options: "Release", "Add Task", "Review feedback from Arcade", "Stop" %}
On Release: continue.
On Add Task: collect `ADDED_TASK_REQUEST`, dispatch `feature-tasker` with `UPDATE_MODE=true` and `UPDATE_CONTEXT={"source":"implementation_checkpoint","request":"{ADDED_TASK_REQUEST}"}`, validate the same success contract as §2.3, then emit `implementation` waiting with `reason: "readiness_add_task"` and `added_task_request`. STOP with `/build {FEATURE_ID}` resume instructions. On resume, `build-task-plan` must consume the updated `tasks.json`.

{% dispatch_agent "rp1-dev:feature-tasker" %}
FEATURE_ID={FEATURE_ID}, WORK_ROOT={workRoot}, UPDATE_MODE=true, UPDATE_CONTEXT={"source":"implementation_checkpoint","request":"{ADDED_TASK_REQUEST}"}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.
On Stop: emit `implementation` waiting with `reason: "stopped_at_implementation_checkpoint"` and STOP with `/build {FEATURE_ID}` resume instructions.
After the user chooses Release, or AFK skips this checkpoint, emit `implementation` completed per §PARENT-EMIT-DISCIPLINE table.

### Git Operations (conditional)

If GIT_COMMIT: stage+commit. If GIT_PUSH: push. If GIT_PR: create PR.

## §PHASE-4: Release

**Skip if**: `START_PHASE` is after `release`.

**Resume checkpoint**: If `WAITING_PHASE.phase == "release"`, inspect the latest parent waiting/status event from `WORKFLOW_STATE.recent_events`:

- `reason = "add_task_requested"` -> jump to §PHASE-3 Implementation and consume the updated `tasks.json`.
- `reason = "archive_incomplete"` -> set `ARCHIVE_RETRY_PATH` from the prior archiver result's exact `archive_path`, then jump directly to Archive retry.
- otherwise jump directly to the Release gate.

Do not emit `release` completed on a waiting resume until the resumed release decision succeeds.

Release MUST start only after readiness aggregation has completed.

Before emitting `release` running:

1. Set `READINESS_CONTRACT` from the `build-verify-aggregator` JSON returned in §4.6 when this invocation ran implementation.
2. If resuming directly at `release`, set `READINESS_CONTRACT` from `WORKFLOW_STATE.artifacts` only when a registered artifact exists with `path = "features/{FEATURE_ID}/build-readiness.md"` and `storageRoot = "work_dir"`.
3. If no readiness contract or registered readiness artifact exists, emit `implementation` waiting with `reason = "missing_readiness_contract"` and STOP. Do not emit `release` running.
4. If `READINESS_CONTRACT.readiness_status` is `FAIL` or `WAITING`, or `ready_for_release` is false, return to §4.6 readiness handling. Do not start release.

Missing readiness: emit `implementation` waiting with `reason: "missing_readiness_contract"`.

Emit `release` running per §PARENT-EMIT-DISCIPLINE table before presenting release options.

Output: Feature ID, phase status table, registered artifacts, readiness artifact, readiness status, blockers, warnings, and manual items. Show manual checklist status before archive options: satisfied, not applicable, or still visible as release notes. Do not claim manual items are complete unless the readiness contract says so.

**Release gate** (skip if AFK; AFK defaults to archive):

Emit `waiting_for_user` on `release` with prompt "Release, Add task, Review feedback from Arcade, or Stop?" and readiness context.

The canonical release options are five (Archive, Complete without archive, Add task, Review feedback from Arcade, Stop) — over the 4-option cap — so present them as two steps per §CHECKPOINT-OPTIONS.

{% ask_user "Release, Add task, Review feedback from Arcade, or Stop?", options: "Release", "Add task", "Review feedback from Arcade", "Stop" %}
On Release: ask the archive sub-decision as a separate question:

{% ask_user "Archive the feature now, or complete without archiving?", options: "Archive", "Complete without archive" %}
On Archive: proceed to the Archive step below.
On Complete without archive: emit `release` completed per §PARENT-EMIT-DISCIPLINE table with `archive_status: "declined"` and STOP. Do not run `feature-archiver`.

On Add task: collect `ADDED_TASK_REQUEST`, dispatch `feature-tasker` with `UPDATE_MODE=true` and `UPDATE_CONTEXT={"source":"release_gate","request":"{ADDED_TASK_REQUEST}"}`, validate the same success contract as §2.3. Emit `release` waiting with `archive_status: "deferred"`, `reason: "add_task_requested"`, and `added_task_request`. Emit `implementation` waiting with `reason: "release_add_task"` and `added_task_request`. STOP. Parent `release` MUST NOT complete until release is re-entered after implementation and readiness re-aggregation.

{% dispatch_agent "rp1-dev:feature-tasker" %}
FEATURE_ID={FEATURE_ID}, WORK_ROOT={workRoot}, UPDATE_MODE=true, UPDATE_CONTEXT={"source":"release_gate","request":"{ADDED_TASK_REQUEST}"}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.
On Stop: emit `release` waiting with `archive_status: "deferred"` and STOP with `/build {FEATURE_ID}` resume instructions.

### Archive

{% dispatch_agent "rp1-dev:feature-archiver" %}
MODE=archive, FEATURE_ID={FEATURE_ID}, ARCHIVE_PATH={ARCHIVE_RETRY_PATH}, WORK_ROOT={workRoot}, SKIP_DOC_CHECK=false, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Parse the `feature-archiver` response. Accept success from JSON with `status: "success"`, `mode: "archive"`, `archive_status: "completed"`, `archive_path`, and an `artifacts[]` entry beginning with `archives/features/` using `storageRoot: "work_dir"`. Require `registration_status: "registered"` since `WORKFLOW`/`RUN_ID` were passed.
On failure (`needs_confirmation`, malformed, missing archive result/registration): do NOT emit `release` completed. If `registration_retry_required: true`, set `ARCHIVE_RETRY_PATH = response.archive_path`. Interactive: emit `release` waiting with `reason: "archive_incomplete"` and `archive_path`, STOP. AFK: emit `release` failed only when no recovery remains.

Archive-incomplete: emit `release` waiting with `archive_status: "incomplete"`, `reason: "archive_incomplete"`, and `archive_path: "{ARCHIVE_RETRY_PATH}"`.

After `feature-archiver` succeeds and registers the actual archived output, emit `release` completed per §PARENT-EMIT-DISCIPLINE table with `archive_status: "completed"` and `archive_path`.
