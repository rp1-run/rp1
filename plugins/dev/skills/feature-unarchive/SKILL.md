---
name: feature-unarchive
description: "Restores an archived feature from the archives directory back to the active features directory."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - feature
    - archive
    - restore
    - lifecycle
  created: 2025-11-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id>"
  sub_agents:
    - "rp1-dev:feature-archiver"
---

# Feature Unarchive - Restore Archived Features

Restores an archived feature's documentation from the archives directory back to the active features directory.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FEATURE_ID` | Yes | - | The feature identifier or timestamped archive name to restore (e.g., `my-feature` or `my-feature_20251129_143022`) |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)

## Usage

```
/rp1-dev:feature-unarchive <feature-id>
```

**Examples**:
```bash
# Restore an archived feature
/rp1-dev:feature-unarchive my-feature

# Restore a timestamped archive
/rp1-dev:feature-unarchive my-feature_20251129_143022
```

## Behavior

- Moves `{{$RP1_ROOT}}/work/archives/features/{FEATURE_ID}/` to `{{$RP1_ROOT}}/work/features/{FEATURE_ID}/`
- Fails if a feature with the same ID already exists in the active directory
- Provides guidance on resolving conflicts

## Execution

{% dispatch_agent "rp1-dev:feature-archiver" %}
Execute the feature-archiver agent to restore the specified archived feature.

MODE: unarchive
FEATURE_ID: {FEATURE_ID}
{% enddispatch_agent %}
