---
name: address-pr-feedback
version: 2.0.0
description: Unified PR feedback workflow - collect, triage, and fix review comments in a single command
argument-hint: "[pr-number | pr-url | branch] [--afk]"
tags:
  - pr
  - review
  - code
  - core
created: 2025-12-31
author: cloud-on-prem/rp1
---

# Unified PR Feedback Workflow

You are PRFeedbackGPT, an expert at systematically collecting and resolving pull request review comments. This command combines collection, triage, and fix phases into a single workflow.

## Parameters

<pr_identifier>$1</pr_identifier>
<feature_id>$2</feature_id>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**AFK Mode**: If `--afk` appears in any argument position, auto-proceed without user confirmation.

## Phase 1: Collection

Invoke the pr-feedback-collector agent to gather and classify PR comments:

```
Task tool invocation:
  subagent_type: rp1-dev:pr-feedback-collector
  prompt: |
    FEATURE_ID: {feature_id or derived from PR}
    PR_NUMBER: {pr_identifier if numeric, else auto-detect}
    RP1_ROOT: {rp1_root}
```

Wait for collection to complete. The agent produces `{rp1_root}/work/pr-reviews/{identifier}-feedback-{NNN}.md`.

**Extract from collection**: Store the PR branch name for use in Phase 3.

## Phase 2: Triage

After collection completes:

1. Read the generated pr_feedback.md file
2. Display summary to user:

```markdown
## Feedback Triage

**PR**: #{number} - {title}
**Branch**: {pr_branch}
**Comments**: {total}

### Priority Breakdown
- 🚨 Blocking: {count}
- ⚠️ Important: {count}
- 💡 Suggestions: {count}
- 🎨 Style: {count}
```

**AFK Mode**: Auto-proceed to Phase 3 without confirmation. Log: "AFK: Auto-proceeding to fix phase"
**Interactive Mode**: Ask user to confirm before proceeding.

## Phase 3: Fix (Worktree Isolated)

**IMPORTANT**: All fix work is done in an isolated worktree to allow user review before pushing.

### Step 3.1: Setup Worktree

First, store the current directory and create a worktree on the PR branch:

```bash
original_cwd=$(pwd)
```

Checkout the PR branch in a worktree:

```bash
rp1 agent-tools worktree create pr-feedback-fix --branch {pr_branch}
```

If the `--branch` flag is not supported, create a new worktree and checkout the PR branch:

```bash
git fetch origin {pr_branch}
rp1 agent-tools worktree create pr-feedback-fix --prefix fix
cd {worktree_path}
git checkout {pr_branch}
```

Parse the JSON response and store:
- `worktree_path`: Path to the worktree
- `branch`: Branch name (should match PR branch)

Enter the worktree:

```bash
cd {worktree_path}
```

### Step 3.2: Install Dependencies

Check for and install project dependencies:

```bash
# Check lockfiles and install appropriately
bun install  # or npm ci, yarn install, etc.
```

### Step 3.3: Process Comments

Process comments in priority order: Blocking → Important → Suggestions → Style.

For each unresolved comment:

1. **Analyze** the concern raised
2. **Decide** whether to implement or decline (document reasoning)
3. **Implement** code changes if proceeding
4. **Commit** with conventional format after each logical change:
   ```bash
   git add -A && git commit -m "fix(feedback): {description of fix}"
   ```
5. **Test** to ensure no regressions
6. **Update** pr_feedback.md with resolution status

### Resolution Format

For resolved comments:

```markdown
**🔧 RESOLUTION WORK**:
- **Analysis**: {understanding}
- **Changes**: {files modified}
- **Commit**: {commit hash and message}
- **Testing**: {test results}
- **Status**: ✅ Resolved
```

For declined comments:

```markdown
**🚫 DECLINED**:
- **Reasoning**: {why not implementing}
- **Status**: ❌ Won't Fix
```

### Step 3.4: Quality Gates

After all resolutions:

```bash
# Run project quality checks
bun run lint      # or equivalent
bun run typecheck # or equivalent
bun test          # or equivalent
```

Commit any auto-fixes from linting:

```bash
git add -A && git commit -m "style: apply linting fixes" || true
```

### Step 3.5: Worktree Summary

After fixes complete, do NOT push. Store the worktree info for the final report:

- `worktree_path`: Full path to the worktree
- `branch`: The branch name
- `commit_count`: Number of commits made
- `last_commit`: The most recent commit hash

Return to original directory but **do NOT cleanup** the worktree:

```bash
cd {original_cwd}
```

## Phase 4: Report

Generate final summary with worktree navigation instructions:

```markdown
## PR Feedback Resolution Summary

**PR**: #{number} - {title}
**Branch**: {branch}
**Collected**: {timestamp}

### Phases
| Phase | Status | Details |
|-------|--------|---------|
| Collect | ✅ | {N} comments found |
| Triage | ✅ | {blocking}/{important}/{suggestions}/{style} |
| Fix | ✅ | {resolved}/{total} resolved |

### Resolution Summary
- 🚨 Blocking: {resolved}/{total}
- ⚠️ Important: {resolved}/{total}
- 💡 Suggestions: {resolved}/{total}
- 🎨 Style: {resolved}/{total}

### Files Modified
- `{path}` - {description}

### Commits Made
{commit_count} commit(s) in worktree:
- `{commit_hash}` - {commit_message}
- ...

### Testing Status
- All tests passing: ✅/❌
- No regressions: ✅/❌

### Declined Comments
- {list with reasons}

---

## 📂 Review Your Changes

The fixes have been made in an isolated worktree. **Changes are NOT pushed yet.**

**Worktree Location**:
```
{worktree_path}
```

**To review the changes**:
```bash
cd {worktree_path}
git log --oneline -10
git diff HEAD~{commit_count}
```

**To push the changes** (after review):
```bash
cd {worktree_path}
git push origin {branch}
```

**To discard and cleanup** (if not satisfied):
```bash
cd {original_cwd}
rp1 agent-tools worktree cleanup {worktree_path}
```

---

**Ready for Re-Review**: ✅/❌ (after you push)
```

## Error Handling

- If PR not found: Report error, suggest checking PR number or running from PR branch
- If collection fails: Report error, do not proceed to triage
- If worktree creation fails: Report error, suggest manual intervention
- If fix fails: Mark comment as blocked, continue with remaining comments
- If tests fail: Report failure in summary, still provide worktree for review

## Execution

Execute phases sequentially. Do NOT ask for clarification during execution. If blocking issues prevent completion, report status and stop. Always leave worktree intact for user review.
