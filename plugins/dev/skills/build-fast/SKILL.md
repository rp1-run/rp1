---
name: build-fast
description: "Quick-iteration development for small/medium scope changes with persistent artifacts and optional review."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: development
  is_workflow: true
  version: 3.0.0
  tags:
    - core
    - code
    - feature
  created: 2026-01-01
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: DEVELOPMENT_REQUEST
      type: string
      required: true
      description: "The freeform development request text"
      variadic: true
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
      aliases:
        - "afk"
        - "no prompts"
        - "unattended"
    - name: CONFIRM_PLAN
      type: boolean
      required: false
      default: false
      description: "Enable plan review checkpoint and post-implementation review"
      aliases:
        - "confirm"
        - "review plan"
        - "confirm-plan"
    - name: REVIEW
      type: boolean
      required: false
      default: false
      description: "Enable task-reviewer validation after implementation"
      aliases:
        - "review"
        - "verify"
        - "check"
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: false
      description: "Commit changes"
      aliases:
        - "commit"
    - name: GIT_PUSH
      type: boolean
      required: false
      default: false
      description: "Push branch to remote"
      aliases:
        - "push"
  sub_agents:
    - "rp1-dev:build-fast-planner"
    - "rp1-dev:task-builder"
    - "rp1-dev:task-reviewer"
---

# Build Fast Command

Quick-iteration workflow for focused changes. Three-phase execution: plan -> build -> [review].

## §VERSION-GATE

**If** `RP1_VERSION` < 0.3.3 **then** STOP execution with message:

```
Your rp1 CLI needs to be updated.

Please run `/rp1-base:self-update` to update, then retry this command.

Or in the terminal: `rp1 update`
```

## §FLAG-LOGIC

**CRITICAL OVERRIDE**: When `AFK=true`, treat `CONFIRM_PLAN` as `false` regardless of its passed value. AFK mode means zero user interaction - skip ALL user prompts throughout this workflow.

**Effective values when AFK=true**:

- `CONFIRM_PLAN` -> `false` (forced)
- All checkpoints -> SKIP (no user prompts)

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
```

**On each phase transition**, report via:
```
rp1 agent-tools emit \
  --workflow build-fast \
  --type status_change \
  --run-id {RUN_ID} \
  --name "{RUN_NAME}" \
  --step {CURRENT_STATE} \
  --data '{"status": "running"}'
```

- Generate `RUN_ID` as a UUID at workflow start
- Derive `RUN_NAME` from the development request: a brief summary (max 60 chars) prefixed with `"Feature: "` (e.g., `"Feature: Add logout button to navbar"`)

**State Progression Protocol**:
1. Report each `--step` with `--data '{"status": "running"}'` when you enter that state
2. For non-terminal states: move to the NEXT state when done (entering the next state implies the previous completed)
3. For terminal states (those with `→ [*]` transitions): report with `--data '{"status": "completed"}'` when the step's work finishes
4. On error, transition to the appropriate failure state in the graph

**Example sequence**:
```
--workflow build-fast --step plan --name "Feature: Add logout button" --data '{"status": "running"}'   # first emit includes --name
--workflow build-fast --step build --data '{"status": "running"}'      # plan done, entering build phase
--workflow build-fast --step review --data '{"status": "running"}'     # build done, entering review phase
--workflow build-fast --step review --data '{"status": "completed"}'   # review done, workflow complete
```

## §PHASE-1: Planning

**Spawn agent**:

{% dispatch_agent "rp1-dev:build-fast-planner" %}
DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}, WORKFLOW=build-fast, RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Parse response**: Extract `scope`, `plan_summary`, `files_affected`, `reasoning`, `artifact_path`, `artifact_relative_path`, `task_count`, `task_ids`.

**If planner fails or returns an error**: Retry the planner once. If it fails again, use a `general-purpose` agent with the same prompt to generate the plan and artifact. Never skip planning — always produce an artifact before §PHASE-2.

### §1.1 Large Scope Redirect

If `scope` = "Large":

Output the planner's `redirect_message` and STOP.

### §1.2 Plan Review Checkpoint

**SKIP ENTIRELY if**: `AFK=true` OR `CONFIRM_PLAN=false`

When skipped: Do NOT prompt the user. Proceed directly to §PHASE-2.

**Interactive confirm mode rule**: When `AFK=false` AND `CONFIRM_PLAN=true`, this checkpoint is REQUIRED. Before entering §PHASE-2, you must complete both actions below in order:
1. Emit `waiting_for_user` for the plan gate
2. Call `ask_user` and wait for the answer

The `waiting_for_user` emit does not replace the `ask_user` call. Continuing to §PHASE-2 without both is an invalid workflow transition.

Emit waiting status so the Arcade dashboard reflects the gate pause:

```bash
rp1 agent-tools emit \
  --workflow build-fast \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step plan \
  --data '{"prompt": "Proceed with plan?", "context": "Plan review checkpoint after planning phase"}'
```

Present the plan review to the user:

## Plan Review

**Scope**: {scope}
**Estimated Effort**: {estimated_effort from plan}
**Artifact**: {artifact_path}

**Tasks**:
{list tasks from artifact}

**Files**: {files_affected}

**Mandatory checkpoint**: The very next action must be the `ask_user` call below. Do NOT start §PHASE-2 until the user has answered. Do NOT skip this gate when `AFK=false` and `CONFIRM_PLAN=true`.

{% ask_user "Proceed with plan?", options: "Continue", "Revise", "Review feedback from Arcade", "Stop" %}

**On "Continue"**: Proceed to §PHASE-2.
**On "Revise"**: Prompt for feedback, re-invoke §PHASE-1 with feedback appended to DEVELOPMENT_REQUEST.
**On "Review feedback from Arcade"**: Load the `arcade-collab` skill (`/rp1-dev:arcade-collab`), then call `rp1 agent-tools feedback read --run-id {RUN_ID} --status open`. If feedback exists, process it per the collaboration loop in the skill. After all feedback is processed, return to this gate and re-present the same options.
**On "Stop"**: Output "Build fast cancelled. Artifact preserved at {artifact_path}" and STOP.

**Transition guard**: If `AFK=false` AND `CONFIRM_PLAN=true`, do not enter §PHASE-2 unless this checkpoint produced both a `waiting_for_user` emit and an `ask_user` answer in the current run.

## §PHASE-2: Execution

**CRITICAL**: You are an orchestrator. You MUST delegate implementation to `task-builder` by spawning an agent. Do NOT write, edit, or create source code files yourself. Do NOT implement the plan directly. Your only job is to spawn agents and parse their responses.

### §2.1 Task Execution

**You MUST spawn task-builder here.** Do not implement the tasks yourself.

{% dispatch_agent "rp1-dev:task-builder" %}
QUICK_BUILD_PATH=.rp1/work/{artifact_relative_path}
TASK_IDS={task_ids}
GIT_COMMIT={GIT_COMMIT}
WORKFLOW=build-fast
RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Parse response**: Verify "Builder Complete" in output.

## §PHASE-3: Review (Optional)

**Skip if**: `REVIEW=false`

### §3.1 Task Review

**You MUST use `subagent_type: rp1-dev:task-reviewer`** — do not use `general-purpose` or any other agent type.

{% dispatch_agent "rp1-dev:task-reviewer" %}
QUICK_BUILD_PATH=.rp1/work/{artifact_relative_path}
TASK_IDS={task_ids}
GIT_COMMIT={GIT_COMMIT}
WORKFLOW=build-fast
RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Parse response**: Extract `status` (SUCCESS or FAILURE).

### §3.2 Retry on Failure

If `status` = "FAILURE":

1. Extract `issues` and `summary` from reviewer response
2. Re-spawn task-builder with feedback:

{% dispatch_agent "rp1-dev:task-builder" %}
QUICK_BUILD_PATH=.rp1/work/{artifact_relative_path}
TASK_IDS={task_ids}
GIT_COMMIT={GIT_COMMIT}
PREVIOUS_FEEDBACK={reviewer summary and issues}
WORKFLOW=build-fast
RUN_ID={RUN_ID}
{% enddispatch_agent %}

3. Do NOT retry reviewer after retry builder (max 1 retry total)

## §PHASE-4: Finalization

### §4.1 Push (Conditional)

**Skip if**: `GIT_PUSH=false`

```bash
git push -u origin {branch}
```

### §4.2 Post-Implementation Checkpoint

**SKIP ENTIRELY if**: `AFK=true` OR `CONFIRM_PLAN=false`

When skipped: Do NOT prompt the user. Proceed directly to §OUTPUT.

**Interactive confirm mode rule**: When `AFK=false` AND `CONFIRM_PLAN=true`, this checkpoint is REQUIRED. Before entering §OUTPUT, you must complete both actions below in order:
1. Emit `waiting_for_user` for the post-implementation gate
2. Call `ask_user` and wait for the answer

The `waiting_for_user` emit does not replace the `ask_user` call. Continuing to §OUTPUT without both is an invalid workflow transition.

Emit waiting status so the Arcade dashboard reflects the gate pause:

```bash
rp1 agent-tools emit \
  --workflow build-fast \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step build \
  --data '{"prompt": "Continue or make additional changes?", "context": "Post-implementation checkpoint after build phase"}'
```

Present the post-implementation checkpoint to the user:

## Implementation Complete

**Branch**: {branch}
**Artifact**: {artifact_path}

Review the changes.

**Mandatory checkpoint**: The very next action must be the `ask_user` call below. Do NOT continue to §OUTPUT until the user has answered. Do NOT skip this gate when `AFK=false` and `CONFIRM_PLAN=true`.

{% ask_user "Continue or make additional changes?", options: "Done", "Add/Edit", "Review feedback from Arcade" %}

**On "Add/Edit"**: Prompt for additional request, re-invoke §PHASE-2 with new request appended.
**On "Review feedback from Arcade"**: Load the `arcade-collab` skill (`/rp1-dev:arcade-collab`), then call `rp1 agent-tools feedback read --run-id {RUN_ID} --status open`. If feedback exists, process it per the collaboration loop in the skill. After all feedback is processed, return to this gate and re-present the same options.
**On "Done"**: Continue to output.

**Transition guard**: If `AFK=false` AND `CONFIRM_PLAN=true`, do not enter §OUTPUT unless this checkpoint produced both a `waiting_for_user` emit and an `ask_user` answer in the current run.

## §OUTPUT

Register the artifact in the database:

```bash
rp1 agent-tools emit \
  --workflow build-fast \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step build \
  --data '{"path": "{artifact_relative_path}", "feature": "quick-build", "storageRoot": "work_dir"}'
```

```markdown
## Build Fast Complete

**Request**: {brief summary of DEVELOPMENT_REQUEST}
**Scope**: {scope}
**Artifact**: {artifact_path}
**Branch**: {branch}
**Tasks**: {task_count} tasks ({task_ids})

**Changes**:
{list files modified from builder output}

**Quality**: {format/lint/test status from builder}
**Review**: {PASSED | SKIPPED | FAILED+RETRIED} (based on REVIEW flag)
```

## §ORCHESTRATOR-RULES

**MANDATORY — violations cause eval failure**:

**DO**:
- Spawn agents for every phase (planner, task-builder, reviewer)
- Wait for each spawned agent to complete before proceeding
- Prompt user for interactions (when not AFK)
- Treat interactive checkpoints as hard gates when `AFK=false` AND `CONFIRM_PLAN=true`
- Register artifact via `rp1 agent-tools emit --type artifact_registered` in §OUTPUT — this is REQUIRED

**DO NOT** (hard constraints — never violate these):
- Write/edit ANY source code files directly — planner writes the artifact, task-builder writes code
- Read source code files to understand the task — subagents handle their own context
- Implement anything yourself — you are ONLY a workflow orchestrator, not an implementer
- Skip the task-builder spawn — it is MANDATORY for Small/Medium scope
- Skip a required plan-review or post-implementation checkpoint in interactive confirm mode
- Write the plan artifact yourself if the planner fails — retry the planner instead
- Fall back to manual implementation if any agent fails — retry once, then STOP with error

## §ANTI-LOOP

Single-pass per phase. Parse args -> plan -> [checkpoint] -> execute via task-builder -> [review] -> [checkpoint] -> STOP.
