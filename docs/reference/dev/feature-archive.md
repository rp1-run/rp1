# feature-archive

Archives completed features to a dedicated archives directory.

---

## Synopsis

=== "Claude Code"

    ```bash
    /feature-archive <feature-id>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-archive <feature-id>
    ```

## Description

The `feature-archive` command moves completed feature documentation from the active features directory to the archives. This keeps your working directory clean while preserving feature history.

Beyond simple file movement, the command also **extracts valuable discoveries** from field notes and transfers them back to the associated PRD for future reference.

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

## Discovery Extraction

When archiving, the command checks for `field-notes.md` and extracts valuable learnings back to the associated PRD:

**What gets extracted:**

| Discovery Type | Description |
|----------------|-------------|
| Design Deviation | Changes made from original design during implementation |
| Codebase Discovery | Patterns, conventions, or behaviors found in existing code |
| Workaround | Solutions for limitations or blockers encountered |

**What gets excluded:**

- Task-specific notes (e.g., "Task 3: completed")
- User clarifications (context that only applies to this feature)
- Feature-specific implementation details

**How it works:**

1. Finds the associated PRD from `requirements.md` or searches `$RP1_ROOT/work/prds/`
2. Compacts discoveries to one-liners with reference links
3. Appends to a `## Discoveries` section in the PRD (creates if missing)

This preserves institutional knowledge so future features benefit from past learnings.

## Examples

### Archive a Feature

=== "Claude Code"

    ```bash
    /feature-archive user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-archive user-auth
    ```

**Example output:**
```
✅ Feature Archived Successfully

Feature: user-auth
From: .rp1/work/features/user-auth/
To: .rp1/work/archives/features/user-auth/

Discoveries: 2 discoveries transferred to PRD
  - Design Deviation: Used JWT instead of session cookies for stateless auth
  - Codebase Discovery: Existing middleware supports token refresh pattern

Next Steps:
- Capture learnings into KB: /knowledge-build user-auth
- To restore later: /feature-unarchive user-auth
```

## Related Commands

- [`feature-unarchive`](feature-unarchive.md) - Restore archived feature
- [`/build`](build.md) - Full workflow includes verification before archive
- [`knowledge-build`](../base/knowledge-build.md) - Capture feature learnings into the knowledge base
