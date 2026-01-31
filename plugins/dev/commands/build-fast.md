---
name: build-fast
version: 2.0.0
description: Quick-iteration development for small/medium scope changes with TIN architecture.
argument-hint: "[development-request...] [--afk] [--git-worktree] [--git-commit] [--git-push]"
tags:
  - core
  - code
  - feature
created: 2026-01-01
author: cloud-on-prem/rp1
---

# Build Fast Command

Quick-iteration workflow for focused changes. Delegates execution to build-fast-executor agent.

## §PARSE-ARGS

**Run**:
```bash
rp1 agent-tools transform-args rp1-dev:build-fast $ARGUMENTS
```

**On success**: Parse output as `NAME=value` lines. Variables available:
- `DEVELOPMENT_REQUEST` - Freeform development request (required)
- `AFK` - Non-interactive mode flag
- `GIT_WORKTREE` - Use isolated git worktree
- `GIT_COMMIT` - Commit changes
- `GIT_PUSH` - Push branch to remote

**On error** (command not found / unknown command):
```
ERROR: CLI version mismatch. The rp1 CLI needs to be updated.
Please run `/rp1-base:self-update` to update, then retry this command.
```
STOP execution.

$RP1_ROOT = !`echo ${RP1_ROOT:-.rp1/}`

## EXECUTION

**Spawn agent**:

```
Task: rp1-dev:build-fast-executor
prompt: DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}, AFK={AFK}, GIT_WORKTREE={GIT_WORKTREE}, GIT_COMMIT={GIT_COMMIT}, GIT_PUSH={GIT_PUSH}, RP1_ROOT={{$RP1_ROOT}}
```

Agent handles:

- KB loading (progressive)
- Scope assessment (Small/Medium/Large)
- Large scope redirect to /build
- Worktree isolation
- Implementation
- Quality checks
- Summary artifact
- Branch finalization

## Output

Faithfully relay agent output to user.

## ANTI-LOOP

Single-pass. Parse args -> spawn agent -> STOP.
