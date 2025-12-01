---
name: feature-archive
version: 1.0.0
description: Archives a completed feature to .rp1/work/archives/features/
argument-hint: "feature-id"
tags: [feature, archive, lifecycle]
created: 2025-11-29
author: cloud-on-prem/rp1
---

# Feature Archive - Archive Completed Features

Archives a completed feature's documentation from the active features directory to the archives directory.

## Usage

```
/rp1-dev:feature-archive <feature-id>
```

**Parameters**:
- `feature-id` (required): The feature identifier to archive

**Examples**:
```bash
# Archive a completed feature
/rp1-dev:feature-archive my-feature

# Archive after successful verification
/rp1-dev:feature-verify my-feature
# Then archive when prompted
```

## Behavior

- Moves `{RP1_ROOT}/work/features/<feature-id>/` to `{RP1_ROOT}/work/archives/features/<feature-id>/`
- Creates the archives/features/ directory if it doesn't exist
- If an archive with the same ID exists, appends a timestamp suffix
- Validates the feature has documentation before archiving

## Execution

Use the Task tool with:
- `subagent_type`: `rp1-dev:feature-archiver`
- `prompt`: Archive mode with feature ID from $1

```
Execute the feature-archiver agent to archive the specified feature.

MODE: archive
FEATURE_ID: $1
```
