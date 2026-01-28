---
name: work-status
description: Report workflow progress using rp1 agent-tools work update command. Use when implementing features, tasks, or multi-step workflows that benefit from status visibility. Enables real-time progress tracking in the Status Dashboard. Trigger terms - status update, progress report, workflow tracking, feature status, task progress, work status, dashboard visibility.
---

# Work Status Updates Skill

Report agent workflow progress for real-time visibility in the Status Dashboard.

## What This Skill Does

- Records status updates to global database (`~/.rp1/status.db`)
- Enables real-time progress tracking via Status Dashboard
- Notifies daemon for immediate WebSocket broadcast (best-effort)
- Provides audit trail of workflow execution

## When to Use

Activate this skill when:

- Starting a feature implementation
- Transitioning between tasks within a feature
- Completing or failing a workflow step
- Running multi-step workflows that benefit from visibility

**Trigger phrases**: "report status", "report progress", "update status", "track workflow", "feature started", "task complete"

## Command Reference

```bash
rp1 agent-tools work update [options]
```

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `--project`, `-p` | path | Absolute path to project root |
| `--feature`, `-f` | string | Feature identifier (kebab-case) |
| `--status`, `-s` | enum | Status state |

### Optional Options

| Option | Type | Description |
|--------|------|-------------|
| `--task`, `-t` | string | Task identifier within feature |
| `--message`, `-m` | string | Human-readable status message |
| `--metadata` | json | JSON string for additional context |

### Status Values

| Status | When to Use |
|--------|-------------|
| `started` | Beginning work on feature/task |
| `in_progress` | Actively working, mid-execution |
| `waiting-input` | Agent waiting for user response (clarification, approval, decision) |
| `needs-review` | Work complete, awaiting human review before proceeding |
| `completed` | Successfully finished |
| `failed` | Encountered error, cannot continue |

## Validation Rules

1. **Project path**: MUST be absolute. Should be usually present in the context while working on tasks.
2. **Feature name**: MUST match `^[a-z0-9-]+$` (lowercase alphanumeric with hyphens)
3. **Status**: MUST be one of: `started`, `in_progress`, `waiting-input`, `needs-review`, `completed`, `failed`
4. **Metadata**: MUST be valid JSON if provided

## Usage Patterns

### Feature Lifecycle

Report at key milestones through a feature's lifecycle:

```bash
# 1. Feature started
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --status started \
  --message "Beginning feature implementation"

# 2. Task in progress
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task requirements \
  --status in_progress \
  --message "Gathering requirements"

# 3. Task completed
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task requirements \
  --status completed \
  --message "Requirements documented"

# 4. Feature completed
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --status completed \
  --message "Feature implemented successfully"
```

### Error Handling

Report failures with context:

```bash
# Report failure with message
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --status failed \
  --message "Build failed: missing dependency"

# Report failure with metadata for debugging
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task build \
  --status failed \
  --message "Test suite failed" \
  --metadata '{"exitCode":1,"failedTests":["test_auth","test_login"]}'
```

### Waiting for User Input

Use `waiting-input` when the agent needs user response to proceed:

```bash
# Waiting for clarification
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task requirements \
  --status waiting-input \
  --message "Need clarification: should auth support OAuth or just JWT?"

# Waiting for approval
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task design \
  --status waiting-input \
  --message "Design ready for approval - awaiting user confirmation"

# Waiting for decision
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --status waiting-input \
  --message "Multiple implementation options available - need user decision" \
  --metadata '{"options":["approach-a","approach-b"],"question":"Which approach?"}'
```

### Needs Review

Use `needs-review` when work is complete but requires human review:

```bash
# Code ready for review
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task implementation \
  --status needs-review \
  --message "Implementation complete - ready for code review"

# PR created, awaiting review
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --status needs-review \
  --message "PR #42 created - awaiting review" \
  --metadata '{"prNumber":42,"prUrl":"https://github.com/org/repo/pull/42"}'

# Tests passing, needs QA sign-off
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --task verification \
  --status needs-review \
  --message "All tests passing - needs QA review before merge"
```

### With Metadata

Include structured context for dashboard/tooling:

```bash
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature auth-refactor \
  --task T1 \
  --status in_progress \
  --message "Implementing JWT validation" \
  --metadata '{"step":"implementation","progress":75,"filesChanged":3}'
```

## Output Format

Returns JSON ToolResult envelope:

```json
{
  "success": true,
  "tool": "work",
  "data": {
    "id": 42,
    "projectPath": "/Users/dev/myapp",
    "feature": "auth-refactor",
    "task": "T1",
    "status": "in_progress",
    "message": "Implementing JWT validation",
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
}
```

## Agent Integration Guidelines

### 1. Report at Key Milestones

DO report:

- Start of feature
- Task transitions (started, in_progress, completed)
- Completion or failure of feature

DO NOT report:

- Every minor step (too noisy)
- Redundant in_progress updates without state change

### 2. Use Meaningful Messages

Messages should provide context about current activity:

```bash
# Good - describes what's happening
--message "Running test suite for auth module"

# Bad - too vague
--message "Working"
```

### 3. Include Task Identifiers

When working on specific tasks within a feature, always include `--task`:

```bash
# With task - enables granular tracking
--feature my-feature --task T1-requirements

# Without task - feature-level only
--feature my-feature
```

### 4. Project Path Best Practices

Always use absolute paths. In bash, use `$(pwd)` for current directory:

```bash
# Correct - resolves to absolute path
--project "$(pwd)"

# Correct - explicit absolute path
--project "/Users/dev/myapp"

# Wrong - relative path will fail validation
--project "."
--project "./myapp"
```

### 5. Feature Naming Convention

Use kebab-case matching the feature ID:

```bash
# Correct
--feature auth-refactor
--feature add-user-login
--feature fix-memory-leak

# Wrong - will fail validation
--feature AuthRefactor
--feature add_user_login
--feature "add user login"
```

## Workflow Integration Example

Integrate status updates into agent workflows:

```markdown
## Phase 1: Setup

1. Report feature started:
   ```bash
   rp1 agent-tools work update \
     --project "$(pwd)" \
     --feature {feature_id} \
     --status started \
     --message "Beginning {feature_id} implementation"
   ```

## Phase 2: Implementation

1. For each task in the feature:

   ```bash
   # Report task start
   rp1 agent-tools work update \
     --project "$(pwd)" \
     --feature {feature_id} \
     --task {task_id} \
     --status in_progress \
     --message "Working on {task_description}"

   # ... do the work ...

   # Report task completion
   rp1 agent-tools work update \
     --project "$(pwd)" \
     --feature {feature_id} \
     --task {task_id} \
     --status completed \
     --message "{task_id} completed successfully"
   ```

## Phase 3: Finalization

1. Report feature outcome:

   ```bash
   # On success
   rp1 agent-tools work update \
     --project "$(pwd)" \
     --feature {feature_id} \
     --status completed \
     --message "Feature implemented and verified"

   # On failure
   rp1 agent-tools work update \
     --project "$(pwd)" \
     --feature {feature_id} \
     --status failed \
     --message "Failed: {error_description}"
   ```

```

## Error Handling

### Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Project path must be absolute" | Relative path provided | Use `$(pwd)` or full path |
| "Feature name must match pattern" | Invalid characters | Use lowercase alphanumeric with hyphens |
| "Invalid status" | Unknown status value | Use: started, in_progress, waiting-input, needs-review, completed, failed |
| "Metadata must be valid JSON" | Malformed JSON string | Validate JSON syntax |

### Example Error Response

```json
{
  "success": false,
  "tool": "work",
  "data": null,
  "errors": [
    { "message": "Project path must be absolute. Received: ." }
  ]
}
```

## Quick Reference

```bash
# Minimal - feature start
rp1 agent-tools work update -p "$(pwd)" -f my-feature -s started

# With task
rp1 agent-tools work update -p "$(pwd)" -f my-feature -t T1 -s in_progress -m "Working on task"

# Waiting for user input
rp1 agent-tools work update -p "$(pwd)" -f my-feature -s waiting-input -m "Need user decision"

# Ready for review
rp1 agent-tools work update -p "$(pwd)" -f my-feature -s needs-review -m "PR ready for review"

# With metadata
rp1 agent-tools work update -p "$(pwd)" -f my-feature -s completed -m "Done" --metadata '{"files":5}'
```

## Success Criteria

A status update is successful when:

1. Command returns `success: true`
2. Response includes generated `id` and `createdAt`
3. Status appears in dashboard (if daemon running)
