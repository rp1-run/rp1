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

## Phase 3: Fix (Worktree Isolated)

The command creates an isolated worktree to make changes, allowing you to review before pushing.

```
🔧 Setting Up Worktree

Creating isolated workspace...
✓ Worktree: .rp1/work/worktrees/fix-pr-feedback-fix-abc123
✓ Branch: feature/user-auth (same as PR)
✓ Dependencies installed

🔧 Addressing PR Feedback

Fixing Blocking Issues...
[1/1] Moving JWT secret to environment variable
  ✓ Updated src/middleware/auth.ts
  ✓ Added JWT_SECRET to .env.example
  ✓ Committed: fix(feedback): move JWT secret to env var

Fixing Important Issues...
[1/2] Adding token expiration validation
  ✓ Updated validateToken() in auth.ts
  ✓ Committed: fix(feedback): add token expiration check

[2/2] Adding invalid token test scenarios
  ✓ Added 4 test cases to auth.test.ts
  ✓ Committed: test(auth): add invalid token scenarios

Fixing Suggestions...
...

✓ All changes committed to worktree (not pushed)
```

---

## Phase 4: Report

Finally, you receive a consolidated summary with instructions for reviewing your changes:

```markdown
## PR Feedback Resolution Summary

**PR**: #42 - Add user authentication
**Branch**: feature/user-auth
**Collected**: 2025-01-15T10:30:00Z

### Resolution Summary
- 🚨 Blocking: 1/1
- ⚠️ Important: 2/2
- 💡 Suggestions: 3/3
- 🎨 Style: 2/2

### Commits Made
5 commit(s) in worktree:
- `abc1234` - fix(feedback): move JWT secret to env var
- `def5678` - fix(feedback): add token expiration check
- ...

---

## 📂 Review Your Changes

The fixes have been made in an isolated worktree. **Changes are NOT pushed yet.**

**Worktree Location**:
/path/to/.rp1/work/worktrees/fix-pr-feedback-fix-abc123

**To review the changes**:
cd /path/to/worktree && git log --oneline -10

**To push the changes** (after review):
cd /path/to/worktree && git push origin feature/user-auth

**To discard and cleanup** (if not satisfied):
rp1 agent-tools worktree cleanup /path/to/worktree
```

!!! tip "Review Before Pushing"
    Navigate to the worktree to review all changes before pushing. You can run `/pr-review` on the worktree branch to verify fixes.

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
