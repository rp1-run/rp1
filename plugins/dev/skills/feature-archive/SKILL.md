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
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature ID to archive (kebab-case)"
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 project context"
    - name: RP1_WORK_DIR
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 work artifacts"
  sub_agents:
    - "rp1-dev:feature-archiver"
---

# Feature Archive

Archives completed feature docs from active -> archives dir.

## Usage

```
/rp1-dev:feature-archive <feature-id>
```

## Behavior

- Moves `{{$RP1_WORK_DIR}}/features/{FEATURE_ID}/` -> `{{$RP1_WORK_DIR}}/archives/features/{FEATURE_ID}/`
- Creates archives/features/ if missing
- Existing archive ID -> appends timestamp suffix
- Validates docs exist before archiving

## Execution

### Step 1: Invoke Agent

{% dispatch_agent "rp1-dev:feature-archiver" %}
MODE: archive
FEATURE_ID: {FEATURE_ID}
SKIP_DOC_CHECK: false
{% enddispatch_agent %}

### Step 2: Handle Response

If agent returns JSON w/ `type: "needs_confirmation"`:

```json
{"type":"needs_confirmation","reason":"minimal_docs","feature_id":"...","message":"..."}
```

{% ask_user "Feature '{FEATURE_ID}' has minimal documentation (no requirements.md or design.md). Archive anyway?", options: "Yes - Archive anyway", "No - Cancel" %}

- **Yes**: Re-invoke w/ `SKIP_DOC_CHECK: true`
- **No**: Output `Archive aborted by user` + STOP

### Step 3: Report

Display agent success output directly.
