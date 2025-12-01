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

If both parameters are valid, delegate to the feature-editor agent:

Use the Task tool with:
- `subagent_type`: `rp1-dev:feature-editor`
- `prompt`: Pass through the feature-id and edit description for processing

The agent will:
1. Load KB and feature documentation
2. Analyze and classify the edit
3. Validate scope and detect conflicts
4. Propagate changes to requirements.md, design.md, and tasks.md
5. Return a summary of changes made
