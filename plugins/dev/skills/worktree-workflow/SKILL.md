---
name: worktree-workflow
description: Isolated git worktree workflow for coding agents. Handles worktree creation, atomic commits, branch publishing, optional PR creation, and cleanup. Use when implementing code changes that need branch isolation. Trigger terms - worktree, isolated workspace, branch isolation, atomic commits, code changes in isolation, parallel agent work.
---

# Worktree Workflow

This skill provides a complete workflow for performing coding work in isolated git worktrees. It enables agents to make changes without affecting the main working directory, commit atomically with conventional format, and optionally create pull requests.

## What This Skill Does

- Creates isolated worktree for code changes via `rp1 agent-tools worktree create`
- Manages atomic commits with conventional commit format (feat:, fix:, refactor:, etc.)
- Validates commit ownership before publishing (prevents corrupted PRs with orphan commits)
- Creates PRs with `--head` flag (no branch checkout required)
- Cleans up worktree after completion, preserving the pushed branch

## Parameters

The invoking agent provides these parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_slug` | string | Yes | - | 2-4 word slug for branch naming (e.g., `fix-auth-bug`) |
| `agent_prefix` | string | No | `quick-build` | Branch prefix (e.g., `feature`, `fix`, `refactor`) |
| `create_pr` | boolean | No | `false` | Whether to create a PR after pushing the branch |
| `pr_title` | string | No | - | PR title (required if `create_pr=true`) |
| `pr_body` | string | No | - | PR body content (markdown supported) |

## Workflow Phases

### Phase 1: Setup

Prepare the isolated worktree workspace before any coding work.

#### Step 1.1: Preserve Original Directory

Store the current working directory for later restoration:

```bash
# Store current directory (MUST be done before any cd operations)
original_cwd=$(pwd)
```

Record `original_cwd` in your working memory. You will need this value in Phase 4 before cleanup.

#### Step 1.2: Create Worktree

Run the worktree creation command with the provided parameters:

```bash
rp1 agent-tools worktree create --slug {task_slug} --prefix {agent_prefix}
```

The command returns JSON. Parse and extract these values:

```json
{
  "path": "/path/to/worktree",
  "branch": "agent-prefix/task-slug-abc123",
  "basedOn": "abc1234"
}
```

Store these values in working memory:

- `worktree_path`: The full path to the worktree directory
- `branch`: The branch name created for this worktree
- `basedOn`: The commit hash the branch was created from

If the command fails, **STOP** and report the error to the user. Do not proceed with partial state.

#### Step 1.3: Enter Worktree

Change to the worktree directory:

```bash
cd {worktree_path}
```

Verify you are in the correct directory before proceeding.

#### Step 1.4: Verify Worktree State

**CRITICAL**: Verify the worktree is properly initialized before any git operations. This prevents corrupted PRs.

**Check 1: Verify history exists**

```bash
git log --oneline -3
```

Expected: At least 3 commits should be visible. If the output shows fewer commits or an error about missing history, the worktree is corrupted.

**Check 2: Verify basedOn commit is in history**

The `basedOn` commit from Step 1.2 must appear in the recent history. Run:

```bash
git log --oneline | grep {basedOn}
```

Or visually confirm the commit hash appears in the `git log --oneline -3` output. The `basedOn` commit should be the HEAD commit at this point.

**Check 3: Verify branch name**

```bash
git branch --show-current
```

Expected: Output matches the `branch` value from Step 1.2 exactly.

#### Verification Failure Protocol

If ANY verification check fails:

1. **STOP** immediately - do not proceed to Phase 2
2. Report the failure to the user with:
   - Which check failed (history, basedOn, or branch)
   - Expected value vs actual value
   - The worktree path for investigation
3. Run cleanup: `cd {original_cwd} && rp1 agent-tools worktree cleanup {worktree_path}`
4. Suggest the user investigate and retry

#### Phase 1 Complete

Once all verifications pass, you are ready to begin implementation work in Phase 2. The worktree is isolated and has valid history.

### Phase 2: Implementation

Perform your coding work with atomic commits using conventional commit format.

#### Step 2.1: Install Dependencies (If Needed)

Before making changes, ensure dependencies are installed if the project requires them. See **WORKFLOWS.md** for dependency detection and installation by project type.

Common patterns:

- `package.json` present: run `bun install` or `npm install`
- `Cargo.toml` present: run `cargo build`
- `requirements.txt` or `pyproject.toml` present: run `pip install -r requirements.txt` or appropriate command

Skip this step if dependencies are already installed or not required.

#### Step 2.2: Implement Changes with Atomic Commits

As you implement changes, commit after each logical unit of work. A "logical unit" is a cohesive change that could stand alone:

- A single function or method
- A bug fix
- A test file
- A configuration change
- A documentation update

**Commit Command Pattern**:

```bash
git add -A && git commit -m "type(scope): description"
```

#### Step 2.3: Conventional Commit Format

All commits MUST use conventional commit format:

| Type | When to Use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only changes |
| `test` | Adding or modifying tests |
| `chore` | Maintenance tasks (deps, config) |
| `style` | Formatting, whitespace (no code change) |
| `perf` | Performance improvements |

**Format**: `type(scope): short description`

**Examples**:

```bash
git commit -m "feat(auth): add JWT token validation"
git commit -m "fix(api): handle null response from endpoint"
git commit -m "refactor(utils): extract date formatting to helper"
git commit -m "test(auth): add unit tests for login flow"
git commit -m "docs(readme): update installation instructions"
```

**Rules**:

- Type is required, scope is optional but recommended
- Description is lowercase, imperative mood ("add" not "added")
- No period at the end
- Keep under 72 characters

#### Step 2.4: Dirty State Policy

**CRITICAL**: Never leave the worktree in a dirty state between work sessions.

Before pausing or ending work:

1. Run `git status` to check for uncommitted changes
2. If changes exist, either:
   - Commit them with an appropriate conventional commit message
   - Or, if incomplete, commit with `chore(wip): work in progress on {description}`

**Rationale**: Dirty state at cleanup time requires user intervention and complicates the workflow. Frequent atomic commits prevent this and create clear git history.

#### Step 2.5: Track Commit Count

Keep a mental count of commits made during this session. This count will be validated in Phase 3 before pushing. Example tracking:

- Commit 1: `feat(skill): add parameter table`
- Commit 2: `feat(skill): implement phase 1 setup`
- Commit 3: `docs(skill): add verification failure protocol`

This count helps verify commit ownership before publishing.

#### Phase 2 Complete

When implementation is complete:

1. Ensure all changes are committed (no dirty state)
2. Confirm commit count matches your tracked number
3. Proceed to Phase 3: Publish

### Phase 3: Publish

Before pushing commits to remote, validate that all commits were created during this session. This prevents corrupted PRs with orphan commits or unexpected authors.

#### Step 3.1: Commit Ownership Validation

Run the following command to list all commits that will be pushed:

```bash
git log {basedOn}..HEAD --oneline --format="%h %an <%ae> %s"
```

Replace `{basedOn}` with the commit hash stored from Phase 1, Step 1.2.

**Example output**:

```
abc1234 Claude <noreply@anthropic.com> feat(skill): add parameter table
def5678 Claude <noreply@anthropic.com> feat(skill): implement phase 1 setup
```

#### Step 3.2: Validate Commit Count

Count the commits in the output from Step 3.1. This count MUST match the number of commits you tracked during Phase 2.

**Validation check**:

- Expected commit count: {your_tracked_count}
- Actual commit count: {number of lines in git log output}

If the counts do not match, this indicates orphan commits that were not created by this session.

#### Step 3.3: Verify Commit Ancestry

All commits listed in Step 3.1 MUST descend from the `basedOn` commit. The `git log {basedOn}..HEAD` command inherently filters to only show commits reachable from HEAD that are not reachable from `basedOn`.

If the command returns commits you did not create, or returns an unexpectedly large number of commits, this indicates corrupted history.

**Red flags**:

- Commits with messages you don't recognize
- "Initial commit" entries (indicates orphan history)
- Merge commits you didn't create
- Unexpectedly high commit count (>20 for a typical task)

#### Step 3.4: Check for Unexpected Authors

Review the author information in the git log output from Step 3.1. All commits should have:

- Author name: `Claude` (or the agent's configured identity)
- Author email: `noreply@anthropic.com` (or configured agent email)

**Suspicious authors** (STOP if you see these):

- `Test User <test@test.com>` - test suite contamination
- Generic emails like `user@example.com`
- Authors that don't match the agent's identity
- Multiple different authors (when only one agent worked)

#### Step 3.5: Validation Failure Protocol

If ANY validation check fails:

1. **STOP** immediately - do NOT push the branch
2. Report the anomaly to the user with:
   - Which check failed (count, ancestry, or author)
   - Expected vs actual values
   - The suspicious commits (hash, author, message)
   - The worktree path for investigation
3. Preserve the worktree (do NOT cleanup) for user investigation
4. Suggest the user review the commits with `git log --oneline -20` and `git show {commit_hash}`

See **WORKFLOWS.md** for detailed recovery procedures for each failure type.

#### Step 3.6: Push Branch to Remote

After all validation checks pass, push the branch to the remote:

```bash
git push -u origin {branch}
```

Replace `{branch}` with the branch name stored from Phase 1, Step 1.2.

**Expected output**: Branch pushed successfully with tracking set up.

If push fails (network error, authentication, etc.), see **WORKFLOWS.md** for error recovery procedures.

#### Step 3.7: Create Pull Request (Conditional)

This step only applies when `create_pr=true` parameter was provided.

If `create_pr=false` or not specified, skip to Phase 4: Cleanup.

**CRITICAL**: Create the PR using `--head` flag. Do NOT checkout the branch. The worktree workflow maintains isolation by never switching branches in the main working directory.

```bash
gh pr create --head {branch} --base main --title "{pr_title}" --body "{pr_body}"
```

Replace:

- `{branch}` with the branch name from Phase 1
- `{pr_title}` with the provided PR title parameter
- `{pr_body}` with the provided PR body parameter (can be multi-line markdown)

For multi-line body, use heredoc: `--body "$(cat <<'EOF' ... EOF)"`

**Expected output**: PR created successfully with URL displayed.

If PR creation fails (gh not authenticated, permissions, etc.), see **WORKFLOWS.md** for error recovery.

#### Phase 3 Complete

At this point:

- All commits validated for ownership
- Branch pushed to remote origin
- PR created (if requested)

Proceed to Phase 4: Cleanup.

### Phase 4: Cleanup

Finalize the workflow by cleaning up the worktree. This phase ensures no work is lost and restores the original working directory.

#### Step 4.1: Dirty State Detection

Before cleanup, check for uncommitted changes:

```bash
git status --porcelain
```

**If output is empty**: The worktree is clean. Proceed to Step 4.3.

**If output is non-empty**: Uncommitted changes exist. You MUST resolve them before cleanup. Proceed to Step 4.2.

#### Step 4.2: Dirty State Resolution

**CRITICAL**: Do NOT proceed with cleanup while uncommitted changes exist. Prompt the user for resolution.

Present these options to the user:

```
UNCOMMITTED CHANGES DETECTED

The worktree has uncommitted changes:
{output from git status --porcelain}

Options:
1. COMMIT - Stage and commit changes with a message you provide
2. DISCARD - Discard all uncommitted changes (cannot be undone)
3. ABORT - Preserve worktree for manual resolution (cleanup skipped)

Which option? [1/2/3]:
```

**Option 1: COMMIT**

If user selects commit:

1. Ask user for a commit message (must follow conventional format)
2. Run:

   ```bash
   git add -A && git commit -m "{user_provided_message}"
   ```

3. Push the new commit:

   ```bash
   git push origin {branch}
   ```

4. Log: "User chose to commit remaining changes: {message}"
5. Proceed to Step 4.3

**Option 2: DISCARD**

If user selects discard:

1. Confirm with user: "This will permanently delete uncommitted changes. Type DISCARD to confirm:"
2. If confirmed, run:

   ```bash
   git checkout -- . && git clean -fd
   ```

3. Log: "User chose to discard uncommitted changes"
4. Proceed to Step 4.3

**Option 3: ABORT**

If user selects abort:

1. Log: "User chose to abort cleanup. Worktree preserved at: {worktree_path}"
2. Report to user:

   ```
   CLEANUP ABORTED

   Worktree preserved at: {worktree_path}
   Branch: {branch}

   To resume work: cd {worktree_path}
   To manually cleanup later: rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
   ```

3. **STOP** - Do NOT proceed with cleanup

See **WORKFLOWS.md** for detailed dirty state decision tree and edge cases.

#### Step 4.3: Restore Original Directory

**CRITICAL**: You MUST return to the original working directory before cleanup. The cleanup command will fail if your current working directory is inside the worktree (cannot delete a directory you're standing in).

```bash
cd {original_cwd}
```

Replace `{original_cwd}` with the value stored in Phase 1, Step 1.1.

Verify you are no longer in the worktree:

```bash
pwd
```

Expected output should match `{original_cwd}`, NOT `{worktree_path}`.

#### Step 4.4: Cleanup Worktree

Run the cleanup command to remove the worktree while preserving the branch on remote:

```bash
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

Replace `{worktree_path}` with the path stored from Phase 1, Step 1.2.

**Flags**:

- `--keep-branch`: Preserves the branch on remote (default behavior for pushed branches)

**Expected output**: Worktree removed successfully, branch retained on remote.

If cleanup fails, verify:

1. You are not inside the worktree directory (run `pwd`)
2. The worktree path is correct
3. No other processes have files open in the worktree

#### Phase 4 Complete

The worktree workflow is complete. Summary:

- Worktree removed from local filesystem
- Branch preserved on remote origin
- PR created (if `create_pr=true` was specified)
- Original working directory restored

**Final Status Report**:

```
WORKTREE WORKFLOW COMPLETE

Branch: {branch}
Commits: {commit_count} commits pushed
PR: {pr_url if created, otherwise "Not requested"}
Worktree: Cleaned up
```

## Prohibited Operations

**WARNING**: These git operations are PROHIBITED. They can corrupt history and cause PR incidents (PRs showing massive unexpected deletions).

| Command | Rationale |
|---------|-----------|
| `git init` | Creates orphan repo inside worktree, severing parent history. Commits appear to delete all files. |
| `git rebase` | Rewrites commit history. Can corrupt shared history and create unresolvable conflicts. |
| `git reset --hard` | Permanently discards commits. On shared commits, loses work and corrupts history. |
| `git push --force` | Overwrites remote history. Can destroy other contributors' work permanently. |
| `git checkout {branch}` | Switches branches, breaking worktree isolation. Use a new worktree instead. |
| `git switch {branch}` | Same as checkout - breaks worktree isolation. Each worktree has one branch. |

**Why dangerous**: These commands corrupt the commit graph.

**Safe alternatives**: Use `git merge` instead of rebase. Use `git checkout -- .` instead of reset --hard (discards uncommitted changes only). Create new worktree instead of switching branches. Fix issues locally instead of force pushing.

## References

- **WORKFLOWS.md**: Edge case handling, dirty state resolution, validation failures, error recovery
