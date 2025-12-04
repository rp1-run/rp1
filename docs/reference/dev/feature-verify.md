# feature-verify

Validates acceptance criteria and requirements mapping before merge.

---

## Synopsis

=== "Claude Code"

    ```bash
    /feature-verify <feature-id> [milestone-id]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-verify <feature-id> [milestone-id]
    ```

## Description

The `feature-verify` command performs comprehensive validation of a completed feature implementation. It checks acceptance criteria, verifies requirements coverage, runs tests, and produces a verification report.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `MILESTONE_ID` | `$2` | No | All | Specific milestone to verify |

## Prerequisites

- Completed implementation (tasks marked complete)
- All feature documentation in `.rp1/work/features/<feature-id>/`

## Output

**Location:** `.rp1/work/features/<feature-id>/verification-report.md`

**Contents:**

- Requirements coverage matrix
- Acceptance criteria status
- Test results summary
- Field notes review (intentional deviations)
- Overall verdict

## Verification Status

| Status | Meaning |
|--------|---------|
| `PASS` | Criterion met |
| `FAIL` | Criterion not met |
| `SKIP` | Not applicable |
| `INTENTIONAL_DEVIATION` | Documented in field notes |

## Examples

### Verify Feature

=== "Claude Code"

    ```bash
    /feature-verify user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-verify user-auth
    ```

**Example output:**
```
✅ Feature Verification Complete

Feature: user-auth
Status: READY FOR MERGE

Requirements Coverage:
- REQ-001: ✓ PASS
- REQ-002: ✓ PASS
- REQ-003: ✓ INTENTIONAL_DEVIATION (see field-notes.md)

Acceptance Criteria: 12/12 passed
Tests: 45/45 passing
Coverage: 94%

Report: .rp1/work/features/user-auth/verification-report.md
```

## Related Commands

- [`feature-build`](feature-build.md) - Previous step
- [`feature-archive`](feature-archive.md) - Archive after merge

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow
