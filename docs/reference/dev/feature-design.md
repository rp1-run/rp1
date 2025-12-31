# feature-design

Generates technical design specifications from requirements, then automatically creates tasks.

---

!!! info "Automatic Task Generation"
    Running `feature-design` now automatically generates `tasks.md` along with the design.
    The separate [`/feature-tasks`](feature-tasks.md) command is optional and only needed
    for regenerating tasks or making incremental updates.

## Synopsis

=== "Claude Code"

    ```bash
    /feature-design <feature-id> [extra-context]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-design <feature-id> [extra-context]
    ```

## Description

The `feature-design` command transforms requirements into a technical design specification. It analyzes your requirements document, considers your codebase architecture (via KB), and produces detailed design documentation with architecture diagrams.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |
| `EXTRA_CONTEXT` | `$2` | No | `""` | Additional design context |

## Prerequisites

- `requirements.md` must exist in `.rp1/work/features/<feature-id>/`
- Knowledge base recommended for context-aware design

## Output

| File | Contents |
|------|----------|
| `design.md` | Technical design specification |
| `design-decisions.md` | Rationale for key decisions |
| `tasks.md` | Implementation task breakdown (auto-generated) |

**Location:** `.rp1/work/features/<feature-id>/`

## Design Document Sections

- Architecture overview with diagrams
- Component design
- Data models
- API specifications
- Integration points
- Implementation DAG (for multi-component features)
- Technology choices with rationale
- Testing strategy

### Implementation DAG

For features with 2+ implementation components, the design includes an Implementation DAG section that identifies parallel execution opportunities and dependencies. This enables optimized task ordering during the build phase.

The DAG section is omitted for single-component designs where parallelization provides no value.

See [DAG Format Reference](../dag-format.md) for the complete specification.

## Examples

### Basic Usage

=== "Claude Code"

    ```bash
    /feature-design user-auth
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-design user-auth
    ```

### With Additional Context

=== "Claude Code"

    ```bash
    /feature-design user-auth "Use existing session middleware"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-design user-auth "Use existing session middleware"
    ```

## Related Commands

- [`feature-requirements`](feature-requirements.md) - Previous step
- [`validate-hypothesis`](validate-hypothesis.md) - Optional: test assumptions
- [`feature-build`](feature-build.md) - Next step: implement tasks
- [`feature-tasks`](feature-tasks.md) - Optional: regenerate or update tasks

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How design respects your architecture
