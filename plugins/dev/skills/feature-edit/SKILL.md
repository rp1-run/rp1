---
name: feature-edit
description: "Incorporates mid-stream changes into feature documentation with validation and propagation."
metadata:
  version: 1.0.0
  tags:
    - feature
    - documentation
    - workflow
  created: 2025-11-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id> <edit-description>"
---

# Feature Edit Command Router

Route to feature-editor agent after param validation.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FEATURE_ID` | Yes | - | Feature identifier (kebab-case, e.g., `auth-flow`) |
| `EDIT_DESCRIPTION` | Yes | - | Freeform edit description text |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)

## Error Handling

**Missing FEATURE_ID**:
```
Error: Missing feature-id parameter

Usage: /rp1-dev:feature-edit feature-id "edit description"
Example: /rp1-dev:feature-edit auth-flow "Discovery: OAuth library doesn't support refresh tokens"
```

**Missing EDIT_DESCRIPTION**:
```
Error: Missing edit description

Usage: /rp1-dev:feature-edit feature-id "edit description"

Edit types:
- Requirement changes: "Add rate limiting to login endpoint"
- Discoveries: "Discovery: API doesn't support pagination"
- Concerns: "Concern: Error handling for failed requests not specified"
- Assumption changes: "Assumption change: Users will authenticate via SSO, not password"
- Pivots: "Pivot: Focus on mobile-first instead of desktop"
```

## Execution

### 1. Initial Invocation

Task tool config:
- `subagent_type`: `rp1-dev:feature-editor`
- `prompt`:
```
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {}

Analyze and process this edit.
```

### 2. Decision Loop

Parse agent response:

**If `type: "needs_decision"`** (JSON w/ `decision_key`, `question`, `options`, `context`):

1. AskUserQuestion:
   - `question`: from JSON
   - `header`: decision_key
   - `options`: mapped from JSON
   - `multiSelect`: false

2. Re-invoke agent w/ accumulated decisions:
```
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {"classification": "...", "scope_action": "...", ...}
```

3. Repeat until success/error (not decision request)

**If success**: Display summary

**If error/abort**: Display message

### Loop Constraints

- Accumulate decisions across invocations
- Max 3 rounds: classification, scope, conflict
- Stop on "abort"/"split" scope_action
