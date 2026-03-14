# rp1-root-dir

Resolves the RP1_ROOT path with read-only git worktree detection, ensuring agents always access the correct knowledge base location.

---

## Synopsis

```bash
rp1 agent-tools rp1-root-dir
```

## Description

The `rp1-root-dir` agent tool resolves the path to the `.rp1/` directory, handling the case where the agent is running inside a linked git worktree. This ensures that agents can access the shared knowledge base from the main repository even when operating from a worktree checkout. This tool performs read-only detection only; rp1 does not create or manage git worktrees.

## Output

Returns JSON with the resolved root path and context information:

```json
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "root": "/Users/dev/myproject/.rp1",
    "isWorktree": true,
    "worktreeName": "quick-build-fix-auth",
    "source": "git-common-dir"
  }
}
```

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Absolute path to the `.rp1/` directory |
| `isWorktree` | boolean | `true` if running in a linked git worktree |
| `worktreeName` | string | Branch name if in a worktree (optional) |
| `source` | string | How the root was resolved: `env`, `git-common-dir`, or `cwd` |

### Resolution Sources

| Source | Description |
|--------|-------------|
| `env` | Used `RP1_ROOT` environment variable override |
| `git-common-dir` | Resolved from git's common directory (worktree scenario) |
| `cwd` | Standard resolution from current working directory |

## Resolution Algorithm

The tool resolves the root path using this priority:

1. **Environment override**: If `RP1_ROOT` is set, use it directly
2. **Git worktree detection**: Run `git rev-parse --git-common-dir` to find the shared git directory
3. **Standard resolution**: Use `.rp1/` relative to current working directory

When running in a linked worktree, the tool detects this by comparing `git rev-parse --git-dir` with `git rev-parse --git-common-dir`. If they differ, the agent is in a worktree and the main repository root is derived from the common directory.

## Examples

### Standard Repository

```bash
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "root": "/Users/dev/myproject/.rp1",
    "isWorktree": false,
    "source": "cwd"
  }
}
```

### Inside a Worktree

```bash
$ cd /Users/dev/myproject/.rp1/work/worktrees/quick-build-fix-auth
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "root": "/Users/dev/myproject/.rp1",
    "isWorktree": true,
    "worktreeName": "quick-build-fix-auth",
    "source": "git-common-dir"
  }
}
```

### With Environment Override

```bash
$ export RP1_ROOT=/custom/path/.rp1
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "root": "/custom/path/.rp1",
    "isWorktree": false,
    "source": "env"
  }
}
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Not a git repository | Running outside a git repo without `RP1_ROOT` | Initialize git or set `RP1_ROOT` |
| Git command failed | Git not installed or corrupted | Install git 2.15+ |

## Use Cases

This tool is primarily used by agents that need to access the knowledge base regardless of working directory:

- **Linked worktree detection**: When invoked from a user-managed linked worktree, resolves back to the main repository's `.rp1/` directory
- **Custom RP1_ROOT**: Projects using non-standard `.rp1/` locations
- **Monorepo setups**: Ensuring consistent KB access across workspace directories

## Related

- [`build-fast`](../dev/build-fast.md) - Quick-iteration development workflow
