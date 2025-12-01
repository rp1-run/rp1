# feature-unarchive

Restores archived features back to the active features directory.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:feature-unarchive <feature-id>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-unarchive <feature-id>
    ```

## Description

The `feature-unarchive` command moves feature documentation from the archives back to the active features directory. Use this when you need to continue work on a previously archived feature.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier to restore |

## Examples

### Restore a Feature

=== "Claude Code"

    ```bash
    /rp1-dev:feature-unarchive user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-unarchive user-auth
    ```

**Example output:**
```
✅ Feature Restored

Feature: user-auth
From: .rp1/work/archives/features/user-auth/
To: .rp1/work/features/user-auth/

Files restored: 6
```

## Related Commands

- [`feature-archive`](feature-archive.md) - Archive completed features
- [`feature-build`](feature-build.md) - Continue implementation
