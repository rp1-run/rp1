---
name: build
description: "End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: resumable
    identity_args:
      - FEATURE_ID
  version: 3.0.0
  tags:
    - core
    - feature
    - orchestration
  created: 2025-12-30
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier (kebab-case)"
    - name: REQUIREMENTS
      type: string
      required: false
      default: ""
      description: "Raw requirements text"
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
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: false
      description: "Commit changes after build"
    - name: GIT_PUSH
      type: boolean
      required: false
      default: false
      description: "Push branch to remote"
      implies:
        - GIT_COMMIT
    - name: GIT_PR
      type: boolean
      required: false
      default: false
      description: "Create PR after build"
      implies:
        - GIT_PUSH
        - GIT_COMMIT
  sub_agents:
    - "rp1-dev:build-artifact-detector"
    - "rp1-dev:feature-requirement-gatherer"
    - "rp1-dev:feature-architect"
    - "rp1-dev:hypothesis-tester"
    - "rp1-dev:feature-tasker"
    - "rp1-dev:task-builder"
    - "rp1-dev:task-reviewer"
    - "rp1-dev:code-checker"
    - "rp1-dev:feature-verifier"
    - "rp1-dev:comment-cleaner"
    - "rp1-dev:build-task-parser"
    - "rp1-dev:build-task-grouper"
    - "rp1-dev:build-verify-aggregator"
    - "rp1-dev:feature-archiver"
---

# Build Command

**YOU ARE A PURE ORCHESTRATOR.** Spawn agents for all work. NEVER write/edit/read files yourself. NEVER implement code, requirements, designs, or tests. Use exact agent references per step. If agent fails, retry it — never do its work.

## §CTX

Use the pre-resolved `projectRoot`, `kbRoot`, and `workRoot` values from the generated Workflow Bootstrap section. Do not hardcode `.rp1/work/` or `.rp1/context/` paths.

**Feature dir**: `{workRoot}/features/{FEATURE_ID}/`

## §0-FIRST-ACTION

After the generated Workflow Bootstrap section resolves `RUN_ID`, `RUN_RESUMED`, and the canonical directories, the first prompt-authored action MUST be:

{% dispatch_agent "rp1-dev:build-artifact-detector" %}
FEATURE_ID={FEATURE_ID}, WORKFLOW_TYPE=build, RUN_ID={RUN_ID}, RUN_RESUMED={RUN_RESUMED}, WORK_ROOT={workRoot}
{% enddispatch_agent %}

Do NOT read files, load KB, or analyze requirements before this completes.
Parse response: extract `start_step` (1-6), `artifacts` status, and optional `unregistered_artifacts`.

**Artifact Reconciliation**: If `RUN_RESUMED` is `true` and `unregistered_artifacts` is present and non-empty, register each artifact under the resumed run:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step build \
  --data '{"path": "{relative_path}", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
```

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> requirements
    requirements --> design : reqs_complete
    design --> tasks : design_complete
    tasks --> build : tasks_ready
    build --> verify : build_complete
    verify --> build : verify_failed
    verify --> archive : verify_passed
    archive --> [*] : done
```

**First emit** (entering the first active state): include `--name` to label the run:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step {STATE} \
  --name "Feature: {FEATURE_ID}" \
  --data '{"status": "running", "feature": "{FEATURE_ID}"}'
```

Subsequent state transitions omit `--name` (set-once semantics; the DB keeps the first value):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step {STATE} \
  --data '{"status": "running", "feature": "{FEATURE_ID}"}'
```

`RUN_ID` comes from the generated Workflow Bootstrap section. Do NOT override it.

## §PROGRESS

| Step | Agent(s) |
|------|----------|
| 1 Requirements | feature-requirement-gatherer |
| 2 Design | feature-architect, hypothesis-tester (opt), feature-tasker |
| 3 Tasks | feature-tasker |
| 4 Build | build-task-parser, build-task-grouper, task-builder, task-reviewer |
| 5 Verify | code-checker, feature-verifier, comment-cleaner, build-verify-aggregator |
| 6 Archive | feature-archiver |

Symbols: `[ ]`=PENDING `[~]`=RUNNING `[x]`=COMPLETED `[-]`=SKIPPED `[!]`=FAILED
Steps 1-3 foundational → ABORT on fail. Steps 4-6 → retry/prompt. NEVER delete artifacts.
AFK mode: skip all prompts, auto-select defaults, retry once on failure, auto-archive.

---

## §STEP-1: Requirements

**Skip if**: start_step > 1. **Spawn agent — do NOT gather requirements yourself:**

{% dispatch_agent "rp1-dev:feature-requirement-gatherer" %}
FEATURE_ID={FEATURE_ID}, REQUIREMENTS={REQUIREMENTS}, AFK={AFK}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Validate the response before continuing:

- Accept only the documented completion contract from `feature-requirement-gatherer`: JSON with `"status": "success"` and an `"artifact"` path ending in `features/{FEATURE_ID}/requirements.md`, or a text line matching `Requirements completed:` followed by a path ending in `features/{FEATURE_ID}/requirements.md`.
- Treat any response that mentions commits, source-code edits, tests, verification, unrelated file paths, or implementation completion as a contract failure.
- On contract failure: retry step 1 once with an explicit reminder that the agent may only write `requirements.md` and must not implement anything.
- If the retry also fails, abort the build as failed. Do not continue to design, build, verify, or archive based on non-compliant output.

**Checkpoint** (skip if AFK):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step requirements \
  --data '{"prompt": "Continue, Revise, Review feedback from Arcade, or Stop?", "context": "Requirements gathering complete"}'
```

{% ask_user "Continue, Revise, Review feedback from Arcade, or Stop?", options: "Continue", "Revise", "Review feedback from Arcade", "Stop" %}
On Revise: get feedback, append to REQUIREMENTS, re-invoke step 1.
On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.
On Stop: emit waiting status, output summary, exit with `/build {FEATURE_ID}` resume instruction.

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step requirements \
  --data '{"status": "waiting", "feature": "{FEATURE_ID}"}'
```

## §STEP-2: Design

**Skip if**: start_step > 2. **Spawn agent — do NOT design yourself:**

{% dispatch_agent "rp1-dev:feature-architect" %}
FEATURE_ID={FEATURE_ID}, AFK={AFK}, UPDATE_MODE={design.md exists}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

If `flagged_hypotheses` non-empty:

{% dispatch_agent "rp1-dev:hypothesis-tester" %}
FEATURE_ID={FEATURE_ID}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:feature-tasker" %}
FEATURE_ID={FEATURE_ID}, UPDATE_MODE={UPDATE_MODE}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Checkpoint** (skip if AFK):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step design \
  --data '{"prompt": "Continue, Revise, Review feedback from Arcade, or Stop?", "context": "Design and task generation complete"}'
```

{% ask_user "Continue, Revise, Review feedback from Arcade, or Stop?", options: "Continue", "Revise", "Review feedback from Arcade", "Stop" %}
On Revise: get feedback, re-invoke §STEP-2 with UPDATE_MODE=true.
On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.
On Stop: emit waiting status, output summary (steps 1-2 done), exit with `/build {FEATURE_ID}`.

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step design \
  --data '{"status": "waiting", "feature": "{FEATURE_ID}"}'
```

## §STEP-3: Tasks

**Skip if**: start_step > 3. **Spawn agent:**

{% dispatch_agent "rp1-dev:feature-tasker" %}
FEATURE_ID={FEATURE_ID}, UPDATE_MODE=false, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Checkpoint** (skip if AFK):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step tasks \
  --data '{"prompt": "Continue, Revise, Review feedback from Arcade, or Stop?", "context": "Task breakdown complete"}'
```

{% ask_user "Continue, Revise, Review feedback from Arcade, or Stop?", options: "Continue", "Revise", "Review feedback from Arcade", "Stop" %}
On Revise: get feedback, re-invoke §STEP-3 with UPDATE_MODE=true and feedback as UPDATE_CONTEXT.
On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.
On Stop: emit waiting status, output summary (steps 1-3 done), exit with `/build {FEATURE_ID}`.

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step tasks \
  --data '{"status": "waiting", "feature": "{FEATURE_ID}"}'
```

## §STEP-4: Build

**Skip if**: start_step > 4. **You MUST spawn task-builder — do NOT write code yourself.**

### §4.1 Parse + Group

{% dispatch_agent "rp1-dev:build-task-parser" %}
TASKS_PATH={workRoot}/features/{FEATURE_ID}/tasks.md
{% enddispatch_agent %}

Extract `implementation_tasks`, `doc_tasks`.

{% dispatch_agent "rp1-dev:build-task-grouper" %}
TASKS: {implementation_tasks JSON}, MAX_SIMPLE_BATCH: 3, COMPLEX_ISOLATED: true
{% enddispatch_agent %}

Extract `task_units` array.

### §4.2 Builder-Reviewer Loop

For each task unit, run builder then reviewer:

{% dispatch_agent "rp1-dev:task-builder" %}
FEATURE_ID={FEATURE_ID}, TASK_IDS={TASK_IDS}, GIT_COMMIT={GIT_COMMIT}, FEEDBACK={feedback}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:task-reviewer" %}
FEATURE_ID={FEATURE_ID}, TASK_IDS={TASK_IDS}, GIT_COMMIT={GIT_COMMIT}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

Loop logic: attempt=1, max=2. If reviewer reports SUCCESS: move to next unit. If FAILURE and attempt < max: pass feedback to builder, retry. If retrying and `GIT_COMMIT=true`, set `REWRITE_COMMITS=true` so the builder can amend the prior commit into proper atomic format. Else: escalate (AFK: mark blocked; Interactive: prompt user).

### §4.3 Post-Build

Doc tasks (TD*): build doc_scan_results.json, spawn scribe.

**Checkpoint** (skip if AFK):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step build \
  --data '{"prompt": "Continue, Add Task, Review feedback from Arcade, or Stop?", "context": "Build phase complete"}'
```

{% ask_user "Continue, Add Task, Review feedback from Arcade, or Stop?", options: "Continue", "Add Task", "Review feedback from Arcade", "Stop" %}
On Add Task: spawn builder+reviewer for ad-hoc TX-{timestamp} task, loop back.
On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.

### §4.4 Close Build Step

**Before transitioning to verify**, emit `build → completed` (required even if sub-tasks had retried/escalated failures):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step build \
  --data '{"status": "completed", "feature": "{FEATURE_ID}"}'
```

## §STEP-5: Verify

**Skip if**: start_step > 5. **Invoke ALL THREE in SINGLE response:**

{% dispatch_agent "rp1-dev:code-checker" %}
FEATURE_ID={FEATURE_ID}, BRANCH={branch}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:feature-verifier" %}
FEATURE_ID={FEATURE_ID}, WORKFLOW=build, RUN_ID={RUN_ID}
{% enddispatch_agent %}

{% dispatch_agent "rp1-dev:comment-cleaner" %}
MODE=clean, SCOPE=branch, COMMIT_CHANGES={GIT_COMMIT}
{% enddispatch_agent %}

Then aggregate:

{% dispatch_agent "rp1-dev:build-verify-aggregator" %}
PHASE_RESULTS: { code_checker: {...}, feature_verifier: {...}, comment_cleaner: {...} }
{% enddispatch_agent %}

Extract `overall_status`, `ready_for_merge`, `manual_items`.

### Git Operations (conditional)

If GIT_COMMIT: stage+commit. If GIT_PUSH: push. If GIT_PR: create PR.

## §6 SUMMARY

Register artifacts: for each file in `{workRoot}/features/{FEATURE_ID}/`:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step archive \
  --data '{"path": "{relative_path}", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
```

Output: Feature ID, step status table (1-6), artifacts created.

**Emit completed status** after registering all artifacts:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step archive \
  --data '{"status": "completed", "feature": "{FEATURE_ID}"}'
```

**Post-verify** (skip if AFK):

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step verify \
  --data '{"prompt": "Add task, Archive, Review feedback from Arcade, or Do nothing?", "context": "Verification complete"}'
```

{% ask_user "Add task, Archive, Review feedback from Arcade, or Do nothing?", options: "Add task", "Archive", "Review feedback from Arcade", "Do nothing" %}
On Review feedback from Arcade: load `arcade-collab` skill, process all feedback for RUN_ID, then return to this checkpoint with original options.

### Archive (skip if "Do nothing")

{% dispatch_agent "rp1-dev:feature-archiver" %}
MODE=archive, FEATURE_ID={FEATURE_ID}, SKIP_DOC_CHECK=false
{% enddispatch_agent %}

## §TERMINAL-STATES

**Every exit path MUST emit a terminal status.** No run may remain in "running" after the skill finishes.

| Exit Path | Status | Step |
|-----------|--------|------|
| Archive completes successfully | `completed` | `archive` |
| User selects "Stop" at any checkpoint | `waiting` | current step |
| User selects "Do nothing" at post-verify | `completed` | `archive` |
| Unrecoverable agent failure (steps 1-3) | `failed` | failing step |
| AFK mode abort | `failed` | failing step |

On any unrecoverable failure, emit before exiting:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step {FAILING_STEP} \
  --data '{"status": "failed", "feature": "{FEATURE_ID}"}'
```

## §ANTI-LOOP

Single-pass execution. Parse → detect → run steps → STOP.
