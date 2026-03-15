---
name: task
description: Discover and manage queued tasks for agent execution
allowed-tools: Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - core
    - automation
    - task-queue
  created: 2026-03-15
  author: cloud-on-prem/rp1
  argument-hint: "<operation> [options]"
---

# Task Queue Management

Interact with the rp1 persistent task queue. Tasks are stored in `~/.rp1/status.db` and processed in FIFO order (oldest first). The task system is a queue and state tracker -- execution is the responsibility of the agent or harness hook that picks up the task.

## Task Lifecycle

Tasks move through these states:

```
pending -> in_progress -> completed
                       -> failed
pending -> cancelled
in_progress -> cancelled
```

- New tasks start as `pending`.
- `pickup` atomically transitions the oldest pending task to `in_progress`.
- Only `in_progress` tasks can be completed or failed.
- Only `pending` and `in_progress` tasks can be cancelled.

## Operations

### Create a Task

Queue a new task for later execution.

```bash
rp1 agent-tools task create \
  --type <type> \
  --description <text> \
  [--payload <json>] \
  [--project <path>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--type` | Yes | Free-form task type (e.g., `check-annotations`, `archive-feature`, `remediate-audit`) |
| `--description` | Yes | Human-readable description of the work |
| `--payload` | No | JSON string with type-specific data |
| `--project` | No | Absolute project path for scoping (omit for global tasks) |

Example:

```bash
rp1 agent-tools task create \
  --type "check-annotations" \
  --description "Review open annotations from last audit" \
  --project /Users/dev/myapp
```

Example with payload:

```bash
rp1 agent-tools task create \
  --type "remediate-audit-findings" \
  --description "Fix security issues found in auth module" \
  --payload '{"files":["src/auth.ts","src/session.ts"],"severity":"high"}'
```

### List Tasks

View tasks filtered by status and/or project.

```bash
rp1 agent-tools task list \
  [--status <status>] \
  [--project <path>] \
  [--limit <n>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--status` | No | Filter by status: `pending`, `in_progress`, `completed`, `failed`, `cancelled` |
| `--project` | No | Filter by absolute project path |
| `--limit` | No | Maximum number of tasks to return |

Example -- list pending tasks for a project:

```bash
rp1 agent-tools task list --status pending --project /Users/dev/myapp
```

Results are always ordered by creation time (oldest first).

### Pick Up Next Task

Atomically claim the oldest pending task for execution.

```bash
rp1 agent-tools task pickup [--project <path>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--project` | No | Only pick up tasks scoped to this project path |

The returned task is automatically transitioned to `in_progress`. If no pending tasks exist, the response data is `null` (not an error).

Example:

```bash
rp1 agent-tools task pickup --project /Users/dev/myapp
```

### Complete a Task

Mark an in-progress task as successfully completed.

```bash
rp1 agent-tools task complete --id <id> [--result <text>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--id` | Yes | Task ID (positive integer) |
| `--result` | No | Summary of what was accomplished |

Example:

```bash
rp1 agent-tools task complete --id 42 --result "Reviewed 3 annotations, all resolved"
```

### Fail a Task

Mark an in-progress task as failed.

```bash
rp1 agent-tools task fail --id <id> [--result <text>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--id` | Yes | Task ID (positive integer) |
| `--result` | No | Error description explaining the failure |

Example:

```bash
rp1 agent-tools task fail --id 42 --result "Could not access auth module: file not found"
```

### Cancel a Task

Cancel a pending or in-progress task.

```bash
rp1 agent-tools task cancel --id <id>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--id` | Yes | Task ID (positive integer) |

Only tasks in `pending` or `in_progress` state can be cancelled. Completed and failed tasks cannot be cancelled.

Example:

```bash
rp1 agent-tools task cancel --id 42
```

### Get a Task

Retrieve a single task by ID.

```bash
rp1 agent-tools task get --id <id>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--id` | Yes | Task ID (positive integer) |

Example:

```bash
rp1 agent-tools task get --id 42
```

## Response Format

All commands return a ToolResult JSON envelope:

```json
{
  "success": true,
  "tool": "task",
  "data": {
    "id": 1,
    "type": "check-annotations",
    "description": "Review open annotations from last audit",
    "status": "pending",
    "payload": null,
    "projectPath": "/Users/dev/myapp",
    "result": null,
    "createdAt": "2026-03-15T10:30:00.000Z",
    "updatedAt": "2026-03-15T10:30:00.000Z"
  }
}
```

On error:

```json
{
  "success": false,
  "tool": "task",
  "data": null,
  "errors": [{ "message": "Task 99 not found" }]
}
```

For `list`, `data` is an array of task records. For `pickup` with no pending tasks, `data` is `null` with `success: true`.

## Task Processing Loop

Recommended pattern for harness hooks that process queued tasks:

```bash
# 1. Pick up the next pending task
RESULT=$(rp1 agent-tools task pickup --project "$PROJECT_PATH")

# 2. Check if a task was returned
TASK_ID=$(echo "$RESULT" | jq -r '.data.id // empty')
if [ -z "$TASK_ID" ]; then
  echo "No pending tasks"
  exit 0
fi

# 3. Read task details
TASK_TYPE=$(echo "$RESULT" | jq -r '.data.type')
TASK_DESC=$(echo "$RESULT" | jq -r '.data.description')
TASK_PAYLOAD=$(echo "$RESULT" | jq -r '.data.payload // empty')

# 4. Execute based on task type and report outcome
#    (agent determines action from type + description + payload)
#    On success:
rp1 agent-tools task complete --id "$TASK_ID" --result "Done: processed successfully"
#    On failure:
rp1 agent-tools task fail --id "$TASK_ID" --result "Error: <description>"
```

## Validation Rules

- `--type` and `--description` must be non-empty strings
- `--project` must be an absolute path (starts with `/`) when provided
- `--payload` must be valid JSON when provided
- `--status` must be one of: `pending`, `in_progress`, `completed`, `failed`, `cancelled`
- `--id` must be a positive integer