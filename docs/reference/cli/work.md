# work

Records agent workflow status updates to a global SQLite database for real-time progress tracking.

!!! note "Internal Tool"
    This CLI tool is used internally by rp1 agents. It is not intended for direct use by users.

---

## Synopsis

```bash
rp1 agent-tools work <subcommand> [options]
```

## Description

The `work` agent tool provides subcommands for recording and tracking agent workflow progress. Status updates are stored in a global SQLite database (`~/.rp1/status.db`) and can be viewed in the web UI's Status Dashboard.

This enables real-time visibility into what agents are working on across all projects.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| [`update`](#update) | Record a status update for a feature/task |

---

## update

Records a workflow status update to the database.

### Synopsis

```bash
rp1 agent-tools work update --project <path> --feature <name> --status <status> [options]
```

### Arguments

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project` | string | Yes | Absolute path to project root |
| `--feature` | string | Yes | Feature identifier (kebab-case, pattern: `^[a-z0-9-]+$`) |
| `--status` | enum | Yes | One of: `started`, `in_progress`, `completed`, `failed` |
| `--step` | string | No | Workflow step identifier within the feature |
| `--message` | string | No | Human-readable status message |
| `--metadata` | string | No | JSON string for additional context |

### Status Values

| Status | Description |
|--------|-------------|
| `started` | Feature work has begun |
| `in_progress` | Work is actively being performed |
| `completed` | Work finished successfully |
| `failed` | Work encountered an error |

### Output

Returns a ToolResult JSON envelope:

```json
{
  "success": true,
  "tool": "work",
  "data": {
    "id": 42,
    "projectPath": "/Users/dev/myapp",
    "feature": "auth-refactor",
    "step": "requirements",
    "status": "in_progress",
    "message": "Gathering requirements from PRD",
    "createdAt": "2026-01-11T10:30:00Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Auto-generated database row ID |
| `projectPath` | Project path that was recorded |
| `feature` | Feature identifier |
| `step` | Step identifier (null if not specified) |
| `status` | Recorded status |
| `message` | Status message (null if not specified) |
| `createdAt` | ISO 8601 UTC timestamp when record was created |

### Validation Rules

| Rule | Requirement |
|------|-------------|
| Project path | Must be absolute (e.g., `/Users/dev/project`) |
| Feature name | Must match `^[a-z0-9-]+$` (lowercase alphanumeric with hyphens) |
| Status | Must be one of the four valid status values |
| Metadata | Must be valid JSON if provided |

### Example

```bash
# Record feature started
$ rp1 agent-tools work update \
    --project /Users/dev/myapp \
    --feature auth-refactor \
    --status started \
    --message "Starting feature implementation"

# Record step in progress
$ rp1 agent-tools work update \
    --project /Users/dev/myapp \
    --feature auth-refactor \
    --step requirements \
    --status in_progress \
    --message "Gathering requirements from PRD"

# Record completion with metadata
$ rp1 agent-tools work update \
    --project /Users/dev/myapp \
    --feature auth-refactor \
    --status completed \
    --message "Feature implemented successfully" \
    --metadata '{"commits": 5, "files_changed": 12}'
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Project path is required | Missing `--project` flag | Provide absolute project path |
| Project path must be absolute | Relative path provided | Use absolute path (e.g., `/Users/dev/project`) |
| Feature name is required | Missing `--feature` flag | Provide kebab-case feature name |
| Feature name must match pattern | Invalid feature name format | Use lowercase alphanumeric with hyphens only |
| Invalid status | Unknown status value | Use one of: started, in_progress, completed, failed |
| Metadata must be valid JSON | Malformed JSON string | Ensure metadata is valid JSON |

---

## Database Storage

Status updates are stored in `~/.rp1/status.db`:

- Database auto-creates on first write
- Append-only design (each update creates a new record)
- Indexed by project path and timestamp for fast queries
- Records retained for dashboard history and debugging

---

## Use Cases

### Agent Workflow Tracking

The primary use case is enabling agents to report their progress:

1. Agent starts feature work: records `started` status
2. Agent begins step: records `in_progress` with step identifier
3. Agent completes or fails: records final status

### Dashboard Integration

Status updates appear in the web UI Status Dashboard (`/project/:id/status`), providing real-time visibility into agent activity.

---

## Related

- [Status Dashboard](../web-ui.md) - Web UI for viewing status updates
- [`worktree`](worktree.md) - Git worktree management for isolated agent execution
