# validate-hypothesis

Tests design assumptions through code experiments, codebase analysis, and external research.

---

## Synopsis

=== "Claude Code"

    ```bash
    /validate-hypothesis <feature-id>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/validate-hypothesis <feature-id>
    ```

## Description

The `validate-hypothesis` command tests assumptions made in your technical design before implementation begins. It runs experiments, analyzes the codebase, and researches external sources to validate (or invalidate) design decisions.

This is an **optional** step in the feature workflow, recommended when:

- The design includes unfamiliar technologies
- Performance assumptions need validation
- Integration approaches are uncertain
- Risk mitigation is important

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier |

## Prerequisites

- `design.md` must exist in `.rp1/work/features/<feature-id>/`

## Output

**Location:** `.rp1/work/features/<feature-id>/hypothesis-results.md`

**Contents:**

- Hypotheses extracted from design
- Validation approach for each
- Experiment results
- Codebase analysis findings
- External research summary
- Recommendation (proceed/modify/reconsider)

## Examples

### Validate Design Assumptions

=== "Claude Code"

    ```bash
    /validate-hypothesis caching-layer
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/validate-hypothesis caching-layer
    ```

**Example output:**
```
✅ Hypothesis Validation Complete

Hypotheses Tested: 3

1. "Redis can handle 10k requests/second"
   Status: VALIDATED
   Evidence: Benchmark showed 15k req/s

2. "Existing middleware supports caching headers"
   Status: VALIDATED
   Evidence: Found in src/middleware/cache.ts

3. "Cache invalidation can use pub/sub"
   Status: NEEDS_MODIFICATION
   Evidence: Current setup uses polling
   Recommendation: Update design to use polling pattern

Overall: PROCEED with modifications
```

## Validation Methods

| Method | Use Case |
|--------|----------|
| Code experiments | Performance, API behavior |
| Codebase analysis | Pattern compatibility, dependencies |
| External research | Library capabilities, best practices |

## Related Commands

- [`/build`](build.md) - Orchestrates the full feature workflow including design and implementation

## See Also

- [Feature Development Guide](../../guides/feature-development.md) - See hypothesis validation in context
