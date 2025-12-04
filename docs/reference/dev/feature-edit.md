# feature-edit

Incorporates mid-stream changes into feature documentation with validation and propagation.

---

## Synopsis

=== "Claude Code"

    ```bash
    /feature-edit <feature-id> <edit-description>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-edit <feature-id> <edit-description>
    ```

## Description

The `feature-edit` command handles changes to feature scope or requirements during implementation. It validates the edit, detects conflicts, and propagates approved changes across all feature documentation (requirements, design, tasks).

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `EDIT_DESCRIPTION` | `$2` | Yes | - | Description of the change |

## Validation

The command validates edits against:

- **Scope expansion** - Flags significant scope increases
- **Conflicting requirements** - Detects contradictions
- **Design impact** - Identifies affected components
- **Task status** - Considers completed work

## Examples

### Add a Requirement

=== "Claude Code"

    ```bash
    /feature-edit user-auth "Add remember-me checkbox option"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-edit user-auth "Add remember-me checkbox option"
    ```

**Example interaction:**
```
📝 Edit Analysis

Change: Add remember-me checkbox option

Impact Assessment:
- Requirements: +1 new requirement (REQ-008)
- Design: Affects session management component
- Tasks: +2 new tasks required

Scope Change: MINOR (15% expansion)

Proceed with edit? [Yes/No]
```

## Related Commands

- [`feature-requirements`](feature-requirements.md) - Original requirements
- [`feature-build`](feature-build.md) - Implementation phase
