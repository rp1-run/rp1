---
name: feature-archive
version: 1.0.0
description: Archives a completed feature to {RP1_ROOT}/work/archives/features/
argument-hint: "feature-id"
tags: [feature, archive, lifecycle]
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Archive

Archives completed feature docs from active -> archives dir.

## Usage

```
/rp1-dev:feature-archive <feature-id>
```

**Params**: `feature-id` (req) - Feature ID to archive

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

### Step 3: Report

Display agent success output directly.
