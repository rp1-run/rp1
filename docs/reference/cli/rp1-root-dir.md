# rp1-root-dir

Resolves the effective project, knowledge-base, and work directories with read-only git worktree detection.

---

## Synopsis

```bash
rp1 agent-tools rp1-root-dir
```

## Description

The `rp1-root-dir` agent tool resolves the effective directory set for the current project:

- `projectRoot` - the canonical project root
- `kbRoot` - the knowledge-base directory
- `workRoot` - the work artifact directory

When the agent is running inside a linked git worktree, the tool maps back to the main repository so directory resolution stays stable. This tool performs read-only detection only; rp1 does not create or manage git worktrees.

## Output

Returns JSON with the resolved directories and context information:

```json
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/myproject",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/.rp1/Users-dev-myproject",
    "isWorktree": true,
    "worktreeName": "quick-build-fix-auth",
    "source": "git-common-dir",
    "sources": {
      "projectRoot": "git_common_dir",
      "kbRoot": "default",
      "workRoot": "default"
    }
  }
}
```

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `projectRoot` | string | Absolute path to the effective project root |
| `kbRoot` | string | Absolute path to the knowledge-base directory |
| `workRoot` | string | Absolute path to the work artifact directory |
| `isWorktree` | boolean | `true` if running in a linked git worktree |
| `worktreeName` | string | Branch name if in a worktree (optional) |
| `source` | string | How the project root was resolved: `env`, `git-common-dir`, or `cwd` |
| `sources` | object | Per-directory source metadata for `projectRoot`, `kbRoot`, and `workRoot` |

### Resolution Sources

| Source | Description |
|--------|-------------|
| `env` | Used `RP1_PROJECT_ROOT` or legacy `RP1_ROOT` input |
| `git-common-dir` | Resolved from git's common directory (worktree scenario) |
| `cwd` | Standard resolution from current working directory |

## Resolution Algorithm

The tool resolves directories using this priority:

1. `RP1_PROJECT_ROOT` environment variable
2. `RP1_ROOT` compatibility environment variable
3. Git worktree detection via `git rev-parse --git-common-dir`
4. Standard resolution from current working directory

When running in a linked worktree, the tool detects this by comparing `git rev-parse --git-dir` with `git rev-parse --git-common-dir`. If they differ, rp1 resolves directories from the main repository instead of the linked checkout.

## Examples

### Standard Repository

```bash
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/myproject",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/.rp1/Users-dev-myproject",
    "isWorktree": false,
    "source": "cwd"
  }
}
```

### Inside a Worktree

```bash
$ cd /Users/dev/worktrees/quick-build-fix-auth
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/myproject",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/.rp1/Users-dev-myproject",
    "isWorktree": true,
    "worktreeName": "quick-build-fix-auth",
    "source": "git-common-dir"
  }
}
```

### With Environment Override

```bash
$ export RP1_PROJECT_ROOT=/Users/dev/custom-project
$ export RP1_KB_ROOT=/Users/dev/shared-kb
$ export RP1_WORK_ROOT=/Users/dev/shared-work
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/custom-project",
    "kbRoot": "/Users/dev/shared-kb",
    "workRoot": "/Users/dev/shared-work",
    "isWorktree": false,
    "source": "env"
  }
}
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid settings | `.rp1/settings.toml` contains invalid directory configuration | Fix the settings file and rerun |
| Filesystem access failure | The process cannot read the candidate project path | Check permissions and rerun |

## Use Cases

- Linked worktree detection: resolve back to the main repository for stable KB/work access
- Custom directory overrides: inspect the effect of `RP1_PROJECT_ROOT`, `RP1_KB_ROOT`, and `RP1_WORK_ROOT`
- Compatibility debugging: verify legacy `RP1_ROOT` input without using it for new workflows

## Related

- [`build-fast`](../dev/build-fast.md) - Quick-iteration development workflow
