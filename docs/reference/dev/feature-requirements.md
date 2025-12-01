# feature-requirements

Interactive requirements collection that transforms high-level requirements into detailed specifications.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:feature-requirements <feature-id> [extra-context]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-requirements <feature-id> [extra-context]
    ```

## Description

The `feature-requirements` command guides you through defining detailed requirements for a feature. It uses structured clarification questions to resolve ambiguities and produces a comprehensive requirements specification.

**Important**: This command focuses on WHAT to build, not HOW. Technical implementation details are deferred to the design phase.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Unique identifier for the feature |
| `EXTRA_CONTEXT` | `$2` | No | `""` | Additional context or initial requirements |

## Output

**Location:** `.rp1/work/features/<feature-id>/requirements.md`

**Contents:**

- Feature overview
- Business context and success metrics
- Stakeholders and user types
- Scope definition (in/out)
- Functional requirements (REQ-xxx format)
- Non-functional requirements
- User stories (STORY-xxx format)
- Business rules
- Dependencies and constraints

## Examples

### Basic Usage

=== "Claude Code"

    ```bash
    /rp1-dev:feature-requirements user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-requirements user-auth
    ```

### With Initial Context

=== "Claude Code"

    ```bash
    /rp1-dev:feature-requirements dark-mode "Add dark mode toggle to settings page"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-requirements dark-mode "Add dark mode toggle to settings page"
    ```

## Workflow

The command:

1. Checks for existing charter/PRDs and offers to associate the feature
2. Analyzes your initial requirements for ambiguities
3. Asks clarifying questions (WHO, WHAT, CONSTRAINTS, SCOPE)
4. Generates a structured requirements document
5. Creates acceptance criteria for each requirement

## PRD Integration

If project charter and PRDs exist (from `blueprint`), the command:

- Offers to associate the feature with a PRD
- Inherits scope context from the parent PRD
- Links back to project-level documentation

## Related Commands

- [`blueprint`](blueprint.md) - Create project charter and PRDs first
- [`feature-design`](feature-design.md) - Next step: technical design

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow
