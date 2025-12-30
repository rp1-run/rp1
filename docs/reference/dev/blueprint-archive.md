# blueprint-archive

Archives completed PRDs (Product Requirements Documents) to a dedicated archives directory with closure summary.

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

The `blueprint-archive` command moves completed PRD documentation from the active PRDs directory to the archives. It creates a closure summary documenting completion status and archives associated features that are complete.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PRD_NAME` | `$1` | Yes | - | PRD name to archive (without .md extension) |

## Directory Structure

**Before:**
```
.rp1/work/prds/mobile-app.md
.rp1/work/features/mobile-auth/
.rp1/work/features/mobile-dashboard/
```

**After:**
```
.rp1/work/archives/prds/mobile-app/
├── prd.md
└── closure_summary.md

.rp1/work/archives/features/mobile-auth/
.rp1/work/features/mobile-dashboard/  (kept if incomplete)
```

## Workflow

1. **Status Confirmation**: Prompts whether objectives were met (Yes/Partial/No)
2. **Feature Discovery**: Finds features that reference this PRD
3. **Feature Archival**: Archives completed features, keeps in-progress ones active
4. **Closure Summary**: Creates summary documenting status and archived items
5. **KB Check**: Suggests `/knowledge-build` if learnings not captured

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

**Example interaction:**
```
Were the PRD objectives met?
> Yes - Objectives achieved

PRD Archived Successfully

PRD: mobile-app
Status: yes
Location: .rp1/work/archives/prds/mobile-app/

Features:
- Archived: 2 (mobile-auth, mobile-settings)
- Active: 1 (mobile-dashboard)

Knowledge Base: Missing - run `/knowledge-build` to capture learnings
```

## Related Commands

- [`blueprint`](blueprint.md) - Create PRDs
- [`feature-archive`](feature-archive.md) - Archive individual features
- [`knowledge-build`](../base/knowledge-build.md) - Capture learnings into KB
