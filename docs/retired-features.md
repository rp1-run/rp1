# Retired Features

This page documents capabilities that have been intentionally removed from rp1. Each entry explains what was removed, why, what remains supported, and what to use instead.

---

## Gemini CLI Platform

**Removed before public release**: v0.7.x development branch

### What Was Removed

rp1 previously carried unreleased Gemini CLI extension work as the Google host
target for a development branch. That work was replaced before release and is
not an active public platform.

### Why It Was Removed

- **Correct product target**: Antigravity CLI is the supported Google host for
  this branch.
- **Cleaner user guidance**: Public docs, generated guides, lifecycle commands,
  and troubleshooting should not imply that Gemini CLI support shipped.
- **Fresh validation boundary**: Gemini-era evidence can explain history, but it
  cannot prove current Antigravity behavior.

### What Remains Supported

Antigravity CLI is the active Google host target. Use `agy` and the
Antigravity lifecycle commands:

```bash
rp1 install antigravity
rp1 verify antigravity --workflow <workflow-id>
rp1 update plugins antigravity
rp1 uninstall antigravity
```

### What to Use Instead

Use the [Antigravity CLI platform guide](reference/platforms/antigravity.md)
for current package, lifecycle, dynamic delegation, support-matrix, and
troubleshooting guidance.

Historical Gemini notes are retained only in
[Retired Gemini CLI Platform Notes](reference/platforms/gemini.md).

---

## Worktree Management

**Removed in**: v0.6.0

### What Was Removed

rp1 previously provided CLI commands and workflow flags for creating, managing, and cleaning up git worktrees on behalf of users:

| Removed Surface | Description |
|-----------------|-------------|
| `rp1 agent-tools worktree create` | Created a git worktree with a dedicated branch |
| `rp1 agent-tools worktree cleanup` | Removed a worktree and optionally deleted its branch |
| `rp1 agent-tools worktree status` | Checked whether the current directory is inside a worktree |
| `--git-worktree` flag | Enabled worktree isolation in `/build` and `/build-fast` |
| `worktree-workflow` skill | Orchestrated worktree lifecycle operations |

### Why It Was Removed

- **Reduced mutation risk**: rp1 no longer performs implicit repository-topology changes.
- **Simplified product surface**: Users understand rp1 as worktree-aware, not worktree-owning.
- **Lower maintenance burden**: Worktree lifecycle management was outside the core value proposition of workflow orchestration and knowledge-aware assistance.

### What Remains Supported

rp1 is still **worktree-aware** for project resolution. When invoked from a
user-managed linked worktree, rp1 correctly resolves the authoritative `.rp1`
directory from the main repository root.

### What to Use Instead

Manage git worktrees directly with native git:

```bash
# Create a worktree
git worktree add ../my-feature-worktree -b my-feature

# List worktrees
git worktree list

# Remove a worktree
git worktree remove ../my-feature-worktree
```

rp1 will continue to operate correctly when invoked from any linked worktree.
