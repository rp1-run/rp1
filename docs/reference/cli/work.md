# work

Provides artifact registration and run cleanup for agent workflows.

!!! note "Internal Tool"
    This CLI tool is used internally by rp1 agents. It is not intended for direct use by users.

!!! note "Status Updates"
    Status updates have moved to `rp1 agent-tools emit`. See [emit](emit.md) for details.

---

## Synopsis

```bash
rp1 agent-tools work <subcommand> [options]
```

## Description

The `work` agent tool provides subcommands for artifact registration and cleanup of expired workflow runs. Status tracking is handled by the separate `emit` command.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `artifact` | Register an artifact for a feature/run |
| `cleanup` | Delete expired workflow runs |

---

## artifact

Registers an output file (report, design doc, task file) so the dashboard can display it.

### Synopsis

```bash
rp1 agent-tools work artifact --project <path> --feature <name> --run-id <id> --path <path> [options]
```

### Arguments

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project` | string | Yes | Absolute path to project root |
| `--feature` | string | Yes | Feature identifier (kebab-case) |
| `--run-id` | string | Yes | Workflow run ID |
| `--path` | string | Yes | Relative path to the artifact file |
| `--step` | string | No | Workflow step that produced the artifact |
| `--type` | string | No | Artifact type (auto-classified from extension if omitted) |
| `--subflow` | boolean | No | Mark as subflow diagram |

---

## cleanup

Deletes expired workflow runs from the status database.

### Synopsis

```bash
rp1 agent-tools work cleanup [options]
```

### Arguments

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--dry-run` | boolean | No | Report stale rows without deleting |
| `--older-than` | string | No | Only delete runs expired at least N hours ago (default: 0) |

---

## Database Storage

Workflow data is stored in `~/.rp1/rp1.db`. The database auto-creates on first write.

---

## Related

- [emit](emit.md) - Record workflow events (status changes, artifacts, annotations)
- [Status Dashboard](../web-ui/v2-dashboard.md) - Web UI for viewing workflow progress
