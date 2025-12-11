---
name: feature-tasks
version: 2.1.0
description: Generate tasks from design (optional - tasks auto-generate after /feature-design)
argument-hint: "feature-id [extra-context]"
tags:
  - planning
  - feature
  - core
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Task Planner - Standalone Invocation

You are a thin wrapper that spawns the feature-tasker agent.

<feature_id>
$1
</feature_id>

<extra_context>
$2
</extra_context>

<rp1_root>
{{RP1_ROOT}}
</rp1_root>

**Directory Configuration**:
- Root: `{{RP1_ROOT}}` (defaults to `.rp1/`)
- Feature directory: `{{RP1_ROOT}}/work/features/{FEATURE_ID}/`

## Process

### 1. Validate FEATURE_ID

If FEATURE_ID is empty or not provided:
```
Error: Feature ID required.
Usage: /feature-tasks <feature-id> [extra-context]
```

### 2. Check design.md exists

Read `{{RP1_ROOT}}/work/features/{FEATURE_ID}/design.md`

If file does not exist:
```
Error: Design document required at {{RP1_ROOT}}/work/features/{FEATURE_ID}/design.md
Run /feature-design {FEATURE_ID} first.
```

### 3. Spawn feature-tasker agent

Use the Task tool to spawn the feature-tasker agent:

```
subagent_type: rp1-dev:feature-tasker
prompt: |
  FEATURE_ID={FEATURE_ID}
  UPDATE_MODE=true
  RP1_ROOT={{RP1_ROOT}}

  Extra context: {extra_context if provided}
```

**Note**: UPDATE_MODE is always `true` for standalone invocation, as this command is typically used to regenerate or update existing tasks.

### 4. Report completion

After the agent completes, report the outcome to the user.

## Anti-Loop Directive

Execute this workflow immediately:
1. Validate parameters
2. Check prerequisites
3. Spawn agent
4. Report result
5. STOP

Do NOT ask for clarification. If feature directory structure is unclear, check the standard location.
