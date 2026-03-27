---
name: feature-unarchive
description: Restores an archived feature from the archives directory back to the active features directory.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - feature
    - archive
    - restore
    - lifecycle
  created: 2025-11-29
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id>"
---

# Feature Unarchive - Restore Archived Features

Restores an archived feature's documentation from the archives directory back to the active features directory.

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

Task tool:
subagent_type: rp1-dev:feature-archiver
prompt:
Execute the feature-archiver agent to restore the specified archived feature.

MODE: unarchive
FEATURE_ID: {FEATURE_ID}