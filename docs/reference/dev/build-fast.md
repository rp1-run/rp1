# build-fast

Quick-iteration development for small, well-scoped tasks using the [command-agent pattern](../../concepts/command-agent-pattern.md).

---

## Synopsis

=== "Claude Code"

    ```bash
    /build-fast [development-request...] [--afk] [--confirm-plan] [--review] [--git-commit] [--git-push]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast [development-request...] [--afk] [--confirm-plan] [--review] [--git-commit] [--git-push]
    ```

=== "Codex"

    ```bash
    $rp1-dev-build-fast [development-request...] [--afk] [--confirm-plan] [--review] [--git-commit] [--git-push]
    ```

## Description

The `build-fast` command handles development requests that don't warrant the
full feature workflow. It assesses request scope and either implements the
changes (for small/medium scope) or redirects to `/build` (for large scope).

Every invocation starts a fresh tracked run. Implementation changes happen in
your current checkout, while workflow artifacts are stored under the canonical
project work root. Use `--git-*` flags to enable commits or pushing.

This command uses the [skill-agent pattern](../../concepts/command-agent-pattern.md)
with scope gating and AFK mode support.

!!! tip "Codex syntax"
    In Codex, use the same workflow name with the `$rp1-dev-...` prefix, for
    example `$rp1-dev-build-fast "fix flaky auth test"`.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | `$ARGUMENTS` | Yes | - | Freeform description of what to build |
| `--afk` | Flag | No | `false` | AFK (Away From Keyboard) mode — non-interactive for automation |
| `--confirm-plan` | Flag | No | `false` | Enable plan review checkpoint before implementation |
| `--review` | Flag | No | `false` | Enable task-reviewer validation after implementation |
| `--git-commit` | Flag | No | `false` | Commit changes |
| `--git-push` | Flag | No | `false` | Push branch to remote |

## Scope Assessment

The command assesses request complexity before execution:

| Scope | Hours | Behavior |
|-------|-------|----------|
| Small | <2 | Implements changes |
| Medium | 2-8 | Implements changes |
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
    /rp1-dev-build-fast "update dependency versions" --afk
    ```

**AFK mode behavior**:

| Decision Point | Behavior |
|----------------|----------|
| KB missing | Warn, continue |
| Tech choice | Use patterns.md preference |
| Test scope | Conservative (minimal) |
| Commit message | Generate from request |
| Dirty state | Commit with WIP message |

All auto-decisions are logged in the quick-build artifact with "(AFK auto)"
prefix.

## Confirm Mode

For interactive review of plans before execution, use the `--confirm-plan` flag:

=== "Claude Code"

    ```bash
    /build-fast "refactor the payment module" --confirm-plan
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "refactor the payment module" --confirm-plan
    ```

**Confirm mode adds two checkpoints**:

### Plan Review Checkpoint

After planning, before implementation begins:

```
## Plan Review

**Scope**: Medium
**Estimated Effort**: 3 hours
**Artifact**: .rp1/work/quick-builds/2026-02-01-refactor-payment-1.md

**Tasks**:
1. Extract payment validation logic
2. Create PaymentProcessor class
3. Update existing callers

**Files**: src/payment.ts, src/utils/validation.ts

Options:
1. "Continue" - Proceed with implementation
2. "Revise" - Re-plan with your feedback
3. "Stop" - Exit (artifact preserved for reference)
```

### Post-Implementation Checkpoint

After implementation completes:

```
## Implementation Complete

**Branch**: quick-build-refactor-payment
**Artifact**: .rp1/work/quick-builds/2026-02-01-refactor-payment-1.md

Review the changes, then:
1. "Done" - Finish workflow
2. "Add/Edit" - Describe additional changes needed
```

!!! note "AFK overrides confirm-plan"
    When `--afk` is specified, `--confirm-plan` is automatically disabled since AFK mode is non-interactive.

## Examples

### Quick Fix

=== "Claude Code"

    ```bash
    /build-fast "Fix the authentication bug when token expires"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "Fix the authentication bug when token expires"
    ```

=== "Codex"

    ```bash
    $rp1-dev-build-fast "Fix the authentication bug when token expires"
    ```

### Small Enhancement

=== "Claude Code"

    ```bash
    /build-fast "Add a date formatting utility to utils/date.ts"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "Add a date formatting utility to utils/date.ts"
    ```

### Performance Optimization

=== "Claude Code"

    ```bash
    /build-fast "Optimize the database query in reports module"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "Optimize the database query in reports module"
    ```

### With Plan Review

=== "Claude Code"

    ```bash
    /build-fast "add user preferences API endpoint" --confirm-plan --review
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "add user preferences API endpoint" --confirm-plan --review
    ```

## Workflow

The command uses one fresh run per invocation, then moves through bootstrap,
planning, build, and review/finalization:

| Phase | What Happens |
|------|---------------|
| Bootstrap | Resolves canonical `projectRoot`, `kbRoot`, and `workRoot`, then creates a new `build-fast` run. Unlike `/build`, `build-fast` never resumes an earlier run. |
| Plan | Loads KB context, assesses scope, creates a quick-build artifact for Small/Medium requests, and optionally pauses for plan confirmation. Large requests stop here with a redirect to `/build`. |
| Build | Delegates the planned work to `task-builder` using the quick-build artifact as the source of truth. |
| Review / Finalize | Optionally runs `task-reviewer`, retries once on failure, optionally pushes, and optionally pauses for a post-implementation checkpoint before final output. |

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

## Git Operations

By default, `build-fast` makes changes in your current working directory without any git operations. Use flags to opt-in:

| Flag | Effect |
|------|--------|
| `--git-commit` | Commit changes after implementation |
| `--git-push` | Push branch to remote (requires --git-commit) |

## Output

### Quick Build Artifact

For Small and Medium requests, `build-fast-planner` writes one canonical
artifact:

```
.rp1/work/quick-builds/{yyyy-mm-dd}-{slug}-{n}.md
```

This file is the workflow's source of truth and includes:

- Original request documentation
- Scope assessment and implementation approach
- Task checklist for `task-builder`
- Implementation summary
- Verification notes (when review is enabled)

### Large Scope Redirect

When scope is assessed as Large, `build-fast` stops before writing a quick-build
artifact and returns a redirect to `/build`:

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

## Related Commands

- [`build`](build.md) - For larger features requiring full workflow
- [`code-check`](code-check.md) - Verify changes
