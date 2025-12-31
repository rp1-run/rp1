---
name: blueprint-archive
version: 1.0.0
description: Archives a completed PRD to {RP1_ROOT}/work/archives/prds/ with associated features
argument-hint: "prd-name"
tags: [blueprint, prd, archive, lifecycle]
created: 2025-12-31
author: cloud-on-prem/rp1
---

# PRD Archive

Archives completed PRD docs from active -> archives dir with associated features.

## Usage

```
/rp1-dev:blueprint-archive <prd-name>
```

**Params**: `prd-name` (req) - PRD filename without extension

## Behavior

- Moves `{RP1_ROOT}/work/prds/<prd-name>.md` -> `{RP1_ROOT}/work/archives/prds/<prd-name>/prd.md`
- Archives associated completed features to `{RP1_ROOT}/work/archives/features/`
- Generates `closure_summary.md` with archive metadata
- Checks KB staleness and suggests `/knowledge-build` if needed
- Creates archive directories if missing

## Execution

### Step 1: Scan PRD

Task tool:

- `subagent_type`: `rp1-dev:prd-archiver`
- `prompt`:

```
MODE: scan
PRD_NAME: $1
```

### Step 2: Handle Scan Response

Parse JSON response from agent.

**Error Response** (`type: "error"`):
```json
{"type":"error","message":"...","available_prds":["prd1","prd2"]}
```
Output error message with available PRDs list, then STOP.

**Needs Confirmation** (`type: "needs_confirmation"`):
```json
{
  "type": "needs_confirmation",
  "prd_name": "...",
  "prd_title": "...",
  "associated_features": [...],
  "message": "..."
}
```

Continue to Step 3.

### Step 3: Confirm Closure Status

AskUserQuestion:

```
questions:
  - question: "Archive PRD '{prd_name}' ({prd_title})? {message}"
    header: "PRD Archive"
    options:
      - label: "Yes - Objectives fully met"
        description: "Archive with Complete status"
      - label: "Partial - Some objectives met"
        description: "Archive with documented gaps"
      - label: "No - Cancel"
        description: "Abort archival"
    multiSelect: false
```

Handle response:

- **"Yes"**: Go to Step 4 with `CLOSURE_STATUS=complete`
- **"Partial"**: Go to Step 4a
- **"No"**: Output `Archive aborted by user.` + STOP

### Step 4a: Document Gaps (Partial Only)

AskUserQuestion:

```
questions:
  - question: "Document the gaps or unmet objectives:"
    header: "Gap Documentation"
```

Capture response as `GAPS`.

### Step 4: Execute Archive

Task tool:

- `subagent_type`: `rp1-dev:prd-archiver`
- `prompt`:

```
MODE: archive
PRD_NAME: $1
CLOSURE_STATUS: {complete|partial}
GAPS: {user-provided gaps or empty}
```

### Step 5: Report

Display agent success output directly. Include:

- PRD name and archive location
- Features archived vs skipped
- KB staleness suggestion if applicable
