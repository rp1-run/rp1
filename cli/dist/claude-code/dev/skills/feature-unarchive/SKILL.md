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
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: The feature identifier or timestamped archive name to restore
  environment:
    - name: RP1_ROOT
      source: rp1 agent-tools rp1-root-dir
      description: Root directory for rp1 project context and work artifacts
---

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --name rp1-dev:feature-unarchive --args "$ARGUMENTS"
```

Parse the JSON response. Extract values from `data.arguments` and `data.environment`:

| Variable | Source |
|----------|--------|
| FEATURE_ID | `data.arguments.FEATURE_ID` |
| RP1_ROOT | `data.environment.RP1_ROOT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

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