---
name: build-artifact-detector
description: Determines workflow start_step by checking existing feature artifacts using bootstrap-provided run context
tools: Read, Bash(rp1 *)
model: inherit
arguments:
  - name: FEATURE_ID
    type: string
    required: true
    description: "Feature identifier"
  - name: WORKFLOW_TYPE
    type: string
    required: false
    default: "build"
    description: "Workflow type for resume matching (e.g., build, build-fast, blueprint, pr-review)"
  - name: RUN_ID
    type: string
    required: true
    description: "Run ID returned by workflow-bootstrap"
  - name: RUN_RESUMED
    type: boolean
    required: true
    description: "Whether workflow-bootstrap resumed an existing run"
  - name: WORK_ROOT
    type: string
    required: true
    description: "Canonical work root returned by workflow-bootstrap"
---

# Build Artifact Detector

Determines which build step to start from by checking artifact existence and validity. The parent tracked workflow already resolved run reuse through workflow bootstrap, so this agent only consumes the provided canonical run context.

**CRITICAL**: Output ONLY JSON. No explanations, no progress updates.

<feature_id>$1</feature_id>
<workflow_type>$2</workflow_type>
<run_id>$3</run_id>
<run_resumed>$4</run_resumed>
<work_root>$5</work_root>

## 1. Detection Algorithm

Check artifacts in order. First failing check determines `start_step`.

### Step 1: Requirements

Read `{WORK_ROOT}/features/{FEATURE_ID}/requirements.md`

- **Valid if**: Contains `## 5. Functional Requirements`
- **Missing/invalid**: `start_step = 1`, STOP

### Step 2: Design

Read `{WORK_ROOT}/features/{FEATURE_ID}/design.md`

- **Valid if**: Contains `## 2. Architecture`
- **Missing/invalid**: `start_step = 2`, STOP

### Step 3: Tasks

Read `{WORK_ROOT}/features/{FEATURE_ID}/tasks.md`

- **Valid if**: Contains task entries (`- [ ]` or `- [x]`)
- **Missing/no entries**: `start_step = 3`, STOP

### Step 4: Tasks Pending

Check tasks.md for pending tasks.

- **Pending if**: Contains `- [ ]` (unchecked tasks)
- **Has pending**: `start_step = 4`, STOP

### Step 5: Verification

Glob `{WORK_ROOT}/features/{FEATURE_ID}/feature_verify_report*.md`, read most recent.

- **Verified if**: Contains BOTH `Overall Status: VERIFIED` AND `Ready for Merge: YES`
- **Not verified**: `start_step = 5`, STOP

### Step 6: Archive

All checks passed: `start_step = 6`

## 2. Run Context

Use the bootstrap-provided run context directly:

- `run_id = {RUN_ID}`
- `resumed = {RUN_RESUMED}`

Do NOT extract `rp1_run_id` frontmatter and do NOT call `rp1 agent-tools emit resume-run`.

### 2.1 Artifact Reconciliation (Best-Effort)

When `resumed` is `true`, scan the feature directory `{WORK_ROOT}/features/{FEATURE_ID}/` for `.md` files that may not be registered under the resumed run. Report these as `unregistered_artifacts` using work-root-relative paths so the calling skill can register them directly.

This is best-effort. If scanning fails, omit the `unregistered_artifacts` field and continue.

## 3. Output Contract

Return ONLY this JSON:

```json
{
  "status": "success",
  "start_step": 1,
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "resumed": true,
  "artifacts": {
    "requirements": {"found": true, "valid": true, "reason": "Has ## 5"},
    "design": {"found": false, "valid": false, "reason": "File not found"},
    "tasks": {"found": false, "has_entries": false, "pending": 0},
    "verify_report": {"found": false, "verified": false, "reason": "No report"}
  },
  "unregistered_artifacts": ["features/{FEATURE_ID}/field-notes.md"]
}
```

**Fields**:
- `start_step`: 1-6, first failing check
- `run_id`: The bootstrap-provided UUID the parent workflow must keep using
- `resumed`: The bootstrap-provided resumable-state flag
- `artifacts`: Per-artifact status with reasons
- `unregistered_artifacts`: (optional) List of work-root-relative `.md` paths found on disk but potentially not registered under the resumed run. Only present when `resumed` is `true`.

{% include_shared "anti-loop.md" %}

{% include_shared "output-discipline.md" %}
