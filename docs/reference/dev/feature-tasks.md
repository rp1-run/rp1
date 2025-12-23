# feature-tasks

Breaks down technical design into actionable implementation tasks.

---

!!! note "Optional Command"
    Tasks are now **automatically generated** when you run [`/feature-design`](feature-design.md).
    Use this command only when you need to regenerate tasks or make incremental updates.

## When to Use

| Use Case | Description |
|----------|-------------|
| **Regenerate tasks** | Design changed significantly; regenerate the entire task breakdown |
| **Incremental updates** | Add tasks for new requirements without regenerating everything |
| **Mid-feature changes** | Update task structure after using [`/feature-edit`](feature-edit.md) |

## Synopsis

=== "Claude Code"

    ```bash
    /feature-tasks <feature-id> [extra-context]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-tasks <feature-id> [extra-context]
    ```

## Description

The `feature-tasks` command transforms a technical design into actionable tasks with milestones. It analyzes the design document and creates a structured task breakdown with acceptance criteria for each task.

Since [`/feature-design`](feature-design.md) now auto-generates `tasks.md`, this command is primarily used for:

- **Regeneration**: When design changes require a fresh task breakdown
- **Incremental updates**: When adding requirements to an existing feature
- **Manual control**: When you want to customize task generation parameters

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `EXTRA_CONTEXT` | `$2` | No | `""` | Additional context |

## Prerequisites

- `design.md` must exist in `.rp1/work/features/<feature-id>/`

## Output

| File | Contents |
|------|----------|
| `tasks.md` | Single task list (for simple features) |
| `tracker.md` | Feature tracker with milestone links |
| `tasks/milestone-N.md` | Milestone-specific task lists |

**Location:** `.rp1/work/features/<feature-id>/`

## Task Structure

Each task includes:

- Clear description
- Acceptance criteria
- Effort estimate
- Dependencies
- Reference to design section

## Examples

### Generate Tasks

=== "Claude Code"

    ```bash
    /feature-tasks user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-tasks user-auth
    ```

**Example output:**
```
✅ Task breakdown complete

Feature: user-auth
Milestones: 3
Total Tasks: 12

Milestone 1: Authentication Core (5 tasks)
Milestone 2: Session Management (4 tasks)
Milestone 3: Integration & Testing (3 tasks)

Output: .rp1/work/features/user-auth/tracker.md
```

## Related Commands

- [`feature-design`](feature-design.md) - Previous step
- [`feature-build`](feature-build.md) - Next step: implementation

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow
