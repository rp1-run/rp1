---
name: blueprint-archive
version: 1.0.0
description: Archives a completed PRD to {RP1_ROOT}/work/archives/prds/ with closure summary
argument-hint: "prd-name"
tags: [blueprint, prd, archive, lifecycle]
created: 2025-12-30
author: cloud-on-prem/rp1
---

# Blueprint Archive

Archives completed PRD docs from active -> archives dir with closure summary.

## Usage

```
/rp1-dev:blueprint-archive <prd-name>
```

**Params**: `prd-name` (req) - PRD name to archive (without .md extension)

## Behavior

- Moves `{RP1_ROOT}/work/prds/<prd-name>.md` -> `{RP1_ROOT}/work/archives/prds/<prd-name>/prd.md`
- Creates `closure_summary.md` with completion status and feature mapping
- Archives completed associated features
- Checks KB for captured learnings
- Prompts for completion status (Yes/Partial/No)

## Execution

### Step 1: Invoke Agent (Status Check)

Task tool:
- `subagent_type`: `rp1-dev:blueprint-archiver`
- `prompt`:
```
PRD_NAME: $1
```

### Step 2: Handle Status Response

If agent returns `type: "needs_status"`:

AskUserQuestion:
```yaml
questions:
  - question: "Were the PRD objectives met?"
    header: "Status"
    options:
      - label: "Yes - Objectives achieved"
        description: "All or most goals were accomplished"
      - label: "Partial - Some objectives met"
        description: "Some goals achieved, others deferred or descoped"
      - label: "No - Objectives not met"
        description: "PRD abandoned or superseded"
    multiSelect: false
```

Map response:
- "Yes" -> `COMPLETION_STATUS: yes`
- "Partial" -> `COMPLETION_STATUS: partial`
- "No" -> `COMPLETION_STATUS: no`

Re-invoke agent with status:
```
PRD_NAME: $1
COMPLETION_STATUS: {mapped_status}
```

### Step 3: Handle Feature Confirmation

If agent returns `type: "needs_feature_confirmation"`:

AskUserQuestion:
```yaml
questions:
  - question: "Some features are in progress. Archive PRD anyway?"
    header: "Confirm"
    options:
      - label: "Yes - Archive PRD, leave features active"
        description: "Archive the PRD but keep incomplete features in active directory"
      - label: "No - Cancel archive"
        description: "Abort the archive operation"
    multiSelect: false
```

- **Yes**: Re-invoke with `SKIP_FEATURE_CHECK: true`
- **No**: Output `Archive cancelled - features still in progress` + STOP

### Step 4: Handle Aborted

If agent returns `type: "aborted"`:
- Output agent message
- STOP

### Step 5: Report Success

Display agent success output directly.

If `kb_present: false`:
```
Tip: Run `/knowledge-build` to capture learnings from this PRD into the knowledge base.
```
