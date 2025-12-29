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

The `feature-verify` command performs comprehensive validation of a completed feature implementation. It runs three parallel checks:

1. **Code Quality** - Linting, formatting, tests, and coverage
2. **Feature Verification** - Acceptance criteria and requirements coverage
3. **Comment Check** - Flags unnecessary comments added during implementation (advisory)

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `MILESTONE_ID` | `$2` | No | All | Specific milestone to verify |

## Prerequisites

- Completed implementation (tasks marked complete)
- All feature documentation in `.rp1/work/features/<feature-id>/`

## Output

**Reports Generated:**

| Report | Description |
|--------|-------------|
| `code_check_report_N.md` | Lint, format, test, coverage results |
| `feature_verify_report_N.md` | Acceptance criteria and requirements |
| `comment_check_report_N.md` | Unnecessary comments flagged |

**Contents:**

- Requirements coverage matrix
- Acceptance criteria status
- Test results summary
- Comment quality assessment (advisory)
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

Code Quality: PASS
- Linting: 0 errors
- Tests: 45/45 passing
- Coverage: 94%

Requirements Coverage:
- REQ-001: ✓ PASS
- REQ-002: ✓ PASS
- REQ-003: ✓ INTENTIONAL_DEVIATION (see field-notes.md)

Comment Check: WARN (advisory)
- 3 unnecessary comments flagged
- Run /code-clean-comments to clean

Acceptance Criteria: 12/12 passed

Reports:
- .rp1/work/features/user-auth/code_check_report_1.md
- .rp1/work/features/user-auth/feature_verify_report_1.md
- .rp1/work/features/user-auth/comment_check_report_1.md
```

## Related Commands

- [`feature-build`](feature-build.md) - Previous step
- [`code-clean-comments`](code-clean-comments.md) - Clean flagged comments
- [`feature-archive`](feature-archive.md) - Archive after merge

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow
