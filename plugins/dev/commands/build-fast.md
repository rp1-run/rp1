---
name: build-fast
version: 3.0.0
description: Quick-iteration development for small/medium scope changes with persistent artifacts and optional review.
allowed-tools:
  - Bash(echo *)
  - Bash(rp1 *)
  - Bash(printf *)
argument-hint: "[development-request...] [--afk] [--confirm-plan] [--review] [--git-worktree] [--git-commit] [--git-push]"
tags:
  - core
  - code
  - feature
created: 2026-01-01
author: cloud-on-prem/rp1
---

# Build Fast Command

Quick-iteration workflow for focused changes. Three-phase execution: plan -> build -> [review].

## §ARGUMENTS

| Key | Description |
|-----|-------------|
| `DEVELOPMENT_REQUEST` | Freeform development request (required) |
| `AFK` | Non-interactive mode flag |
| `CONFIRM_PLAN` | Enable plan review checkpoint and post-implementation review |
| `REVIEW` | Enable task-reviewer validation after implementation |
| `GIT_WORKTREE` | Use isolated git worktree |
| `GIT_COMMIT` | Commit changes |
| `GIT_PUSH` | Push branch to remote |

## §ARGUMENTS PASSED

!`printf '%s' "$ARGUMENTS" | rp1 agent-tools transform-args rp1-dev:build-fast - || echo "RP1_VERSION=0.3.2"`

## §VERSION-GATE

**If** `RP1_VERSION` < 0.3.3 **then** STOP execution with message:

```
Your rp1 CLI needs to be updated.

Please run `/rp1-base:self-update` to update, then retry this command.

Or in the terminal: `rp1 update`
```

## §FLAG-LOGIC

**CRITICAL OVERRIDE**: When `AFK=true`, treat `CONFIRM_PLAN` as `false` regardless of its passed value. AFK mode means zero user interaction - skip ALL `AskUserQuestion` calls throughout this workflow.

**Effective values when AFK=true**:
- `CONFIRM_PLAN` → `false` (forced)
- All checkpoints → SKIP (no AskUserQuestion)

## §PHASE-1: Planning

**Spawn agent**:

```
Task: rp1-dev:build-fast-planner
prompt: DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}, RP1_ROOT={RP1_ROOT}
```

**Parse response**: Extract `scope`, `plan_summary`, `files_affected`, `reasoning`, `artifact_path`, `task_count`, `task_ids`.

### §1.1 Large Scope Redirect

If `scope` = "Large":

Output the planner's `redirect_message` and STOP.

### §1.2 Plan Review Checkpoint

**SKIP ENTIRELY if**: `AFK=true` OR `CONFIRM_PLAN=false`

When skipped: Do NOT call AskUserQuestion. Proceed directly to §PHASE-2.

```
AskUserQuestion: |
  ## Plan Review

  **Scope**: {scope}
  **Estimated Effort**: {estimated_effort from plan}
  **Artifact**: {artifact_path}

  **Tasks**:
  {list tasks from artifact}

  **Files**: {files_affected}

  Options:
  1. "Continue" - Proceed with implementation
  2. "Revise" - Re-plan with your feedback
  3. "Stop" - Exit (artifact preserved for reference)
```

**On "Revise"**: Prompt for feedback, re-invoke §PHASE-1 with feedback appended to DEVELOPMENT_REQUEST.
**On "Stop"**: Output "Build fast cancelled. Artifact preserved at {artifact_path}" and STOP.

## §PHASE-2: Execution

### §2.1 Worktree Setup

**Skip if**: `GIT_WORKTREE=false`

Generate **task_slug** from DEVELOPMENT_REQUEST (2-4 word kebab-case).

```bash
original_cwd=$(pwd)
rp1 agent-tools worktree create {task_slug} --prefix quick-build
```

Parse JSON: `path` (worktree_path), `branch`, `basedOn`. Store with `original_cwd`.

### §2.2 Task Execution

**Spawn agent**:

```
Task: rp1-dev:task-builder
prompt: |
  QUICK_BUILD_PATH={artifact_path}
  TASK_IDS={task_ids}
  WORKTREE_PATH={worktree_path}
  GIT_COMMIT={GIT_COMMIT}
  RP1_ROOT={RP1_ROOT}
```

**Parse response**: Verify "Builder Complete" in output.

## §PHASE-3: Review (Optional)

**Skip if**: `REVIEW=false`

### §3.1 Task Review

**Spawn agent**:

```
Task: rp1-dev:task-reviewer
prompt: |
  QUICK_BUILD_PATH={artifact_path}
  TASK_IDS={task_ids}
  WORKTREE_PATH={worktree_path}
  GIT_COMMIT={GIT_COMMIT}
  RP1_ROOT={RP1_ROOT}
```

**Parse response**: Extract `status` (SUCCESS or FAILURE).

### §3.2 Retry on Failure

If `status` = "FAILURE":

1. Extract `issues` and `summary` from reviewer response
2. Re-invoke task-builder with feedback:

```
Task: rp1-dev:task-builder
prompt: |
  QUICK_BUILD_PATH={artifact_path}
  TASK_IDS={task_ids}
  WORKTREE_PATH={worktree_path}
  GIT_COMMIT={GIT_COMMIT}
  RP1_ROOT={RP1_ROOT}
  PREVIOUS_FEEDBACK={reviewer summary and issues}
```

3. Do NOT retry reviewer after retry builder (max 1 retry total)

## §PHASE-4: Finalization

### §4.1 Push (Conditional)

**Skip if**: `GIT_PUSH=false` OR `GIT_WORKTREE=false`

```bash
cd {worktree_path}
git push -u origin {branch}
```

### §4.2 Worktree Cleanup

**Skip if**: `GIT_WORKTREE=false`

```bash
cd {original_cwd}
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

### §4.3 Post-Implementation Checkpoint

**SKIP ENTIRELY if**: `AFK=true` OR `CONFIRM_PLAN=false`

When skipped: Do NOT call AskUserQuestion. Proceed directly to §OUTPUT.

```
AskUserQuestion: |
  ## Implementation Complete

  **Branch**: {branch}
  **Worktree**: {worktree_path} (or "current directory" if no worktree)
  **Artifact**: {artifact_path}

  Review the changes, then:
  1. "Done" - Finish workflow
  2. "Add/Edit" - Describe additional changes needed
```

**On "Add/Edit"**: Prompt for additional request, re-invoke §PHASE-2 with new request appended.
**On "Done"**: Continue to output.

## §OUTPUT

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

## §ANTI-LOOP

Single-pass per phase. Parse args -> plan -> [checkpoint] -> execute -> [review] -> [checkpoint] -> STOP.
