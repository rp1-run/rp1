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
changes (for small/medium scope), redirects to `/build` for a large single
feature, or redirects to `/phase-plan` for initiative-sized work that needs
durable phase planning first.

Every invocation starts a fresh tracked run. Implementation changes happen in
your current checkout, while workflow artifacts are stored under the canonical
project work root. Non-AFK runs pause for plan review after the quick-build
artifact is registered and before implementation begins. Use `--git-*` flags to
enable commits or pushing.

`build-fast` also snapshots the repository before implementation and resolves
automatic comment cleanup through a generated change manifest after
implementation and optional review. Cleanup runs only when that manifest is
created and non-empty.

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
| `--confirm-plan` | Flag | No | `false` | Enable the post-implementation checkpoint; plan review is default unless `--afk` is set |
| `--review` | Flag | No | `false` | Enable implementation review after the change |
| `--git-commit` | Flag | No | `false` | Commit changes |
| `--git-push` | Flag | No | `false` | Push branch to remote |

## Scope Assessment

The command assesses request complexity before execution:

| Scope | Hours | Behavior |
|-------|-------|----------|
| Small | <2 | Implements changes |
| Medium | 2-8 | Implements changes |
| Large single feature | >8 | Redirects to `/build` |
| Initiative-sized / phased rollout | Varies | Redirects to `/phase-plan` |

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
| Plan review | Skipped |
| KB missing | Warn, continue |
| Tech choice | Use patterns.md preference |
| Test scope | Conservative (minimal) |
| Commit message | Generate from request |
| Dirty state | Commit with WIP message |

All auto-decisions are logged in the quick-build artifact with "(AFK auto)"
prefix.

## Interactive Checkpoints

By default, non-AFK runs pause after planning so you can review the artifact and
task list before implementation begins. Use `--confirm-plan` when you also want
a checkpoint after implementation and cleanup:

=== "Claude Code"

    ```bash
    /build-fast "refactor the payment module" --confirm-plan
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build-fast "refactor the payment module" --confirm-plan
    ```

### Plan Review Checkpoint

After planning and quick-build artifact registration, before implementation
begins:

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
3. "Review feedback from Arcade" - Process open Arcade feedback, then return to this checkpoint
4. "Stop" - Exit (artifact preserved for reference)
```

### Post-Implementation Checkpoint

When `--confirm-plan` is set, `build-fast` also pauses after implementation and
cleanup:

```
## Implementation Complete

**Branch**: quick-build-refactor-payment
**Artifact**: .rp1/work/quick-builds/2026-02-01-refactor-payment-1.md

Review the changes, then:
1. "Done" - Finish workflow
2. "Add/Edit" - Describe additional changes needed
3. "Review feedback from Arcade" - Process open Arcade feedback, then return to this checkpoint
```

!!! note "AFK overrides checkpoints"
    When `--afk` is specified, the default plan checkpoint is skipped and
    `--confirm-plan` is automatically disabled since AFK mode is
    non-interactive.

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

### With Post-Implementation Checkpoint

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
| Bootstrap | Finds the project and rp1 work directory, then creates a new `build-fast` run. Unlike `/build`, `build-fast` never resumes an earlier run. |
| Plan | Loads KB context, assesses scope, creates and registers a quick-build artifact for Small/Medium requests, and pauses for plan confirmation unless `--afk` is set. Large single-feature requests stop here with a redirect to `/build`; initiative-sized requests stop here with a redirect to `/phase-plan`. |
| Build | Snapshots the cleanup baseline, then delegates the planned work using the quick-build artifact as the source of truth. |
| Review / Finalize | Optionally runs review, retries once on failure, records the cleanup boundary, cleans comments when safe, optionally pushes, and optionally pauses for a post-implementation checkpoint before final output. |

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
- Task checklist for the implementation pass
- Implementation summary
- Verification notes (when review is enabled)

### Advanced: Comment Cleanup Output

This section keeps the generated cleanup artifact names because they are useful
when auditing why cleanup ran, skipped, or stopped before editing.

For Small and Medium requests, `build-fast` writes cleanup artifacts next to the
quick-build artifact:

- `{RUN_ID}-change-manifest-baseline.json` - repository state before
  implementation starts
- `{RUN_ID}-change-manifest-001.json` - cleanup-owned files and line ranges,
  when generated
- `{RUN_ID}-change-manifest-status.json` - created/skipped status, file counts,
  owned-line counts, dirty-path metadata, and skip reason

The final output includes:

| Field | Meaning |
|-------|---------|
| `Comment Cleanup` | Cleaner status, or `WARN` when cleanup was skipped before dispatch |
| `Cleanup Manifest` | Generated manifest path, or `None` when skipped |
| `Cleanup Status` | Status artifact path for created and skipped outcomes |
| `Cleanup Skip Reason` | `None` when cleanup ran, otherwise the fail-closed reason |

Common skip reasons include `no_supported_source_hunks`,
`pre_existing_dirty_paths_overlap`, `missing_baseline`,
`invalid_baseline`, `baseline_code_root_mismatch`,
`scope_outside_code_root`, `invalid_scope`, and `unsupported_scope`.
`build-fast` never asks the cleanup agent to infer scope from branch names,
commit ranges, dirty labels, or implementation-authored hunks.

### Large and Initiative Redirects

When scope exceeds `build-fast`, the workflow stops before writing a quick-build
artifact:

- If the request is still one cohesive feature, the redirect points to `/build`.
- If the request spans multiple independently valuable slices, rollout phases,
  or child-feature handoffs, the redirect points to `/phase-plan`.

For `/phase-plan`, the redirect expects a completed PRD or oversized
`requirements.md` artifact as its source. If you do not have that artifact yet,
create it first instead of trying to phase-plan directly from freeform request
text.

Typical redirect shapes:

```
## REQUEST EXCEEDS /build-fast SCOPE

Request: [summary]
Estimated Effort: [hours]

Recommended Path: /build {feature-id}

- or -

Recommended Path: /phase-plan <prd-or-requirements-source>

Why:
- [reasons]

Recommended Quick Win: [simplest valuable alternative]
```

## Related Commands

- [`build`](build.md) - For larger features requiring full workflow
- [`phase-plan`](phase-plan.md) - For initiative-sized work that needs durable child-feature handoffs
- [`code-check`](code-check.md) - Verify changes
