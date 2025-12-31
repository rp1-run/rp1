# blueprint-archive

Archives a completed PRD to the archive directory with associated features.

---

## Synopsis

=== "Claude Code"

    ```bash
    /blueprint-archive <prd-name>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint-archive <prd-name>
    ```

## Description

The `blueprint-archive` command moves completed PRD documentation from the active PRDs directory to the archives. It also archives associated completed features, checks KB staleness, and generates a closure summary.

This command is the lifecycle counterpart to `/blueprint` - use it when a PRD's objectives have been met and you want to preserve the documentation while keeping your working directory clean.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PRD_NAME` | `$1` | Yes | - | PRD filename without extension |

## Confirmation Flow

The command uses a three-option confirmation flow:

1. **Yes - Objectives fully met**: Archives with "Complete" status
2. **Partial - Some objectives met**: Prompts for gap documentation, archives with "Partial" status
3. **No - Cancel**: Aborts the archive operation

When selecting "Partial", you'll be prompted to document what objectives weren't met or what gaps remain.

## Directory Structure

**Before:**
```
.rp1/work/
├── prds/
│   └── mobile-app.md
└── features/
    ├── auth-flow/
    └── push-notifications/
```

**After:**
```
.rp1/work/
├── prds/
│   (empty)
├── features/
│   └── push-notifications/     # In-progress features remain
└── archives/
    ├── prds/
    │   └── mobile-app/
    │       ├── prd.md
    │       └── closure_summary.md
    └── features/
        └── auth-flow/          # Completed features archived
```

## Examples

### Archive a Completed PRD

=== "Claude Code"

    ```bash
    /blueprint-archive mobile-app
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint-archive mobile-app
    ```

**Example output:**
```
## PRD Archived Successfully

**PRD**: mobile-app (Mobile App MVP)
**Status**: Complete
**Location**: .rp1/work/archives/prds/mobile-app/

**Features Archived**: 2
- auth-flow
- user-profile

**Features Skipped** (in progress): 1
- push-notifications

**KB Status**: Suggest running /knowledge-build to capture learnings
```

### Archive with Partial Completion

=== "Claude Code"

    ```bash
    /blueprint-archive api
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint-archive api
    ```

When prompted, select "Partial - Some objectives met" and document the gaps:

```
Document the gaps or unmet objectives:
> OAuth integration deferred to v2. Rate limiting not implemented due to time constraints.
```

### Handle Invalid PRD Name

=== "Claude Code"

    ```bash
    /blueprint-archive non-existent
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint-archive non-existent
    ```

**Example output:**
```
PRD 'non-existent' not found.

Available PRDs:
- mobile-app
- api
- web-dashboard
```

## Closure Summary

A `closure_summary.md` file is generated in the archive directory containing:

- Archive metadata (date, status, command)
- Associated features table with archive status
- Objectives summary extracted from PRD
- Gaps documentation (for partial closures)
- KB update status

## KB Staleness Check

After archiving, the command checks if PRD concepts appear in the knowledge base. If not found, it suggests running `/knowledge-build` to capture learnings from the completed work.

## Related Commands

- [`blueprint`](blueprint.md) - Create charter and PRDs (inverse operation)
- [`feature-archive`](feature-archive.md) - Archive individual features
- [`feature-unarchive`](feature-unarchive.md) - Restore archived features
