---
name: blueprint-archive
description: "Archives a completed PRD to the archives directory with associated features and closure summary."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: planning
  is_workflow: false
  version: 1.0.0
  tags:
    - blueprint
    - prd
    - archive
    - lifecycle
  created: 2025-12-31
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: PRD_NAME
      type: string
      required: true
      description: "PRD filename without extension (kebab-case)"
---

# PRD Archive

Archives completed PRD docs from active -> archives dir with associated features.

## Usage

```
/rp1-dev:blueprint-archive <prd-name>
```

## Behavior

- Moves `.rp1/work/prds/<PRD_NAME>.md` -> `.rp1/work/archives/prds/<PRD_NAME>/prd.md`
- Archives associated completed features to `.rp1/work/archives/features/`
- Generates `closure_summary.md` with archive metadata
- Checks KB staleness and suggests `/knowledge-build` if needed
- Creates archive directories if missing

## Execution

### Step 1: Scan PRD

{% dispatch_agent "rp1-dev:prd-archiver" %}
MODE: scan
PRD_NAME: {PRD_NAME}
{% enddispatch_agent %}

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

{% ask_user "Archive PRD '{PRD_NAME}' ({prd_title})? {message}", options: "Yes - Objectives fully met", "Partial - Some objectives met", "No - Cancel" %}

Handle response:

- **"Yes"**: Go to Step 4 with `CLOSURE_STATUS=complete`
- **"Partial"**: Go to Step 4a
- **"No"**: Output `Archive aborted by user.` + STOP

### Step 4a: Document Gaps (Partial Only)

{% ask_user "Document the gaps or unmet objectives:" %}

Capture response as `GAPS`.

### Step 4: Execute Archive

{% dispatch_agent "rp1-dev:prd-archiver" %}
MODE: archive
PRD_NAME: {PRD_NAME}
CLOSURE_STATUS: {complete|partial}
GAPS: {user-provided gaps or empty}
{% enddispatch_agent %}

### Step 5: Report

Display agent success output directly. Include:

- PRD name and archive location
- Features archived vs skipped
- KB staleness suggestion if applicable
