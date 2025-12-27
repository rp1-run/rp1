---
name: feature-edit
version: 1.0.0
description: Incorporates mid-stream changes into feature documentation with validation and propagation
argument-hint: "feature-id <edit-description>"
tags:
  - feature
  - documentation
  - workflow
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Edit - Mid-Stream Documentation Changes

You are a command router for the feature-edit workflow. Your only job is to validate parameters and delegate to the feature-editor agent.

## Input Parameters

<feature_id>
$1
</feature_id>

<edit_description>
$ARGUMENTS
</edit_description>

<rp1_root>
{{RP1_ROOT}}
</rp1_root>
(defaults to `.rp1/` if not set via environment variable $RP1_ROOT)

## Parameter Validation

**Required**: Both `FEATURE_ID` and `EDIT_DESCRIPTION` must be provided.

If `FEATURE_ID` is empty or missing:
```
❌ Error: Missing feature-id parameter

Usage: /rp1-dev:feature-edit feature-id "edit description"

Example: /rp1-dev:feature-edit auth-flow "Discovery: OAuth library doesn't support refresh tokens"
```

If `EDIT_DESCRIPTION` is empty or missing:
```
❌ Error: Missing edit description

Usage: /rp1-dev:feature-edit feature-id "edit description"

Supported edit types:
- Requirement changes: "Add rate limiting to login endpoint"
- Discoveries: "Discovery: API doesn't support pagination"
- Concerns: "Concern: Error handling for failed requests not specified"
- Assumption changes: "Assumption change: Users will authenticate via SSO, not password"
- Pivots: "Pivot: Focus on mobile-first instead of desktop"
```

## Delegation

If both parameters are valid, delegate to the feature-editor agent using a decision loop.

### Step 1: Initial Invocation

Use the Task tool with:
- `subagent_type`: `rp1-dev:feature-editor`
- `prompt`:

```
FEATURE_ID: $1
EDIT_DESCRIPTION: $ARGUMENTS
DECISIONS: {}

Analyze and process this edit.
```

### Step 2: Handle Agent Response

Parse the agent's output.

**If agent returns JSON with `type: "needs_decision"`**:

```json
{
  "type": "needs_decision",
  "decision_key": "classification|scope_action|conflict_action",
  "question": "...",
  "options": [...],
  "context": {...}
}
```

Use AskUserQuestion to get user decision:

```
questions:
  - question: "{question from JSON}"
    header: "{decision_key}"
    options: [map options from JSON to AskUserQuestion format]
    multiSelect: false
```

Then re-invoke the agent with the accumulated decisions:

```
FEATURE_ID: $1
EDIT_DESCRIPTION: $ARGUMENTS
DECISIONS: {"classification": "...", "scope_action": "...", ...}
```

Continue this loop until the agent returns a success/error result (not a decision request).

**If agent returns success output** (edit applied):

Display the summary to the user.

**If agent returns error or abort**:

Display the error/cancellation message to the user.

### Decision Loop Notes

- Accumulate decisions across invocations (agent may need multiple decisions)
- Maximum 3 decision rounds (classification, scope, conflict) before completing
- If user selects "abort" or "split" for scope_action, stop the loop and display appropriate message
