---
name: feature-archive
version: 1.1.0
description: Archives a completed feature to {RP1_ROOT}/work/archives/features/. Supports --afk mode for autonomous execution.
argument-hint: "feature-id [--afk]"
tags: [feature, archive, lifecycle]
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Archive

Archives completed feature docs from active -> archives dir.

## Usage

```
/rp1-dev:feature-archive <feature-id> [--afk]
```

## Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| FEATURE_ID | $1 | (required) | Feature identifier to archive |
| --afk | flag | `false` | Enable non-interactive mode (archives without confirmation prompts) |

## AFK Mode Detection

**Parse arguments for --afk flag**:

Check if `--afk` appears in any argument position. Set AFK_MODE accordingly:

```
AFK_MODE = false
if "--afk" appears in $1 or $2:
    AFK_MODE = true
```

**When AFK_MODE is true**:
- Skip all confirmation prompts (AskUserQuestion)
- Auto-proceed with archiving even for minimal documentation
- Log the auto-selected action for user review

## Behavior

- Moves `{RP1_ROOT}/work/features/<feature-id>/` -> `{RP1_ROOT}/work/archives/features/<feature-id>/`
- Creates archives/features/ if missing
- Existing archive ID -> appends timestamp suffix
- Validates docs exist before archiving

## Execution

### Step 1: Invoke Agent

Task tool:
- `subagent_type`: `rp1-dev:feature-archiver`
- `prompt`:
```
MODE: archive
FEATURE_ID: $1
SKIP_DOC_CHECK: false
```

### Step 2: Handle Response

If agent returns JSON w/ `type: "needs_confirmation"`:
```json
{"type":"needs_confirmation","reason":"minimal_docs","feature_id":"...","message":"..."}
```

#### Interactive Mode (AFK_MODE = false)

AskUserQuestion:
```
questions:
  - question: "Feature '{feature_id}' has minimal documentation (no requirements.md or design.md). Archive anyway?"
    header: "Confirm"
    options:
      - label: "Yes - Archive anyway"
        description: "Proceed with archiving despite minimal documentation"
      - label: "No - Cancel"
        description: "Abort the archive operation"
    multiSelect: false
```

- **Yes**: Re-invoke w/ `SKIP_DOC_CHECK: true`
- **No**: Output `Archive aborted by user` + STOP

#### AFK Mode (AFK_MODE = true)

**Skip the AskUserQuestion prompt entirely**. Automatically proceed with archiving:

1. Re-invoke the feature-archiver agent with `SKIP_DOC_CHECK: true`:
   - `subagent_type`: `rp1-dev:feature-archiver`
   - `prompt`: `MODE: archive, FEATURE_ID: {feature_id}, SKIP_DOC_CHECK: true`

2. Log the auto-selected action:
   ```
   ## AFK Mode: Auto-Selected Actions

   | Action | Choice | Rationale |
   |--------|--------|-----------|
   | Minimal docs confirmation | Auto-proceed | AFK mode - archiving without confirmation prompt |
   ```

### Step 3: Report

Display agent success output directly.
