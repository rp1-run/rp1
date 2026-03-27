---
name: feature-archive
description: Archives a completed feature to the archives directory with optional documentation validation.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - feature
    - archive
    - lifecycle
  created: 2025-11-29
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id>"
---

# Feature Archive

Archives completed feature docs from active -> archives dir.

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
subagent_type: rp1-dev:feature-archiver
prompt:
MODE: archive
FEATURE_ID: {FEATURE_ID}
SKIP_DOC_CHECK: false

### Step 2: Handle Response

If agent returns JSON w/ `type: "needs_confirmation"`:

```json
{"type":"needs_confirmation","reason":"minimal_docs","feature_id":"...","message":"..."}
```

AskUserQuestion: "Feature '{FEATURE_ID}' has minimal documentation (no requirements.md or design.md). Archive anyway?"
Options:
- Yes - Archive anyway
- No - Cancel

- **Yes**: Re-invoke w/ `SKIP_DOC_CHECK: true`
- **No**: Output `Archive aborted by user` + STOP

### Step 3: Report

Display agent success output directly.