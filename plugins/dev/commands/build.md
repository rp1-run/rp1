---
name: build
version: 2.1.0
description: End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command.
argument-hint: "feature-id [requirements] [--afk] [--no-worktree] [--push] [--create-pr]"
tags:
  - core
  - feature
  - orchestration
created: 2025-12-30
author: cloud-on-prem/rp1
---

# Build Command

6-step workflow orchestrator. Delegates execution to specialized agents.

## §PARAMS

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| FEATURE_ID | $1 | (req) | Feature identifier |
| REQUIREMENTS | $2 | "" | Raw requirements |
| --afk | flag | false | Non-interactive mode |
| --no-worktree | flag | false | Disable worktree |
| --push | flag | false | Push branch |
| --create-pr | flag | false | Create PR (implies --push) |
| RP1_ROOT | env | `.rp1/` | Root dir |

<feature_id>$1</feature_id>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Parse flags**: `AFK_MODE`, `USE_WORKTREE`, `PUSH_BRANCH`, `CREATE_PR` from args.

**Feature dir**: `{RP1_ROOT}/work/features/{FEATURE_ID}/`

## §AFK-MODE

Skip prompts, auto-select defaults, retry once on failure, auto-archive.

## §ARTIFACT-DETECTION

**Spawn agent**:

```
Task: rp1-dev:build-artifact-detector
prompt: FEATURE_ID={FEATURE_ID}, RP1_ROOT={RP1_ROOT}
```

**Parse response**: Extract `start_step` (1-6) and `artifacts` status.

## §PROGRESS

| Step | Name | Agent(s) |
|------|------|----------|
| 1 | Requirements | feature-requirement-gatherer |
| 2 | Design | feature-architect, hypothesis-tester (opt), feature-tasker |
| 3 | Tasks | feature-tasker |
| 4 | Build | build-task-parser, build-task-grouper, task-builder, task-reviewer, test-runner, comment-cleaner, scribe |
| 5 | Verify | code-checker, feature-verifier, comment-cleaner, build-verify-aggregator |
| 6 | Archive | feature-archiver |

**Symbols**: `[ ]`=PENDING, `[~]`=RUNNING, `[x]`=COMPLETED, `[-]`=SKIPPED, `[!]`=FAILED

## §ERROR-HANDLING

Steps 1-3 foundational -> ABORT on fail. Steps 4-6 -> retry/prompt. NEVER delete artifacts.

---

## §STEP-1: Requirements

**Skip if**: start_step > 1

```
Task: rp1-dev:feature-requirement-gatherer
prompt: FEATURE_ID={FEATURE_ID}, AFK_MODE={AFK_MODE}, RP1_ROOT={RP1_ROOT}
```

## §STEP-2: Design

**Skip if**: start_step > 2

```
Task: rp1-dev:feature-architect
prompt: FEATURE_ID={FEATURE_ID}, AFK_MODE={AFK_MODE}, UPDATE_MODE={design.md exists}, RP1_ROOT={RP1_ROOT}
```

If `flagged_hypotheses` non-empty:

```
Task: rp1-dev:hypothesis-tester
prompt: Validate hypotheses for feature {FEATURE_ID}
```

```
Task: rp1-dev:feature-tasker
prompt: FEATURE_ID={FEATURE_ID}, UPDATE_MODE={UPDATE_MODE}, RP1_ROOT={RP1_ROOT}
```

## §STEP-3: Tasks

**Skip if**: start_step > 3

```
Task: rp1-dev:feature-tasker
prompt: FEATURE_ID={FEATURE_ID}, UPDATE_MODE=false, RP1_ROOT={RP1_ROOT}
```

## §STEP-4: Build

**Skip if**: start_step > 4

### §4.1 Worktree Setup

**Skip if**: `--no-worktree`

```
Skill: rp1-dev:worktree-workflow
args: task_slug={FEATURE_ID}, agent_prefix=feature, create_pr={CREATE_PR}
```

Store: `worktree_path`, `branch`, `basedOn`

### §4.2 Task Parsing

**Spawn agent**:

```
Task: rp1-dev:build-task-parser
prompt: TASKS_PATH={RP1_ROOT}/work/features/{FEATURE_ID}/tasks.md
```

**Parse response**: Extract `implementation_tasks`, `doc_tasks`, `summary`.

### §4.3 Task Grouping

**Spawn agent** (with pending implementation_tasks):

```
Task: rp1-dev:build-task-grouper
prompt: |
  TASKS: {implementation_tasks JSON}
  MAX_SIMPLE_BATCH: 3
  COMPLEX_ISOLATED: true
```

**Parse response**: Extract `task_units` array.

### §4.4 Builder-Reviewer Loop

```
for unit in task_units:
  attempt=1, max=2, feedback=null
  while attempt <= max:
    Task: rp1-dev:task-builder (FEATURE_ID, TASK_IDS, WORKTREE_PATH, feedback)
    Task: rp1-dev:task-reviewer (FEATURE_ID, TASK_IDS, WORKTREE_PATH)
    if SUCCESS: break
    elif attempt < max: feedback=result, attempt++
    else: escalate (AFK: mark blocked; Interactive: prompt)
```

### §4.5 Post-Build

**Doc Tasks** (TD*): Build `doc_scan_results.json`, spawn scribe.

## §STEP-5: Verify

**Skip if**: start_step > 5

### §5.1 Parallel Phases

**CRITICAL**: Invoke ALL THREE in SINGLE response.

```
Task: rp1-dev:code-checker (FEATURE_ID, branch, WORKTREE_PATH=worktree_path)
Task: rp1-dev:feature-verifier (FEATURE_ID, RP1_ROOT, WORKTREE_PATH=worktree_path)
Task: rp1-dev:comment-cleaner (MODE=clean, SCOPE=branch COMMIT_CHANGES=true WORKTREE_PATH=worktree_path)
```

### §5.2 Aggregate Results

**Spawn agent**:

```
Task: rp1-dev:build-verify-aggregator
prompt: |
  PHASE_RESULTS: {
    "code_checker": {result from code-checker},
    "feature_verifier": {result from feature-verifier},
    "comment_cleaner": {result from comment-cleaner}
  }
```

**Parse response**: Extract `overall_status`, `ready_for_merge`, `manual_items`.

### §5.3 Manual Verification

If `manual_items` non-empty: Append to tasks.md `## Manual Verification` section.

### §5.4 Worktree Finalization and Git operations

validate commits; cleanup worktree; push if requested; create PR if requested.

## §6 SUMMARY

Output: Feature ID, step status table (1-6), artifacts created.

### §6.1 Post-Verify (Interactive Only)

**Skip if**: AFK_MODE

AskUserQuestion: "Add task" -> spawn builder/reviewer. "Archive" -> Step 6. "Do nothing" -> exit.

### §STEP-6.2: Archive

**Skip if**: User chose "Do nothing"

```
Task: rp1-dev:feature-archiver
prompt: MODE=archive, FEATURE_ID={FEATURE_ID}, SKIP_DOC_CHECK=false
```

## §ANTI-LOOP

Single-pass execution. No clarification mid-workflow. Parse -> detect -> run steps -> STOP.
