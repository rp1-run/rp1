---
name: feature-edit
version: 1.0.0
description: Incorporates mid-stream changes into feature documentation with validation and propagation
argument-hint: "feature-id <edit-description>"
tags: [feature, documentation, workflow]
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Edit Command Router

Route to feature-editor agent after param validation.

## §IN

| Param | Source | Req |
|-------|--------|-----|
| FEATURE_ID | $1 | Yes |
| EDIT_DESCRIPTION | $ARGUMENTS | Yes |
| RP1_ROOT | {{RP1_ROOT}} | No (default `.rp1/`) |

## §ERR

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

## §PROC

### 1. Initial Invocation

Task tool config:
- `subagent_type`: `rp1-dev:feature-editor`
- `prompt`:
```
FEATURE_ID: $1
EDIT_DESCRIPTION: $ARGUMENTS
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
FEATURE_ID: $1
EDIT_DESCRIPTION: $ARGUMENTS
DECISIONS: {"classification": "...", "scope_action": "...", ...}
```

3. Repeat until success/error (not decision request)

**If success**: Display summary

**If error/abort**: Display message

### Loop Constraints

- Accumulate decisions across invocations
- Max 3 rounds: classification, scope, conflict
- Stop on "abort"/"split" scope_action
