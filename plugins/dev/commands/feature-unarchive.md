---
name: feature-unarchive
version: 1.0.0
description: Restores an archived feature to .rp1/work/features/
argument-hint: "feature-id"
tags: [feature, archive, restore, lifecycle]
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Unarchive - Restore Archived Features

Restores an archived feature's documentation from the archives directory back to the active features directory.

## Usage

```
/rp1-dev:feature-unarchive <feature-id>
```

**Parameters**:
- `feature-id` (required): The feature identifier or timestamped archive name to restore

**Examples**:
```bash
# Restore an archived feature
/rp1-dev:feature-unarchive my-feature

# Restore a timestamped archive
/rp1-dev:feature-unarchive my-feature_20251129_143022
```

## Behavior

- Moves `{RP1_ROOT}/work/archives/features/<feature-id>/` to `{RP1_ROOT}/work/features/<feature-id>/`
- Fails if a feature with the same ID already exists in the active directory
- Provides guidance on resolving conflicts

## Execution

Use the Task tool with:
- `subagent_type`: `rp1-dev:feature-archiver`
- `prompt`: Unarchive mode with feature ID from $1

```
Execute the feature-archiver agent to restore the specified archived feature.

MODE: unarchive
FEATURE_ID: $1
```
