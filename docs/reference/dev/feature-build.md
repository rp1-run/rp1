# feature-build

Implements features systematically from task lists and design specifications.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:feature-build <feature-id> [milestone-id]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-build <feature-id> [milestone-id]
    ```

## Description

The `feature-build` command implements features from pre-defined task lists. It follows the design specification, runs verification for each task, updates task status, and documents implementation details.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `MILESTONE_ID` | `$2` | No | All | Specific milestone to build |

## Prerequisites

- `requirements.md` in `.rp1/work/features/<feature-id>/`
- `design.md` in `.rp1/work/features/<feature-id>/`
- `tasks.md` or `tasks/milestone-N.md` files

## Output

The command:

- Implements code according to design
- Updates task files with completion status
- Writes implementation summaries for each task
- Creates `field-notes.md` for discoveries
- Runs verification (tests, linting) after each task

## Examples

### Build Entire Feature

=== "Claude Code"

    ```bash
    /rp1-dev:feature-build user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-build user-auth
    ```

### Build Specific Milestone

=== "Claude Code"

    ```bash
    /rp1-dev:feature-build user-auth 2
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-build user-auth 2
    ```

## Task Workflow

For each task:

1. Read task description and acceptance criteria
2. Implement according to design specification
3. Run format/lint commands
4. Run tests
5. Update task file with implementation summary
6. Document any discoveries in field notes

## Field Notes

During implementation, the command documents:

- Design deviations (with justification)
- Codebase discoveries (undocumented patterns)
- User clarifications received
- Workarounds applied

These notes inform the verification phase.

## Related Commands

- [`feature-tasks`](feature-tasks.md) - Previous step: create tasks
- [`feature-verify`](feature-verify.md) - Next step: validate implementation

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow
