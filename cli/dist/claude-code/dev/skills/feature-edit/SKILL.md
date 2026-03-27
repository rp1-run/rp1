---
name: feature-edit
description: Incorporates mid-stream changes into feature documentation with validation and propagation.
metadata:
  version: 1.0.0
  tags:
    - feature
    - documentation
    - workflow
  created: 2025-11-29
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id> <edit-description>"
---

# Feature Edit Command Router

Route to feature-editor agent after param validation.

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --schema-path plugins/dev/skills/feature-edit/SKILL.md --args "{raw arguments from user invocation}"
```

Parse the JSON response. Extract values from `data.arguments` and `data.environment`:

| Variable | Source |
|----------|--------|
| FEATURE_ID | `data.arguments.FEATURE_ID` |
| EDIT_DESCRIPTION | `data.arguments.EDIT_DESCRIPTION` |
| RP1_ROOT | `data.environment.RP1_ROOT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

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

Task tool:
subagent_type: rp1-dev:feature-editor
prompt:
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {}

Analyze and process this edit.

### 2. Decision Loop

Parse agent response:

**If `type: "needs_decision"`** (JSON w/ `decision_key`, `question`, `options`, `context`):

1. AskUserQuestion: "{question from JSON}"
Options:
- {options mapped from JSON}

2. Re-invoke agent w/ accumulated decisions:

Task tool:
subagent_type: rp1-dev:feature-editor
prompt:
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {"classification": "...", "scope_action": "...", ...}

3. Repeat until success/error (not decision request)

**If success**: Display summary

**If error/abort**: Display message

### Loop Constraints

- Accumulate decisions across invocations
- Max 3 rounds: classification, scope, conflict
- Stop on "abort"/"split" scope_action