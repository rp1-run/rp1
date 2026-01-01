# build-fast

Quick-iteration development for small/medium scope changes with TIN architecture.

---

## Synopsis

=== "Claude Code"

    ```bash
    /build-fast <development-request> [--afk]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build-fast <development-request> [--afk]
    ```

## Description

The `build-fast` command handles development requests that don't warrant the full feature workflow. It assesses request scope and either implements the changes (for small/medium scope) or redirects to `/build` (for large scope). All changes are made in an isolated git worktree.

This command replaces `code-quick-build` with improved TIN (Thin command + sub-agent delegation) architecture, scope gating, and AFK mode support.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | `$ARGUMENTS` | Yes | - | Freeform description of what to build |
| `--afk` | Flag | No | `false` | Non-interactive mode for automation |

## Scope Assessment

The command assesses request complexity before execution:

| Scope | Hours | Behavior |
|-------|-------|----------|
| Small | <2 | Implements in worktree |
| Medium | 2-8 | Implements in worktree |
| Large | >8 | Redirects to `/build` |

**Assessment criteria**:

| Factor | Small | Medium | Large |
|--------|-------|--------|-------|
| Files | 1-3 | 4-7 | >7 |
| Systems | 1 | 1-2 | >2 |
| Risk | Low | Medium | High |

## AFK Mode

For automation scenarios (CI, scripts), use the `--afk` flag:

=== "Claude Code"

    ```bash
    /build-fast "update dependency versions" --afk
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build-fast "update dependency versions" --afk
    ```

**AFK mode behavior**:

| Decision Point | Behavior |
|----------------|----------|
| KB missing | Warn, continue |
| Tech choice | Use patterns.md preference |
| Test scope | Conservative (minimal) |
| Commit message | Generate from request |
| Dirty state | Commit with WIP message |

All auto-decisions are logged in the summary artifact with "(AFK auto)" prefix.

## Examples

### Quick Fix

=== "Claude Code"

    ```bash
    /build-fast "Fix the authentication bug when token expires"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build-fast "Fix the authentication bug when token expires"
    ```

### Small Enhancement

=== "Claude Code"

    ```bash
    /build-fast "Add a date formatting utility to utils/date.ts"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build-fast "Add a date formatting utility to utils/date.ts"
    ```

### Performance Optimization

=== "Claude Code"

    ```bash
    /build-fast "Optimize the database query in reports module"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build-fast "Optimize the database query in reports module"
    ```

## Workflow

1. **KB loading** - Progressively loads knowledge base based on request type
2. **Scope assessment** - Categorizes as Small, Medium, or Large
3. **Branch: Large scope** - Redirects to `/build` with options
4. **Branch: Small/Medium** - Continues to implementation
5. **Worktree setup** - Creates isolated git worktree
6. **Implementation** - Code changes following codebase patterns
7. **Quality checks** - Format, lint, test
8. **Summary artifact** - Writes documentation
9. **Finalization** - Push branch, cleanup worktree

## KB Loading

The command loads KB context progressively based on request type:

| Request Type | KB Files Loaded |
|--------------|-----------------|
| Always | `index.md` |
| Bug fix | + `patterns.md` |
| Feature | + `architecture.md`, `modules.md` |
| Refactor | + `architecture.md`, `patterns.md` |
| Performance | + `architecture.md` |

If KB files are missing, the command warns but continues.

## Worktree Isolation

All changes are made in an isolated git worktree:

- **Your changes are safe**: Uncommitted work in your main repository is never touched
- **Agent works on HEAD**: Changes are based on your last commit
- **Easy integration**: After completion, you get a branch ready to merge or PR

### After Completion

On success, you receive integration options:

```bash
# Merge the branch
git merge quick-build-fix-auth

# Or cherry-pick specific commits
git cherry-pick quick-build-fix-auth

# Or create a PR
git push -u origin quick-build-fix-auth
```

## Output

### Summary Artifact

After completing a task, the command generates a summary document at:

```
{RP1_ROOT}/work/quick-builds/{YYYYMMDD-HHMMSS-slug}/summary.md
```

This provides:

- Original request documentation
- Files modified with change descriptions
- Key implementation decisions
- Verification steps performed
- Notes and follow-up considerations

### Large Scope Redirect

When scope is assessed as Large:

```
## REQUEST EXCEEDS SCOPE

Request: [summary]
Estimated Effort: [hours]

Why This Needs /build:
- [reasons]

Options:
1. Reduce scope: [minimal solution]
2. Phase it: [breakdown]
3. Use full workflow: Run /build {feature-id}

Recommended Quick Win: [simplest valuable alternative]
```

!!! note "Git 2.15+ Required"
    Worktree isolation requires git 2.15 or later. Check your version with `git --version`.

!!! tip "Migration from code-quick-build"
    If you were using `/code-quick-build`, simply replace it with `/build-fast`. The syntax is identical for basic usage, with the addition of `--afk` for non-interactive mode.

## Related Commands

- [`code-quick-build`](code-quick-build.md) - Deprecated, use `build-fast` instead
- [`feature-requirements`](feature-requirements.md) - For larger features requiring full workflow
- [`code-check`](code-check.md) - Verify changes
