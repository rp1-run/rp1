---
name: blueprint-archive
description: Archives a completed PRD to the archives directory with associated features and closure summary.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - blueprint
    - prd
    - archive
    - lifecycle
  created: 2025-12-31
  author: cloud-on-prem/rp1
  argument-hint: "<prd-name>"
---

# PRD Archive

Archives completed PRD docs from active -> archives dir with associated features.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `PRD_NAME` | Yes | - | PRD filename without extension (kebab-case) |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)

## Usage

```
/rp1-dev:blueprint-archive <prd-name>
```

## Behavior

- Moves `{{$RP1_ROOT}}/work/prds/<PRD_NAME>.md` -> `{{$RP1_ROOT}}/work/archives/prds/<PRD_NAME>/prd.md`
- Archives associated completed features to `{{$RP1_ROOT}}/work/archives/features/`
- Generates `closure_summary.md` with archive metadata
- Checks KB staleness and suggests `/knowledge-build` if needed
- Creates archive directories if missing

## Execution

### Step 1: Scan PRD

Task tool:
subagent_type: rp1-dev:prd-archiver
prompt: 
MODE: scan
PRD_NAME: {PRD_NAME}

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

AskUserQuestion: "Archive PRD '{PRD_NAME}' ({prd_title})? {message}"
Options:
- Yes - Objectives fully met
- Partial - Some objectives met
- No - Cancel

Handle response:

- **"Yes"**: Go to Step 4 with `CLOSURE_STATUS=complete`
- **"Partial"**: Go to Step 4a
- **"No"**: Output `Archive aborted by user.` + STOP

### Step 4a: Document Gaps (Partial Only)

AskUserQuestion: "Document the gaps or unmet objectives:"

Capture response as `GAPS`.

### Step 4: Execute Archive

Task tool:
subagent_type: rp1-dev:prd-archiver
prompt: 
MODE: archive
PRD_NAME: {PRD_NAME}
CLOSURE_STATUS: {complete|partial}
GAPS: {user-provided gaps or empty}

### Step 5: Report

Display agent success output directly. Include:

- PRD name and archive location
- Features archived vs skipped
- KB staleness suggestion if applicable