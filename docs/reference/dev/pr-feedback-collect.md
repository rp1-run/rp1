# pr-feedback-collect

Automatically gathers PR review comments from GitHub, classifies them, and generates structured feedback documents.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-feedback-collect
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-feedback-collect
    ```

## Description

The `pr-feedback-collect` command extracts review comments from a GitHub pull request, classifies them by priority and type, and generates a structured feedback document for systematic resolution.

## Output

**Location:** `.rp1/work/features/<feature-id>/pr_feedback.md`

**Contents:**

- Comment summary by priority
- Classified feedback items
- Actionable tasks extracted
- Resolution checklist

## Comment Classification

### By Priority

| Priority | Criteria |
|----------|----------|
| **P0 - Critical** | Blockers, security issues |
| **P1 - High** | Bugs, logic errors |
| **P2 - Medium** | Style, improvements |
| **P3 - Low** | Nitpicks, suggestions |

### By Type

| Type | Examples |
|------|----------|
| **Bug** | Logic error, edge case |
| **Security** | Vulnerability, exposure |
| **Style** | Naming, formatting |
| **Performance** | Optimization opportunity |
| **Question** | Clarification needed |

## Examples

### Collect Feedback

=== "Claude Code"

    ```bash
    /pr-feedback-collect
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-feedback-collect
    ```

**Example output:**
```
✅ PR Feedback Collected

PR: #123 - Add user authentication
Comments: 8

By Priority:
- P0 Critical: 0
- P1 High: 2
- P2 Medium: 4
- P3 Low: 2

Actionable Items: 6

Output: .rp1/work/features/user-auth/pr_feedback.md
```

## Requirements

- GitHub CLI (`gh`) must be installed and authenticated
- Must be run from a branch with an associated PR

## Related Commands

- [`pr-feedback-fix`](pr-feedback-fix.md) - Address collected feedback
- [`pr-review`](pr-review.md) - Generate review for others' PRs
