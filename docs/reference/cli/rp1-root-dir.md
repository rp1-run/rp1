# rp1-root-dir

Resolves the effective project, knowledge-base, and work directories with read-only git worktree detection.

---

## Synopsis

```bash
rp1 agent-tools rp1-root-dir
```

## Description

The `rp1-root-dir` agent tool resolves the effective directory set for the current project:

- `projectRoot` - the canonical project root (directory containing `.rp1/project_id`)
- `projectId` - the stable UUID from `.rp1/project_id`
- `kbRoot` - the knowledge-base directory (always `<projectRoot>/.rp1/context`)
- `workRoot` - the work artifact directory (always `<projectRoot>/.rp1/work`)

All paths are deterministic from the project root. There are no environment variable overrides or settings-based customization.

When the agent is running inside a linked git worktree, the tool maps back to the main repository so directory resolution stays stable. This tool performs read-only detection only; rp1 does not create or manage git worktrees.

## Output

Returns JSON with the resolved directories and context information:

```json
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/myproject",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/myproject/.rp1/work",
    "isWorktree": false
  }
}
```

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `projectRoot` | string | Absolute path to the effective project root |
| `projectId` | string \| null | UUID from `.rp1/project_id`, or `null` if the file is missing (pre-migration project) |
| `kbRoot` | string | Absolute path to the knowledge-base directory (`<projectRoot>/.rp1/context`) |
| `workRoot` | string | Absolute path to the work artifact directory (`<projectRoot>/.rp1/work`) |
| `isWorktree` | boolean | `true` if running in a linked git worktree |
| `worktreeName` | string | Branch name if in a worktree (optional) |

## Resolution Algorithm

The tool resolves directories using this process:

1. Walk up from the current directory looking for `.rp1/project_id`.
2. If not found but `.rp1/` exists, use that directory as project root (with `projectId: null` and a warning recommending `rp1 migrate`).
3. If neither is found, try git worktree detection via `git rev-parse --git-common-dir` to locate the main worktree's `.rp1/project_id`.
4. If no project is found, return an error recommending `rp1 init`.

Once the project root is determined, `kbRoot` and `workRoot` are always `<projectRoot>/.rp1/context` and `<projectRoot>/.rp1/work` respectively.

## Examples

### Standard Repository

```bash
$ rp1 agent-tools rp1-root-dir
{
  "success": true,
  "tool": "rp1-root-dir",
  "data": {
    "projectRoot": "/Users/dev/myproject",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/myproject/.rp1/work",
    "isWorktree": false
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
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "kbRoot": "/Users/dev/myproject/.rp1/context",
    "workRoot": "/Users/dev/myproject/.rp1/work",
    "isWorktree": true,
    "worktreeName": "quick-build-fix-auth"
  }
}
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No project found | No `.rp1/project_id` or `.rp1/` directory in any ancestor | Run `rp1 init` to initialize a project |
| Filesystem access failure | The process cannot read the candidate project path | Check permissions and rerun |

## Use Cases

- Linked worktree detection: resolve back to the main repository for stable KB/work access
- Path discovery: determine the project root and derive all paths from it
- Pre-migration check: inspect whether `projectId` is `null` (needs `rp1 migrate`)

## Related

- [`rp1 migrate`](rp1-migrate.md) - Migrate an existing project to the new directory model
- [`build-fast`](../dev/build-fast.md) - Quick-iteration development workflow
