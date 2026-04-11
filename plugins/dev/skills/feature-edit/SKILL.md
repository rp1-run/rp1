---
name: feature-edit
description: "Incorporates mid-stream changes into feature documentation with validation and propagation."
metadata:
  category: development
  is_workflow: false
  version: 1.0.0
  tags:
    - feature
    - documentation
    - workflow
  created: 2025-11-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier (kebab-case, e.g., auth-flow)"
    - name: EDIT_DESCRIPTION
      type: string
      required: true
      description: "Freeform edit description text"
  sub_agents:
    - "rp1-dev:feature-editor"
---

# Feature Edit Command Router

Route to feature-editor agent after param validation.

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

{% dispatch_agent "rp1-dev:feature-editor" %}
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {}
KB_ROOT: {kbRoot}
WORK_ROOT: {workRoot}

Analyze and process this edit.
{% enddispatch_agent %}

### 2. Decision Loop

Parse agent response:

**If `type: "needs_decision"`** (JSON w/ `decision_key`, `question`, `options`, `context`):

1. {% ask_user "{question from JSON}", options: "{options mapped from JSON}" %}

2. Re-invoke agent w/ accumulated decisions:

{% dispatch_agent "rp1-dev:feature-editor" %}
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {EDIT_DESCRIPTION}
DECISIONS: {"classification": "...", "scope_action": "...", ...}
KB_ROOT: {kbRoot}
WORK_ROOT: {workRoot}
{% enddispatch_agent %}

3. Repeat until success/error (not decision request)

**If success**: Display summary

**If error/abort**: Display message

### Loop Constraints

- Accumulate decisions across invocations
- Max 3 rounds: classification, scope, conflict
- Stop on "abort"/"split" scope_action
