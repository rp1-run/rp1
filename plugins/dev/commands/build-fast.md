---
name: build-fast
version: 3.0.0
description: Quick-iteration development for small/medium scope changes with TIN architecture.
argument-hint: "[development-request...] [--afk] [--confirm] [--git-worktree] [--git-commit] [--git-push]"
tags:
  - core
  - code
  - feature
created: 2026-01-01
author: cloud-on-prem/rp1
---

# Build Fast Command

Quick-iteration workflow for focused changes. Two-phase execution with optional plan confirmation.

## §ARGUMENTS

| Key | Description |
|-----|-------------|
| `DEVELOPMENT_REQUEST` | Freeform development request (required) |
| `AFK` | Non-interactive mode flag |
| `CONFIRM` | Pause after planning for user confirmation |
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

**Override**: If `AFK=true`, then `CONFIRM=false` (AFK mode skips all confirmations).

## §PHASE-1: Planning

**Spawn agent**:

```
Task: rp1-dev:build-fast-planner
prompt: DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}, RP1_ROOT={RP1_ROOT}
```

**Parse response**: Extract `scope`, `plan_summary`, `files_affected`, `reasoning`.

### §1.1 Large Scope Redirect

If `scope` = "Large":

Output the planner's redirect message and STOP.

### §1.2 Plan Review Checkpoint

**Skip if**: `CONFIRM=false` OR `AFK=true`

```
AskUserQuestion: |
  Plan created for quick build. Review:

  **Scope**: {scope}
  **Reasoning**: {reasoning}
  **Files**: {files_affected}

  **Summary**:
  {plan_summary}

  Options:
  1. "Continue" - Proceed with implementation
  2. "Revise" - Re-plan with feedback
  3. "Stop" - Exit (no changes made)
```

**On "Revise"**: Prompt for feedback, re-invoke §PHASE-1 with feedback appended to DEVELOPMENT_REQUEST.
**On "Stop"**: Output "Build fast cancelled. No changes made." and STOP.

## §PHASE-2: Execution

**Spawn agent**:

```
Task: rp1-dev:build-fast-executor
prompt: |
  DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}
  PLAN_SUMMARY={plan_summary}
  SCOPE={scope}
  FILES_AFFECTED={files_affected}
  AFK={AFK}
  GIT_WORKTREE={GIT_WORKTREE}
  GIT_COMMIT={GIT_COMMIT}
  GIT_PUSH={GIT_PUSH}
  RP1_ROOT={RP1_ROOT}
  SKIP_PLANNING=true
```

## §OUTPUT

Faithfully relay executor output to user.

## §ANTI-LOOP

Single-pass per phase. Parse args -> plan -> [checkpoint] -> execute -> STOP.
