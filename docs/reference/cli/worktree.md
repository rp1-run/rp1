# worktree

Manages git worktrees for isolated agent execution, enabling safe experimentation without affecting uncommitted work.

!!! note "Internal Tool"
    This CLI tool is used internally by rp1 agents. It is not intended for direct use by users.

---

## Synopsis

```bash
rp1 agent-tools worktree <subcommand> [options]
```

## Description

The `worktree` agent tool provides subcommands to create, manage, and clean up git worktrees. These worktrees give agents an isolated environment to make changes without risking the user's uncommitted work in the main repository.

Worktrees created by this tool have git hooks disabled (`core.hooksPath=/dev/null`) for safety and isolation, preventing hooks from the main repository from interfering with agent operations.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| [`create`](#create) | Create a new worktree with a dedicated branch |
| [`cleanup`](#cleanup) | Remove a worktree and optionally delete its branch |
| [`status`](#status) | Check if currently running in a worktree |

---

## create

Creates a new git worktree with an associated branch for isolated development.

### Synopsis

```bash
rp1 agent-tools worktree create <slug> [--prefix <prefix>]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `slug` | Yes | - | Task identifier for branch naming |
| `--prefix` | No | `quick-build` | Branch name prefix |

### Output

```json
{
  "success": true,
  "tool": "worktree",
  "data": {
    "path": "/Users/dev/project/.rp1/work/worktrees/quick-build-fix-auth",
    "branch": "quick-build-fix-auth",
    "basedOn": "a1b2c3d4e5f6"
  }
}
```

| Field | Description |
|-------|-------------|
| `path` | Absolute path to the created worktree |
| `branch` | Name of the new branch |
| `basedOn` | Commit SHA the worktree is based on (HEAD at creation time) |

### Slug Generation

The slug is derived from the task description. Common transformations:

| Input | Slug |
|-------|------|
| "Fix the authentication bug in login" | `fix-authentication-bug-login` |
| "Add dark mode toggle to settings" | `add-dark-mode-toggle-settings` |
| "REQ-123: Improve performance" | `req-123-improve-performance` |

Slugs are:

- Lowercased
- Limited to 50 characters (truncated at word boundary)
- Stripped of special characters except hyphens

### Branch Collision Handling

If the generated branch name already exists, a numeric suffix is appended:

- `quick-build-fix-auth` (first attempt)
- `quick-build-fix-auth-2` (if first exists)
- `quick-build-fix-auth-3` (if second exists)

### Example

```bash
$ rp1 agent-tools worktree create fix-auth-bug
{
  "success": true,
  "tool": "worktree",
  "data": {
    "path": "/Users/dev/myproject/.rp1/work/worktrees/quick-build-fix-auth-bug",
    "branch": "quick-build-fix-auth-bug",
    "basedOn": "abc123def456"
  }
}
```

---

## cleanup

Removes a worktree and optionally deletes the associated branch.

### Synopsis

```bash
rp1 agent-tools worktree cleanup <path> [--keep-branch] [--force]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `path` | Yes | - | Absolute path to the worktree |
| `--keep-branch` | No | `true` | Preserve the branch after removing worktree |
| `--force` | No | `false` | Force removal even with uncommitted changes |

### Output

```json
{
  "success": true,
  "tool": "worktree",
  "data": {
    "removed": true,
    "branchDeleted": false,
    "path": "/Users/dev/project/.rp1/work/worktrees/quick-build-fix-auth"
  }
}
```

| Field | Description |
|-------|-------------|
| `removed` | Whether the worktree was successfully removed |
| `branchDeleted` | Whether the branch was also deleted |
| `path` | Path of the removed worktree |

### Example

```bash
# Keep branch for later merge
$ rp1 agent-tools worktree cleanup /path/to/worktree --keep-branch

# Remove worktree and delete branch
$ rp1 agent-tools worktree cleanup /path/to/worktree --keep-branch=false

# Force removal of dirty worktree
$ rp1 agent-tools worktree cleanup /path/to/worktree --force
```

---

## status

Checks whether the current directory is inside a git worktree.

### Synopsis

```bash
rp1 agent-tools worktree status
```

### Output

When in a worktree:

```json
{
  "success": true,
  "tool": "worktree",
  "data": {
    "isWorktree": true,
    "path": "/Users/dev/project/.rp1/work/worktrees/quick-build-fix-auth",
    "branch": "quick-build-fix-auth",
    "mainRepoPath": "/Users/dev/project"
  }
}
```

When in the main repository:

```json
{
  "success": true,
  "tool": "worktree",
  "data": {
    "isWorktree": false
  }
}
```

| Field | Description |
|-------|-------------|
| `isWorktree` | `true` if in a linked worktree, `false` if in main repo |
| `path` | Worktree path (only if `isWorktree` is true) |
| `branch` | Branch name (only if `isWorktree` is true) |
| `mainRepoPath` | Path to main repository (only if `isWorktree` is true) |

---

## Directory Structure

Worktrees are created under `.rp1/work/worktrees/`:

```
.rp1/
├── context/                          # Shared knowledge base
├── work/
│   ├── worktrees/
│   │   └── quick-build-fix-auth/     # Worktree directory
│   │       ├── .git                  # File pointing to main .git
│   │       ├── src/                  # Full repo copy
│   │       └── ...
│   └── quick-builds/                 # Summary documents
└── meta.json
```

The worktree directory contains a complete copy of the repository at the base commit, allowing the agent to make changes without affecting the main working directory.

## Git Hooks Isolation

Worktrees created by this tool have git hooks disabled by default. This is achieved by setting `core.hooksPath=/dev/null` in the worktree's local git configuration.

### Why Hooks Are Disabled

- **Safety**: Prevents potentially destructive hooks from the main repository from running during agent operations
- **Isolation**: Ensures the worktree environment is predictable and controlled
- **Speed**: Avoids hook execution overhead during rapid agent iterations
- **Consistency**: Agent behavior remains consistent regardless of what hooks are configured in the main repo

### What This Means

When working in an rp1 worktree:

- Pre-commit hooks will not run
- Pre-push hooks will not run
- Commit-msg hooks will not run
- All other git hooks are bypassed

This allows agents to commit freely without interference from linters, formatters, or validation scripts that may be configured in the main repository.

## Requirements

- **Git 2.15+**: The worktree feature requires git 2.15 or later for full functionality
- **Clean worktree path**: The target directory must not exist before creation

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Git version too old | Git < 2.15 installed | Upgrade git to 2.15+ |
| Branch already exists | Slug collision | Tool auto-appends numeric suffix |
| Path already exists | Previous worktree not cleaned up | Clean up manually or use different slug |
| Worktree has changes | Uncommitted modifications during cleanup | Use `--force` flag or commit changes |

## Use Cases

### Isolated Development

The primary use case is providing agents with a safe sandbox:

1. User invokes `/build-fast "fix auth bug"`
2. Agent creates worktree: `rp1 agent-tools worktree create fix-auth-bug`
3. Agent works in worktree, making changes freely
4. Agent commits changes to the worktree branch
5. On success: Agent cleans up worktree, user merges branch
6. On failure: Worktree preserved for debugging

### Protecting Uncommitted Work

When the main repository has uncommitted changes, the agent warns the user but proceeds safely:

- Agent works on HEAD (last commit), not uncommitted changes
- User's uncommitted work remains untouched in main repo
- After completion, user can merge agent's branch alongside their changes

## Related

- [`rp1-root-dir`](rp1-root-dir.md) - Resolve RP1_ROOT with worktree awareness
- [`build-fast`](../dev/build-fast.md) - Uses worktrees for isolated development
