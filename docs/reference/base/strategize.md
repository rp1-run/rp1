# strategize

Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, and complexity.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-base:strategize
    ```

=== "OpenCode"

    ```bash
    /rp1-base/strategize
    ```

## Description

The `strategize` command performs comprehensive strategic analysis of your system, identifying optimization opportunities and providing quantified recommendations. It evaluates trade-offs across multiple dimensions and prioritizes by impact and effort.

The command analyzes:

- **Architecture**: Patterns, technical debt, scalability
- **Code Quality**: Maintainability, complexity, test coverage
- **Performance**: Bottlenecks, resource usage, optimization opportunities
- **Costs**: Infrastructure, development, maintenance overhead
- **Business Alignment**: Feature velocity, risk areas, competitive positioning

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Root directory for KB context |

## Output

The command produces a detailed strategy report covering:

| Section | Contents |
|---------|----------|
| Executive Summary | Key findings and top recommendations |
| Current State Analysis | Architecture, quality, and performance assessment |
| Optimization Opportunities | Identified improvements with ROI estimates |
| Trade-off Analysis | Options compared across cost/quality/complexity |
| Prioritized Roadmap | Recommendations ordered by impact and effort |
| Risk Assessment | Potential issues and mitigation strategies |

## Examples

### Run Strategic Analysis

=== "Claude Code"

    ```bash
    /rp1-base:strategize
    ```

=== "OpenCode"

    ```bash
    /rp1-base/strategize
    ```

**Example output:**
```
✅ Strategic Analysis Complete

Executive Summary:
- 3 high-impact opportunities identified
- Estimated ROI: 40% reduction in build time
- Risk level: Low to Medium

Top Recommendations:
1. [HIGH] Add caching layer to API endpoints
   - Effort: 2 weeks
   - Impact: 60% latency reduction

2. [MEDIUM] Refactor authentication module
   - Effort: 1 week
   - Impact: Improved maintainability

3. [LOW] Update dependency versions
   - Effort: 2 days
   - Impact: Security improvements

Full report: .rp1/work/strategy-report.md
```

## Analysis Dimensions

The command evaluates your system across these dimensions:

| Dimension | Metrics |
|-----------|---------|
| **Cost** | Infrastructure, development time, maintenance |
| **Quality** | Code health, test coverage, documentation |
| **Performance** | Response times, throughput, resource usage |
| **Complexity** | Coupling, cognitive load, onboarding time |
| **Business** | Feature velocity, time-to-market, risk exposure |

## Requirements

!!! warning "Prerequisite"
    The knowledge base must exist before running this command. Run [`knowledge-build`](knowledge-build.md) first.

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base
- [`analyse-security`](analyse-security.md) - Security-focused analysis

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How agents understand your codebase
