# Agent Tools

The `rp1 agent-tools` namespace provides commands used by AI agents during
workflow execution. These are not typically invoked by users directly.

---

## rp1-root-dir

Discover project directory paths at runtime.

```bash
rp1 agent-tools rp1-root-dir
```

Returns a JSON object with the resolved directory paths for the current project:

| Field | Description |
|-------|-------------|
| `projectRoot` | The project root (directory containing `.rp1/project_id`) |
| `kbRoot` | The knowledge base directory. Respects the active storage mode configuration; defaults to `<projectRoot>/.rp1/context` when no storage mode override is set. |
| `workRoot` | The work artifacts directory. Respects the active storage mode configuration; defaults to `<projectRoot>/.rp1/work` when no storage mode override is set. |
| `codeRoot` | The directory for source-code reads and writes. Equals the worktree filesystem path in git worktree contexts; equals `projectRoot` otherwise. |

### Storage mode awareness

The `kbRoot` and `workRoot` paths returned by this command reflect the active
storage mode. Do not assume these paths are always subdirectories of
`projectRoot` -- when a non-default storage mode is configured, they may resolve
to locations outside the project repository tree.

Skills and agents should use the returned values as-is rather than constructing
paths from `projectRoot` manually. In agent prompts, reference these directories
via `{KB_ROOT}` and `{WORK_ROOT}` argument variables to ensure correct resolution
regardless of storage mode.

### Worktree behavior

In git worktree contexts, `codeRoot` points to the worktree where the user
invoked the command, while `projectRoot`, `kbRoot`, and `workRoot` continue to
resolve against the canonical main repository (where `.rp1/` lives).
Code-writing agents use `codeRoot` for all source-file operations so that edits
land in the correct working tree.

### Example output

```json
{
  "projectRoot": "/home/user/my-project",
  "kbRoot": "/home/user/my-project/.rp1/context",
  "workRoot": "/home/user/my-project/.rp1/work",
  "codeRoot": "/home/user/my-project"
}
```

---

## Other agent tools

| Command | Description |
|---------|-------------|
| `emit` | Persist workflow events (status changes, artifacts, annotations) |
| `resolve-args` | Resolve skill arguments from user input and environment |
| `workflow-bootstrap` | Generate deterministic workflow bootstrap commands |
| `feedback` | Submit structured feedback for workflow runs |
| `ci-results` | Query CI build results for a workflow run |

---

## See Also

- [CLI Reference](index.md) - User-facing CLI commands
- [Skill Format](../../concepts/skill-format.md) - How skills declare arguments and resolve directories
