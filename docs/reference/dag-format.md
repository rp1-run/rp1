# DAG Format Reference

Specification for the Implementation DAG (Directed Acyclic Graph) output in design documents.

---

## Overview

The Implementation DAG section provides explicit task dependency information in `design.md` files. It enables:

- **Parallel execution**: Identify tasks that can run simultaneously
- **Dependency tracking**: Clear visibility into what blocks what
- **Optimized orchestration**: Downstream agents can parallelize work

## When DAG Is Included

| Condition | DAG Section |
|-----------|-------------|
| 2+ implementation components | Included |
| Single component | Omitted (no parallelization value) |
| All tasks have linear dependencies | Included (documents critical path) |

## Format Specification

The DAG section appears after the "Implementation Plan" section in `design.md`:

```markdown
## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3] - Foundation components, no shared state
2. [T4, T5] - Can proceed after group 1, independent of each other
3. [T6] - Integration layer

**Dependencies**:

- T4 -> T1 (T4 depends on T1: API contracts)
- T5 -> T2 (T5 depends on T2: data models)
- T6 -> [T4, T5] (T6 depends on both T4 and T5: integration)

**Critical Path**: T1 -> T4 -> T6
```

## Notation

### Parallel Groups

Tasks that can execute simultaneously are grouped in brackets:

```markdown
1. [T1, T2, T3] - Explanation of why these are parallel
```

| Element | Description |
|---------|-------------|
| `[T1, T2, T3]` | Tasks T1, T2, and T3 can run in parallel |
| Number prefix | Sequential group number (1, 2, 3...) |
| Comment | Explanation of why tasks are independent |

### Dependencies

Dependencies use arrow notation where the arrow points from dependent to prerequisite:

| Notation | Meaning |
|----------|---------|
| `T4 -> T1` | T4 depends on T1 (T1 must complete before T4 starts) |
| `T6 -> [T4, T5]` | T6 depends on both T4 and T5 |

**Reading dependencies**: "T4 -> T1" reads as "T4 depends on T1" or "T4 requires T1".

### Critical Path

The longest dependency chain through the DAG:

```markdown
**Critical Path**: T1 -> T4 -> T6
```

This identifies the sequence of tasks that determines minimum total time.

## Task ID Rules

| Rule | Description |
|------|-------------|
| Sequential IDs | T1, T2, T3... starting from T1 |
| Design mapping | Each T{N} corresponds to an Implementation Plan component |
| Unique IDs | No duplicate task IDs within a DAG |
| Complete coverage | Every task in the Implementation Plan gets an ID |

## Dependency Types

### Hard Dependencies (Require Sequential)

| Type | Example | Result |
|------|---------|--------|
| Data dependency | Task B reads data Task A writes | B -> A |
| Interface dependency | Task B uses API Task A defines | B -> A |
| Build dependency | Task B imports module Task A creates | B -> A |
| Sequential workflow | Task B validates Task A output | B -> A |

### Not Hard Dependencies (Can Be Parallel)

These do NOT require sequential ordering:

- Both tasks use the same library
- Both tasks modify different parts of the same file
- Both tasks have similar complexity
- Both tasks are in the same component category

## Examples

### Multi-Component Feature

```markdown
## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3] - Schema, API types, and UI components have no shared state
2. [T4, T5] - Controller and service layer, independent after types defined
3. [T6] - Integration tests require all components

**Dependencies**:

- T4 -> T1 (controller uses schema types)
- T5 -> T2 (service implements API contracts)
- T6 -> [T4, T5] (tests require both controller and service)

**Critical Path**: T1 -> T4 -> T6
```

### Linear Dependencies

Even with linear dependencies, the DAG documents the critical path:

```markdown
## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1] - Database migration
2. [T2] - Model layer
3. [T3] - API endpoints

**Dependencies**:

- T2 -> T1 (models require schema)
- T3 -> T2 (endpoints use models)

**Critical Path**: T1 -> T2 -> T3
```

### Maximum Parallelization

Independent modules allow high parallelization:

```markdown
## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3, T4] - Four independent utility modules
2. [T5] - Main module importing all utilities

**Dependencies**:

- T5 -> [T1, T2, T3, T4] (main requires all utilities)

**Critical Path**: T1 -> T5 (or any T{1-4} -> T5)
```

## Downstream Consumption

### feature-tasker Agent

The feature-tasker parses the DAG to inform task ordering:

1. Extracts parallel groups from `[T1, T2, ...]` patterns
2. Extracts dependencies from `T{N} -> T{M}` patterns
3. Applies topological sort for task order
4. Preserves parallelizable groups in task categories

### Backward Compatibility

If no Implementation DAG section exists, downstream agents use sequential ordering based on the Implementation Plan order.

## Validation Rules

| Rule | Enforcement |
|------|-------------|
| No cycles | Graph must be acyclic |
| Complete references | All T{N} in dependencies must exist in parallel groups |
| Valid notation | Must use specified bracket and arrow syntax |

## Related Documentation

- [Feature Design](dev/feature-design.md) - Where DAG is generated
- [Feature Tasks](dev/feature-tasks.md) - Consumes DAG for task ordering
- [Feature Development Tutorial](../guides/feature-development.md) - Complete workflow
