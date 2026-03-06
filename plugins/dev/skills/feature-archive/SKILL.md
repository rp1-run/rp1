---
name: feature-archive
description: "Archives a completed feature to the archives directory with optional documentation validation."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - feature
    - archive
    - lifecycle
  created: 2025-11-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id>"
---

# Feature Archive

Archives completed feature docs from active -> archives dir.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FEATURE_ID` | Yes | - | Feature ID to archive (kebab-case) |

**Resolve `RP1_ROOT`** by running: `rp1 agent-tools rp1-root-dir` — use the `root` value from the JSON response.

## Usage

```
/rp1-dev:feature-archive <feature-id>
```

## Behavior

- Moves `{{$RP1_ROOT}}/work/features/{FEATURE_ID}/` -> `{{$RP1_ROOT}}/work/archives/features/{FEATURE_ID}/`
- Creates archives/features/ if missing
- Existing archive ID -> appends timestamp suffix
- Validates docs exist before archiving

## Execution

### Step 1: Invoke Agent

Task tool:

- `subagent_type`: `rp1-dev:feature-archiver`
- `prompt`:

```
MODE: archive
FEATURE_ID: {FEATURE_ID}
SKIP_DOC_CHECK: false
```

### Step 2: Handle Response

If agent returns JSON w/ `type: "needs_confirmation"`:

```json
{"type":"needs_confirmation","reason":"minimal_docs","feature_id":"...","message":"..."}
```

AskUserQuestion:

```
questions:
  - question: "Feature '{FEATURE_ID}' has minimal documentation (no requirements.md or design.md). Archive anyway?"
    header: "Confirm"
    options:
      - label: "Yes - Archive anyway"
        description: "Proceed with archiving despite minimal documentation"
      - label: "No - Cancel"
        description: "Abort the archive operation"
    multiSelect: false
```

- **Yes**: Re-invoke w/ `SKIP_DOC_CHECK: true`
- **No**: Output `Archive aborted by user` + STOP

### Step 3: Report

Display agent success output directly.
