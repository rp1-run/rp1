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
- Checks archives and features directories for evidence
- Searches codebase when archive/feature evidence insufficient
- Classifies each phase as Complete/Partial/Not Started
- Presents audit results with evidence summary
- Guides user through disposition decision

## Execution

### Step 1: Run Audit

Task tool:
- `subagent_type`: `rp1-dev:blueprint-auditor`
- `prompt`:
```
MODE: audit
PRD_NAME: $1
```

### Step 2: Handle Audit Response

**Error Response**:
```json
{"type":"error","message":"...","available_prds":["..."]}
```
Output error message with available PRDs, then STOP.

**Needs User Input** (audit complete):
```json
{"type":"needs_user_input","question":"relevance","phases":[...],"summary":{...}}
```

Display the audit table from agent output, then continue to Step 3.

### Step 3: Ask Relevance Question

Use AskUserQuestion:
```
Question: "Is this PRD still relevant to your work?"
Options:
- "Archive" - PRD is complete or no longer needed
- "Add scope" - Add new work items to PRD
- "Remove scope" - Remove incomplete phases from PRD
- "Continue" - Keep PRD active, no changes
- "Defer" - Revisit this decision later
```

### Step 4: Handle User Choice

**"Archive"**:
1. Invoke agent with MODE=action, USER_CHOICE=archive
2. Agent returns `needs_user_input` with question="closure_status"
3. Ask user:
   ```
   Question: "What is the closure status?"
   Options:
   - "Complete" - All planned work finished
   - "Partial" - Some work deferred or abandoned
   ```
4. If "Partial", ask for gap documentation (freeform text)
5. Invoke agent with MODE=action, USER_CHOICE=archive_confirm, SCOPE_INPUT={status}|{gaps}

**"Add scope"**:
1. Ask user for new scope description (freeform text)
2. Invoke agent with MODE=action, USER_CHOICE=add_scope, SCOPE_INPUT={description}

**"Remove scope"**:
1. Present list of Not Started/Partial phases from audit
2. Ask user which phase IDs to remove (multi-select or comma-separated)
3. Invoke agent with MODE=action, USER_CHOICE=remove_scope, SCOPE_INPUT={phase_ids}

**"Continue"**:
- Invoke agent with MODE=action, USER_CHOICE=continue

**"Defer"**:
- Invoke agent with MODE=action, USER_CHOICE=defer

### Step 5: Report

Display agent's final output. Include:
- Disposition taken
- Next steps if applicable
