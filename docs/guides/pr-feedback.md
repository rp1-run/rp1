# Addressing PR Feedback

Systematically collect and resolve reviewer comments using rp1's unified feedback workflow. This guide covers the complete process from gathering GitHub review comments to implementing fixes.

**Time to complete**: ~15-20 minutes

---

## What You'll Learn

- Collecting and classifying PR review comments
- Triaging feedback by priority
- Implementing fixes systematically
- Verifying all feedback is addressed

## Prerequisites

!!! warning "Before You Begin"
    - rp1 installed ([Installation](../getting-started/installation.md))
    - [`gh` CLI](https://cli.github.com/) installed and authenticated
    - A PR with review comments on GitHub

---

## The Feedback Workflow

The unified `/address-pr-feedback` command handles the complete feedback workflow in a single invocation:

```mermaid
flowchart TB
    PR[PR Reviewed] --> CMD[/address-pr-feedback]
    CMD --> C[Phase 1: Collect]
    C --> T[Phase 2: Triage]
    T --> F[Phase 3: Fix]
    F --> R[Phase 4: Report]
    R --> P[Push & Re-request Review]
```

| Phase | Purpose |
|-------|---------|
| Collect | Gather and classify review comments from GitHub |
| Triage | Display priority breakdown for review |
| Fix | Address comments systematically in priority order |
| Report | Generate resolution summary |

---

## Using the Unified Command

After your PR has been reviewed on GitHub, run the unified command:

=== "Claude Code"

    ```bash
    /address-pr-feedback
    ```

    Or with a specific PR:

    ```bash
    /address-pr-feedback 42
    ```

    For autonomous mode (no prompts):

    ```bash
    /address-pr-feedback 42 --afk
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/address-pr-feedback
    ```

    Or with a specific PR:

    ```bash
    /rp1-dev/address-pr-feedback 42
    ```

---

## Phase 1: Collection

The command first collects feedback from GitHub:

```
📥 Collecting PR Feedback

PR: #42 - Add user authentication
Reviewers: @alice, @bob

Fetching comments...
✓ 6 review comments found
✓ 2 general comments found

Classifying feedback...
✓ Blocking: 1
✓ Important: 2
✓ Suggestions: 3
✓ Style: 2

Output: .rp1/work/pr-reviews/pr-42-feedback-001.md
```

---

## Phase 2: Triage

After collection, you'll see a priority breakdown:

```
## Feedback Triage

**PR**: #42 - Add user authentication
**Comments**: 8

### Priority Breakdown
- 🚨 Blocking: 1
- ⚠️ Important: 2
- 💡 Suggestions: 3
- 🎨 Style: 2
```

In interactive mode, you can review before proceeding. In `--afk` mode, it auto-proceeds.

---

## Phase 3: Fix

The command addresses comments in priority order (blocking → important → suggestions → style):

```
🔧 Addressing PR Feedback

Fixing Blocking Issues...
[1/1] Moving JWT secret to environment variable
  ✓ Updated src/middleware/auth.ts
  ✓ Added JWT_SECRET to .env.example
  ✓ Updated documentation

Fixing Important Issues...
[1/2] Adding token expiration validation
  ✓ Updated validateToken() in auth.ts
  ✓ Added test cases

[2/2] Adding invalid token test scenarios
  ✓ Added 4 test cases to auth.test.ts
  ✓ All tests passing

Fixing Suggestions...
...
```

---

## Phase 4: Report

Finally, you receive a consolidated summary:

```markdown
## PR Feedback Resolution Summary

**PR**: #42 - Add user authentication
**Collected**: 2025-01-15T10:30:00Z

### Phases
| Phase | Status | Details |
|-------|--------|---------|
| Collect | ✅ | 8 comments found |
| Triage | ✅ | 1/2/3/2 priority split |
| Fix | ✅ | 8/8 resolved |

### Resolution Summary
- 🚨 Blocking: 1/1
- ⚠️ Important: 2/2
- 💡 Suggestions: 3/3
- 🎨 Style: 2/2

**Ready for Re-Review**: ✅
```

!!! tip "After Fixing"
    Run `/pr-review` again to verify all issues are resolved before requesting re-review.

---

## Summary

| Command | Purpose |
|---------|---------|
| `/address-pr-feedback` | Complete feedback workflow (collect, triage, fix, report) |
| `/address-pr-feedback 42` | Target specific PR number |
| `/address-pr-feedback --afk` | Run autonomously without prompts |

---

## Next Steps

- **Verify changes**: Run [PR Review](pr-review.md) to confirm fixes
- **Reference docs**: See [address-pr-feedback](../reference/dev/address-pr-feedback.md)

---

## Troubleshooting

??? question "Command can't find comments"

    Ensure:

    1. You're in a git repository with a remote
    2. The `gh` CLI is authenticated (`gh auth status`)
    3. The PR exists and has comments

??? question "Some feedback items weren't fixed"

    The command prioritizes by severity. If items remain:

    1. Check the feedback document for unchecked items
    2. Run `/address-pr-feedback` again for remaining items
    3. For complex issues, fix manually and mark complete in the document

??? question "Want to skip the triage prompt?"

    Use `--afk` mode to run autonomously:
    ```bash
    /address-pr-feedback 42 --afk
    ```
