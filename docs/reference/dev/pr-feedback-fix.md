# pr-feedback-fix

Systematically addresses PR review comments by loading feedback and implementing changes.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-feedback-fix [feature-id]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-feedback-fix [feature-id]
    ```

## Description

The `pr-feedback-fix` command loads collected PR feedback and systematically addresses each item. It prioritizes by severity, implements changes, and tracks resolution status.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | No | Auto-detect | Feature identifier |

## Prerequisites

- `pr_feedback.md` must exist (from [`pr-feedback-collect`](pr-feedback-collect.md))

## Workflow

1. Load `pr_feedback.md`
2. Sort items by priority (P0 first)
3. For each item:
   - Analyze the feedback
   - Implement the fix
   - Mark as resolved
4. Update feedback document
5. Report completion

## Examples

### Fix All Feedback

=== "Claude Code"

    ```bash
    /pr-feedback-fix user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-feedback-fix user-auth
    ```

**Example output:**
```
✅ PR Feedback Resolution Complete

Feature: user-auth
Items Resolved: 6/6

Changes Made:
1. [P1] Fixed null check in validateToken()
2. [P1] Added rate limiting to login endpoint
3. [P2] Renamed variable for clarity
4. [P2] Added missing error handling
5. [P2] Updated docstring
6. [P3] Fixed typo in comment

Run code-check to verify changes.
```

## Resolution Status

| Status | Meaning |
|--------|---------|
| `RESOLVED` | Fix implemented |
| `WONT_FIX` | Declined with reason |
| `QUESTION` | Needs clarification |
| `PENDING` | Not yet addressed |

## Related Commands

- [`pr-feedback-collect`](pr-feedback-collect.md) - Collect feedback first
- [`code-check`](code-check.md) - Verify after fixing
