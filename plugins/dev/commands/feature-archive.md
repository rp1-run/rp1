---
name: feature-archive
version: 1.0.0
description: Archives a completed feature to {RP1_ROOT}/work/archives/features/
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

### Step 1: Invoke Archiver Agent

Use the Task tool with:
- `subagent_type`: `rp1-dev:feature-archiver`
- `prompt`: Archive mode with feature ID from $1

```
Execute the feature-archiver agent to archive the specified feature.

MODE: archive
FEATURE_ID: $1
SKIP_DOC_CHECK: false
```

### Step 2: Handle Agent Response

Parse the agent's output. If it returns JSON with `type: "needs_confirmation"`:

```json
{
  "type": "needs_confirmation",
  "reason": "minimal_docs",
  "feature_id": "...",
  "message": "..."
}
```

Use AskUserQuestion to confirm:

```
questions:
  - question: "Feature '{feature_id}' has minimal documentation (no requirements.md or design.md). Archive anyway?"
    header: "Confirm"
    options:
      - label: "Yes - Archive anyway"
        description: "Proceed with archiving despite minimal documentation"
      - label: "No - Cancel"
        description: "Abort the archive operation"
    multiSelect: false
```

**If user selects "Yes"**: Re-invoke archiver with `SKIP_DOC_CHECK: true`

```
MODE: archive
FEATURE_ID: $1
SKIP_DOC_CHECK: true
```

**If user selects "No"**: Output cancellation message and stop:

```
⚠️ **Cancelled**: Archive aborted by user
```

### Step 3: Report Result

If archiver returns success output (not JSON), display it directly to the user.
