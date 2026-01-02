# Parallel Development with Worktrees

Run multiple tasks simultaneously using git worktrees. Each task gets an isolated environment, so you can work on several features at once without conflicts.

!!! tip "Concept Background"
    This guide covers practical usage. For the conceptual explanation of how worktrees work, see [Parallel Worktrees](../concepts/parallel-worktrees.md).

## How rp1 Uses Worktrees

When worktrees are enabled, rp1 automatically:

1. **Creates a worktree** in `$RP1_ROOT/work/worktrees/<task-slug>`
2. **Creates a branch** named `quick-build-<task-slug>`
3. **Executes the task** in isolation
4. **Commits changes** to the worktree branch
5. **Preserves the branch** for you to review and merge

Your main working directory stays untouched. Any uncommitted work you have remains safe.

---

## Running Tasks in Parallel

With worktrees, you can run multiple rp1 sessions simultaneously:

```bash
# Terminal 1: Fix authentication bug
/build-fast "Fix the OAuth token refresh bug"

# Terminal 2: Add new feature
/build-fast "Add user profile avatars"

# Terminal 3: Refactor module
/build-fast "Extract validation helpers"
```

Each task gets its own worktree and branch. No conflicts, no waiting.

---

## Directory Structure

`$RP1_ROOT` defaults to `.rp1/` in your project root. See [The .rp1 Directory](../getting-started/rp1-directory.md) for details.

```
your-project/
├── $RP1_ROOT/
│   └── work/
│       └── worktrees/
│           ├── quick-build-fix-auth/      # Worktree 1
│           │   ├── src/
│           │   ├── package.json
│           │   └── ...
│           └── quick-build-add-avatars/   # Worktree 2
│               ├── src/
│               ├── package.json
│               └── ...
├── src/                                    # Your main directory
├── package.json
└── ...
```

---

## After Task Completion

When a task completes successfully, the agent automatically:

1. **Creates a branch** on your main repository with the changes
2. **Cleans up the worktree** — no manual cleanup needed
3. **Preserves the branch** for you to review and merge

You then merge when ready:

```bash
git merge quick-build-<task-slug>
```

### Debugging Unfinished Tasks

You only need to navigate to a worktree directly if:

- The task was interrupted or left in an unfinished state
- You want to debug or inspect the agent's work in progress

```bash
# Navigate to the worktree
cd $RP1_ROOT/work/worktrees/<task-slug>

# When done, clean up manually
cd /your/project
rp1 agent-tools worktree cleanup $RP1_ROOT/work/worktrees/<task-slug> --keep-branch
```

---

## Enabling and Disabling Worktrees

| Command | Default | Toggle |
|---------|---------|--------|
| `/build` | Worktrees **enabled** | `--no-worktree` to disable |
| `/build-fast` | Worktrees **disabled** | `--use-worktree` to enable |

```bash
# Disable worktree isolation in /build (changes happen in main directory)
/build my-feature --no-worktree

# Enable worktree isolation in /build-fast
/build-fast "Fix the auth bug" --use-worktree
```

---

## Requirements

- **Git 2.15+**: Required for full worktree functionality
- **Sufficient disk space**: Each worktree is a full copy of your repository

---

## Related

- [Parallel Worktrees Concept](../concepts/parallel-worktrees.md) - How worktrees work
- [`/build-fast`](../reference/dev/build-fast.md) - Primary command using worktrees
- [`worktree` CLI tool](../reference/cli/worktree.md) - Internal tool reference
