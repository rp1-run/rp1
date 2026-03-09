# Retired Features

This page documents capabilities that have been intentionally removed from rp1. Each entry explains what was removed, why, what remains supported, and what to use instead.

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

rp1 is still **worktree-aware** for project resolution. When invoked from a user-managed linked worktree, rp1 correctly resolves the authoritative `.rp1` directory from the main repository root. This behavior is provided by the [`rp1-root-dir`](reference/cli/rp1-root-dir.md) agent tool, which performs read-only detection only.

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
