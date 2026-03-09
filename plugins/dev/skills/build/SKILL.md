---
name: build
description: "End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 3.0.0
  tags:
    - core
    - feature
    - orchestration
  created: 2025-12-30
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id> [requirements...] [--afk] [--git-commit] [--git-push] [--git-pr]"
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

**YOU ARE A PURE ORCHESTRATOR.** Spawn agents via Task tool. NEVER write/edit/read files yourself. NEVER implement code, requirements, designs, or tests. Use exact `subagent_type` per step — no `general-purpose` or `Explore`. If agent fails, retry it — never do its work.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FEATURE_ID` | Yes | - | Feature identifier (kebab-case) |
| `REQUIREMENTS` | No | `""` | Raw requirements text |
| `AFK` | No | `false` | Non-interactive mode |
| `GIT_COMMIT` | No | `false` | Commit changes after build |
| `GIT_PUSH` | No | `false` | Push branch to remote |
| `GIT_PR` | No | `false` | Create PR (implies push+commit) |

**Resolve**: `RP1_ROOT` = !`rp1 agent-tools rp1-root-dir` (extract `data.root`)
**Feature dir**: `{{$RP1_ROOT}}/work/features/{FEATURE_ID}/`
**Flags**: GIT_PR → GIT_PUSH=true → GIT_COMMIT=true

## §0-FIRST-ACTION

**FIRST tool call MUST be:**

```
Task: rp1-dev:build-artifact-detector
prompt: FEATURE_ID={FEATURE_ID}, RP1_ROOT={{$RP1_ROOT}}
```

Do NOT read files, load KB, or analyze requirements before this completes.
Parse response: extract `start_step` (1-6) and `artifacts` status.

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

Report each transition: `rp1 agent-tools work update --project "$(pwd)" --feature {FEATURE_ID} --workflow build --run-id {RUN_ID} --step {STATE} --status started`
Generate `RUN_ID` as UUID at start. Terminal states (`→ [*]`): report `--status completed`.

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

```
Task: rp1-dev:feature-requirement-gatherer
prompt: FEATURE_ID={FEATURE_ID}, REQUIREMENTS={REQUIREMENTS}, AFK={AFK}, RP1_ROOT={{$RP1_ROOT}}, WORKFLOW=build, RUN_ID={RUN_ID}
```

**Checkpoint** (skip if AFK): AskUserQuestion with options "Continue" / "Revise" / "Stop".
On Revise: get feedback, append to REQUIREMENTS, re-invoke step 1.
On Stop: output summary, exit with `/build {FEATURE_ID}` resume instruction.

## §STEP-2: Design

**Skip if**: start_step > 2. **Spawn agent — do NOT design yourself:**

```
Task: rp1-dev:feature-architect
prompt: FEATURE_ID={FEATURE_ID}, AFK={AFK}, UPDATE_MODE={design.md exists}, RP1_ROOT={{$RP1_ROOT}}, WORKFLOW=build, RUN_ID={RUN_ID}
```

If `flagged_hypotheses` non-empty:
```
Task: rp1-dev:hypothesis-tester
prompt: FEATURE_ID={FEATURE_ID}, WORKFLOW=build, RUN_ID={RUN_ID}
```

```
Task: rp1-dev:feature-tasker
prompt: FEATURE_ID={FEATURE_ID}, UPDATE_MODE={UPDATE_MODE}, RP1_ROOT={{$RP1_ROOT}}, WORKFLOW=build, RUN_ID={RUN_ID}
```

**Checkpoint** (skip if AFK): AskUserQuestion with options "Continue" / "Revise" / "Stop".
On Revise: get feedback, re-invoke §STEP-2 with UPDATE_MODE=true.
On Stop: output summary (steps 1-2 done), exit with `/build {FEATURE_ID}`.

## §STEP-3: Tasks

**Skip if**: start_step > 3. **Spawn agent:**

```
Task: rp1-dev:feature-tasker
prompt: FEATURE_ID={FEATURE_ID}, UPDATE_MODE=false, RP1_ROOT={{$RP1_ROOT}}, WORKFLOW=build, RUN_ID={RUN_ID}
```

**Checkpoint** (skip if AFK): AskUserQuestion with options "Continue" / "Revise" / "Stop".
On Revise: get feedback, re-invoke §STEP-3 with UPDATE_MODE=true and feedback as UPDATE_CONTEXT.
On Stop: output summary (steps 1-3 done), exit with `/build {FEATURE_ID}`.

## §STEP-4: Build

**Skip if**: start_step > 4. **You MUST spawn task-builder — do NOT write code yourself.**

### §4.1 Parse + Group

```
Task: rp1-dev:build-task-parser
prompt: TASKS_PATH={{$RP1_ROOT}}/work/features/{FEATURE_ID}/tasks.md
```
Extract `implementation_tasks`, `doc_tasks`.

```
Task: rp1-dev:build-task-grouper
prompt: TASKS: {implementation_tasks JSON}, MAX_SIMPLE_BATCH: 3, COMPLEX_ISOLATED: true
```
Extract `task_units` array.

### §4.2 Builder-Reviewer Loop

```
for unit in task_units:
  attempt=1, max=2, feedback=null
  while attempt <= max:
    Task: rp1-dev:task-builder (FEATURE_ID, TASK_IDS, WORKTREE_PATH, GIT_COMMIT, feedback, WORKFLOW=build, RUN_ID={RUN_ID})
    Task: rp1-dev:task-reviewer (FEATURE_ID, TASK_IDS, WORKTREE_PATH, GIT_COMMIT, WORKFLOW=build, RUN_ID={RUN_ID})
    if SUCCESS: break
    elif attempt < max: feedback=result, attempt++
    else: escalate (AFK: mark blocked; Interactive: prompt)
```

### §4.3 Post-Build

Doc tasks (TD*): build doc_scan_results.json, spawn scribe.

**Checkpoint** (skip if AFK): AskUserQuestion with options "Continue" / "Add Task" / "Stop".
On Add Task: spawn builder+reviewer for ad-hoc TX-{timestamp} task, loop back.

## §STEP-5: Verify

**Skip if**: start_step > 5. **Invoke ALL THREE in SINGLE response:**

```
Task: rp1-dev:code-checker (FEATURE_ID, branch, WORKTREE_PATH)
Task: rp1-dev:feature-verifier (FEATURE_ID, RP1_ROOT, WORKTREE_PATH, WORKFLOW=build, RUN_ID={RUN_ID})
Task: rp1-dev:comment-cleaner (MODE=clean, SCOPE=branch, COMMIT_CHANGES={GIT_COMMIT}, WORKTREE_PATH)
```

Then aggregate:
```
Task: rp1-dev:build-verify-aggregator
prompt: PHASE_RESULTS: { code_checker: {...}, feature_verifier: {...}, comment_cleaner: {...} }
```
Extract `overall_status`, `ready_for_merge`, `manual_items`.

### Git Operations (conditional)

If GIT_COMMIT: stage+commit. If GIT_PUSH: push. If GIT_PR: create PR.

## §6 SUMMARY

Register artifacts: for each file in `{{$RP1_ROOT}}/work/features/{FEATURE_ID}/`:
```bash
rp1 agent-tools work artifact --project "$(pwd)" --feature {FEATURE_ID} --run-id {RUN_ID} --path {relative_path}
```

Output: Feature ID, step status table (1-6), artifacts created.

**Post-verify** (skip if AFK): AskUserQuestion: "Add task" / "Archive" / "Do nothing".

### Archive (skip if "Do nothing")

```
Task: rp1-dev:feature-archiver
prompt: MODE=archive, FEATURE_ID={FEATURE_ID}, SKIP_DOC_CHECK=false
```

## §ANTI-LOOP

Single-pass execution. Parse → detect → run steps → STOP.
