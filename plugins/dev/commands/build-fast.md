---
name: build-fast
version: 1.0.0
description: Quick-iteration development for small/medium scope changes. Replaces code-quick-build with TIN architecture.
argument-hint: "[development-request...] [--afk]"
tags:
  - core
  - code
  - feature
created: 2026-01-01
author: cloud-on-prem/rp1
---

# Build Fast Command

Quick-iteration workflow for focused changes. Delegates execution to build-fast-executor agent.

## PARAMS

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| REQUEST | $ARGUMENTS | (req) | Freeform development request |
| --afk | flag | false | Non-interactive mode |
| RP1_ROOT | env | `.rp1/` | Root dir |

<request>$ARGUMENTS</request>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Parse flags**: Extract `AFK_MODE` boolean from args (true if `--afk` present).

## EXECUTION

**Spawn agent**:

```
Task: rp1-dev:build-fast-executor
prompt: REQUEST={REQUEST}, AFK_MODE={AFK_MODE}, RP1_ROOT={RP1_ROOT}
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

## ANTI-LOOP

Single-pass. Parse args -> spawn agent -> STOP.
