---
name: blueprint-audit
version: 1.0.0
description: Audits a PRD against implementation status and guides lifecycle decisions
argument-hint: "prd-name"
tags: [blueprint, prd, audit, lifecycle, housekeeping]
created: 2026-01-27
author: cloud-on-prem/rp1
---

# Blueprint Audit

Audits PRD documents against implementation evidence, identifies stale or completed blueprints, and guides disposition decisions (archive, modify scope, defer).

## Usage

```
/rp1-dev:blueprint-audit <prd-name>
```

**Params**: `prd-name` (req) - PRD filename without extension

## Behavior

- Extracts phases/milestones from PRD document
- Checks `{RP1_ROOT}/work/archives/features/` and `{RP1_ROOT}/work/features/` for evidence
- Searches codebase when archive/feature evidence insufficient
- Classifies each phase as Complete/Partial/Not Started
- Presents audit results with evidence summary
- Asks user about PRD relevance
- Offers disposition options: Archive, Modify scope, Defer

## Execution

### Step 1: Invoke Auditor

Task tool:

- `subagent_type`: `rp1-dev:blueprint-auditor`
- `prompt`:

```
PRD_NAME: $1
```

### Step 2: Handle Response

The agent handles all user interaction internally and returns final results.

**Success Response**:
```json
{"type":"success","prd_name":"...","disposition":"...","summary":"..."}
```

Display summary to user.

**Error Response**:
```json
{"type":"error","message":"...","available_prds":["prd1","prd2"]}
```

Output error message with available PRDs list, then STOP.

### Step 3: Report

Display agent output directly. Include:

- PRD audit summary with phase statuses
- Disposition taken (archived, scope modified, deferred)
- Next steps if applicable
