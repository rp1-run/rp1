# feature-archive

Archives completed features to a dedicated archives directory.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:feature-archive <feature-id>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-archive <feature-id>
    ```

## Description

The `feature-archive` command moves completed feature documentation from the active features directory to the archives. This keeps your working directory clean while preserving feature history.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier to archive |

## Directory Structure

**Before:**
```
.rp1/work/features/user-auth/
├── requirements.md
├── design.md
├── tasks.md
└── field-notes.md
```

**After:**
```
.rp1/work/archives/features/user-auth/
├── requirements.md
├── design.md
├── tasks.md
└── field-notes.md
```

## Examples

### Archive a Feature

=== "Claude Code"

    ```bash
    /rp1-dev:feature-archive user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-archive user-auth
    ```

**Example output:**
```
✅ Feature Archived

Feature: user-auth
From: .rp1/work/features/user-auth/
To: .rp1/work/archives/features/user-auth/

Files archived: 6
```

## Related Commands

- [`feature-unarchive`](feature-unarchive.md) - Restore archived feature
- [`feature-verify`](feature-verify.md) - Verify before archiving
