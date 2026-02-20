---
name: task-coordination
description: Platform-agnostic task coordination using Claude Code Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) for real-time workflow progress visibility. Silently skips on platforms without Task tools. Trigger terms - task progress, workflow visibility, task coordination, progress tracking, step tracking, phase tracking, task create, task update.
---

# Task Coordination Skill

Platform-agnostic task coordination for real-time workflow progress visibility in Claude Code's native task UI. On platforms without Task tools (OpenCode), all operations silently skip.

## What This Skill Does

- Creates and updates tasks in Claude Code's native task UI for structured workflow progress
- Provides feature detection to determine Task tool availability at runtime
- Falls back to silent no-op on platforms without Task tools (zero errors, zero output)
- Coexists with `work-status` skill -- both fire at step/phase boundaries without interference

## When to Use

Activate this skill when:

- Running multi-step orchestrator workflows (build, pr-review, knowledge-build)
- Spawning parallel sub-agents that need to report completion/failure
- Coordinating review units with dependency-based synthesis triggering

**Trigger phrases**: "task progress", "workflow visibility", "track steps", "coordinate tasks", "progress tracking"

## Feature Detection

Task tool availability is detected on the **first** `createWorkflowTask` call. No separate probe needed.

### Procedure

1. On first `createWorkflowTask`, attempt `TaskCreate` with the real task parameters
2. If the call **succeeds**: set `TASK_TOOLS_AVAILABLE = true`, store the returned task ID
3. If the call **fails** (tool not found, permission error, any error): set `TASK_TOOLS_AVAILABLE = false`
4. All subsequent operations check this flag; if `false`, silently skip

**Performance**: Detection adds negligible overhead (<2s) relative to workflow duration (5-15 min).

**Note**: Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) are auto-approved internal tools in Claude Code. No `allowed-tools` frontmatter or permission configuration is needed.

## Operations Reference

### createWorkflowTask

Creates a task in Claude Code's task UI.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| subject | string | Yes | Concise, human-readable task label (e.g., "Step 1/6: Requirements") |
| description | string | Yes | Brief description of what this task does |
| blockedBy | string[] | No | Task IDs this task depends on (for dependency-based triggering) |
| metadata | object | No | Structured context (summary-level only, no sensitive data) |

**Maps to**: `TaskCreate`

```
TaskCreate(
  subject: "{subject}",
  description: "{description}",
  blockedBy: [{blockedBy}],   # omit if not provided
  metadata: {metadata}        # omit if not provided
)
```

**Returns**: task_id (string) on success, null if unavailable.

**First call behavior**: If this is the first `createWorkflowTask` call in the workflow, it doubles as the feature detection probe. On failure, sets `TASK_TOOLS_AVAILABLE = false` and returns null.

### updateTaskProgress

Updates an existing task's status and activity text.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | Task ID from createWorkflowTask |
| status | enum | Yes | `pending`, `in_progress`, `completed`, `failed` |
| activeForm | string | No | Spinner/activity text shown in UI (e.g., "Gathering requirements") |
| metadata | object | No | Structured context (summary-level only, no sensitive data) |

**Maps to**: `TaskUpdate`

```
TaskUpdate(
  taskId: "{taskId}",
  status: "{status}",
  activeForm: "{activeForm}",  # omit if not provided
  metadata: {metadata}         # omit if not provided
)
```

**No-op if**: taskId is null (from failed/unavailable createWorkflowTask).

### listTasks

Lists all tasks in the current session.

**Maps to**: `TaskList`

```
TaskList()
```

**Returns**: Array of tasks with IDs, subjects, statuses, and metadata. Empty array if unavailable.

### getTask

Retrieves a single task by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | Task ID to retrieve |

**Maps to**: `TaskGet`

```
TaskGet(taskId: "{taskId}")
```

**Returns**: Task object with ID, subject, status, metadata. Null if unavailable.

## No-Op Guard Pattern

When `TASK_TOOLS_AVAILABLE = false`, all operations silently skip:

| Operation | No-Op Behavior |
|-----------|----------------|
| createWorkflowTask | Return null (no task_id) |
| updateTaskProgress | Skip (task_id will be null) |
| listTasks | Return empty array (treat as no tasks) |
| getTask | Return null |

**Rules**:
- Produce zero errors, zero output on no-op path
- Do not log, warn, or notify about unavailability
- Workflow logic must handle null task IDs gracefully (always check before updateTaskProgress)

## Usage Patterns

### Build Command (6 Steps)

| Step | Subject | ActiveForm |
|------|---------|------------|
| 1 | "Step 1/6: Requirements" | "Gathering requirements for {FEATURE_ID}" |
| 2 | "Step 2/6: Design" | "Creating technical design" |
| 3 | "Step 3/6: Tasks" | "Generating implementation tasks" |
| 4 | "Step 4/6: Build" | "Implementing tasks" |
| 5 | "Step 5/6: Verify" | "Running verification checks" |
| 6 | "Step 6/6: Archive" | "Archiving feature" |

**Pattern for each step**:

```
# Before step execution
step_task_id = createWorkflowTask(
  subject: "Step {N}/6: {StepName}",
  description: "Execute {step_name} phase of build workflow"
)

# At step start
updateTaskProgress(step_task_id, "in_progress", activeForm: "{ActiveForm text}")

# On success
updateTaskProgress(step_task_id, "completed")

# On failure
updateTaskProgress(step_task_id, "failed")
```

### PR Review Command (4 Phases)

| Phase | Subject | ActiveForm |
|-------|---------|------------|
| P1 | "PR Review: Splitting" | "Segmenting diff into review units" |
| P2 | "PR Review: Detailed Analysis" | "Analyzing {N} review units" |
| P3 | "PR Review: Synthesis" | "Synthesizing cross-file findings" |
| P4 | "PR Review: Reporting" | "Generating review report" |

Same per-phase pattern as build steps above.

### Knowledge-Build Command (5 Tasks)

| Phase | Subject | ActiveForm |
|-------|---------|------------|
| 1 | "KB: Spatial Analysis" | "Categorizing repository files" |
| 2a | "KB: Concept Extraction" | "Extracting domain concepts" |
| 2b | "KB: Architecture Mapping" | "Mapping system architecture" |
| 2c | "KB: Module Analysis" | "Analyzing module structure" |
| 2d | "KB: Pattern Extraction" | "Extracting implementation patterns" |

Phase 2 tasks are created **after** Phase 1 completes (they depend on spatial analysis output). All 4 Phase 2 tasks are created together before spawning parallel agents.

### PR Review Per-Unit Tracking

When `TASK_TOOLS_AVAILABLE = true`, PR review can track individual review units:

```
# After splitter produces units
For each unit in units:
  unit_task_id = createWorkflowTask(
    subject: "Review: {unit.path}",
    description: "Analyze review unit {unit.id}",
    metadata: { unit_id: unit.id, path: unit.path, type: unit.type }
  )
  Store: unit.task_id = unit_task_id

# Create synthesis task with dependencies
synth_task_id = createWorkflowTask(
  subject: "PR Review: Synthesis",
  description: "Synthesize cross-file findings",
  blockedBy: [all unit_task_ids]
)

# After all sub-reviewers complete, check for failures
tasks = listTasks()
failed_units = tasks where status == "failed" AND metadata has unit_id

# Retry failed units (max 1 retry each)
For each failed_unit:
  updateTaskProgress(failed_unit.id, "pending")
  Spawn replacement sub-reviewer with same unit data + TASK_ID
```

When `TASK_TOOLS_AVAILABLE = false`, skip the entire per-unit tracking path. Use current threshold-based failure handling.

## Agent Integration Guidelines

### Sub-Agent Task Reporting

Sub-agents (e.g., pr-sub-reviewer) can call `TaskUpdate` directly when given a `TASK_ID` parameter. Sub-agents spawned via the Task tool inherit task management tool access from the parent command.

**Pattern for sub-agents**:

1. Accept optional `TASK_ID` parameter (default: none)
2. If `TASK_ID` is provided:
   - Before analysis: `TaskUpdate(TASK_ID, "in_progress")`
   - On success: `TaskUpdate(TASK_ID, "completed", metadata: { unit_id, findings_count })`
   - On error: `TaskUpdate(TASK_ID, "failed", metadata: { error })`
3. If `TASK_ID` is not provided: skip all TaskUpdate calls (backward compatible)

**Sub-agents do NOT need feature detection** -- the orchestrating command already determined availability and only passes `TASK_ID` when Task tools are available.

### Coexistence with work-status

Both skills fire at step/phase boundaries. Neither blocks the other.

| Skill | Purpose | Transport |
|-------|---------|-----------|
| work-status | Status Dashboard visibility | rp1 agent-tools CLI -> SQLite |
| task-coordination | Claude Code native task UI | TaskCreate/TaskUpdate tools |

Report both at the same boundaries. Order does not matter.

## Security

- **No sensitive data** in task metadata: no API keys, credentials, file contents, or full diff content (NFR-010)
- PR review findings in metadata must contain **summary-level info only**: findings count, file paths, severity -- not code snippets (NFR-011)
- Task subjects and activeForm text use **plain language descriptions** of workflow activity (NFR-020, NFR-021)

## Quick Reference

```
# Create a task (first call = feature detection)
task_id = createWorkflowTask(subject: "...", description: "...")

# Update progress
updateTaskProgress(task_id, "in_progress", activeForm: "Doing the thing...")

# Mark complete
updateTaskProgress(task_id, "completed")

# Mark failed
updateTaskProgress(task_id, "failed")

# List all tasks (for failure detection and retry)
tasks = listTasks()

# Get single task
task = getTask(task_id)
```
