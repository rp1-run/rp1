# code-quick-build

!!! warning "Deprecated"
    This command is deprecated. Use [`build-fast`](build-fast.md) instead.

    **Migration**: Replace `/code-quick-build "request"` with `/build-fast "request"`.

    The new command provides:

    - TIN architecture (thin command + sub-agent delegation)
    - AFK mode for non-interactive execution (`--afk` flag)
    - Enhanced scope assessment with redirect to `/build` for large requests

Handles exploratory development requests including quick fixes, prototypes, and small enhancements.

---

## Synopsis

=== "Claude Code"

    ```bash
    /code-quick-build <development-request>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build <development-request>
    ```

## Description

The `code-quick-build` command handles development requests that don't warrant the full feature workflow. It's designed for quick fixes, prototypes, performance optimizations, and small feature enhancements with proper planning and scope management.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | `$ARGUMENTS` | Yes | - | Description of what to build |

## Use Cases

| Type | Example |
|------|---------|
| Quick fix | "Fix the null pointer in user validation" |
| Prototype | "Add a basic dark mode toggle" |
| Optimization | "Improve query performance in reports" |
| Enhancement | "Add loading spinner to submit button" |

## Examples

### Quick Fix

=== "Claude Code"

    ```bash
    /code-quick-build "Fix the authentication bug when token expires"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build "Fix the authentication bug when token expires"
    ```

### Small Enhancement

=== "Claude Code"

    ```bash
    /code-quick-build "Add export to CSV button on reports page"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build "Add export to CSV button on reports page"
    ```

## Workflow

1. **Creates isolated worktree** - Sets up a git worktree for safe experimentation
2. **Loads KB context** - Progressively loads knowledge base based on request type
3. **Analyzes the request scope** - Determines if small, medium, or large
4. **Creates implementation plan** - Outlines steps and risks
5. **Implements the changes** - Executes the plan in the worktree
6. **Commits and cleans up** - Commits changes, removes worktree, preserves branch
7. **Generates documentation** - Writes summary to `{RP1_ROOT}/work/quick-builds/{task-id}/summary.md`

## Worktree Isolation

The `code-quick-build` command operates in an isolated git worktree to protect your uncommitted work. This means:

- **Your changes are safe**: Uncommitted work in your main repository is never touched
- **Agent works on HEAD**: Changes are based on your last commit, not uncommitted modifications
- **Easy integration**: After completion, you get a branch ready to merge or cherry-pick

### How It Works

1. **Worktree creation**: A new worktree is created at `{RP1_ROOT}/work/worktrees/quick-build-{slug}/`
2. **Isolated execution**: All file modifications happen inside the worktree
3. **Branch preservation**: Changes are committed to a `quick-build-{slug}` branch
4. **Automatic cleanup**: The worktree directory is removed on success (branch kept)

### Dirty State Warning

If you have uncommitted changes, you'll see a warning:

```
You have uncommitted changes. The agent will work on HEAD (last commit),
not your current changes. Your uncommitted work is safe.
```

This is informational only - the command proceeds safely.

### After Completion

On success, you'll receive integration options:

```bash
# Merge the branch
git merge quick-build-fix-auth

# Or cherry-pick specific commits
git cherry-pick quick-build-fix-auth

# Or create a PR
git push -u origin quick-build-fix-auth
```

### Debugging Failures

If the build fails, the worktree is preserved for investigation:

```bash
# Navigate to the worktree (default: .rp1)
cd {RP1_ROOT}/work/worktrees/quick-build-fix-auth

# Inspect and fix issues
git status
git diff

# Clean up manually when done
rp1 agent-tools worktree cleanup {RP1_ROOT}/work/worktrees/quick-build-fix-auth
```

!!! note "Git 2.15+ Required"
    Worktree isolation requires git 2.15 or later. Check your version with `git --version`.

!!! info "RP1_ROOT"
    `{RP1_ROOT}` defaults to `.rp1` but can be customized via the `RP1_ROOT` environment variable.

## Output

After completing a task, the command generates a summary document at:

```
{RP1_ROOT}/work/quick-builds/{YYYYMMDD-HHMMSS-slug}/summary.md
```

This provides:

- Original request documentation
- Files modified with change descriptions
- Key implementation details
- Verification steps performed
- Notes and follow-up considerations

!!! note "Knowledge Base Loading"
    This command uses progressive KB loading to understand codebase patterns before making changes. It loads `index.md` first, then selectively loads additional KB files based on the request type (e.g., `patterns.md` for bug fixes, `architecture.md` for feature additions).

!!! tip "When to Use Full Workflow"
    If the command determines the request requires significant architectural changes or spans multiple components, it will recommend using the full feature workflow instead.

## Related Commands

- [`feature-requirements`](feature-requirements.md) - For larger features
- [`code-check`](code-check.md) - Verify changes
