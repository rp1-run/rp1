# pr-review

Intent-aware map-reduce PR review with confidence gating and holistic synthesis.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-review [target] [base-branch]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-review [target] [base-branch]
    ```

## Description

The `pr-review` command performs comprehensive code review using a map-reduce architecture. It understands the PR's intent (from description or linked issues), splits the diff into reviewable units, analyzes each in parallel, and synthesizes findings into a holistic judgment.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `TARGET` | `$1` | No | Current branch | PR number, URL, or branch name |
| `BASE_BRANCH` | `$2` | No | From PR or `main` | Base branch for comparison |

## Input Resolution

| Input Type | Example | Resolution |
|------------|---------|------------|
| Empty | - | Uses current branch |
| PR Number | `123` | Fetches PR metadata via `gh` |
| PR URL | `github.com/.../pull/123` | Extracts number, fetches PR |
| Branch Name | `feature/auth` | Uses branch, checks for PR |

## Architecture

```mermaid
flowchart TB
    subgraph "Phase 0"
        IR[Input Resolution] --> IM[Intent Model]
    end

    subgraph "Phase 1"
        SP[Splitter] --> RU[Review Units]
    end

    subgraph "Phase 2 (Parallel)"
        R1[Sub-Reviewer 1]
        R2[Sub-Reviewer 2]
        RN[Sub-Reviewer N]
    end

    subgraph "Phase 3"
        SY[Synthesizer] --> JD[Judgment]
    end

    subgraph "Phase 4"
        RP[Reporter] --> MD[Report]
    end

    IM --> SP
    RU --> R1
    RU --> R2
    RU --> RN
    R1 --> SY
    R2 --> SY
    RN --> SY
    JD --> RP
```

## Review Dimensions

Each unit is analyzed across 5 dimensions:

| Dimension | Focus |
|-----------|-------|
| **Correctness** | Logic errors, edge cases, bugs |
| **Security** | Vulnerabilities, auth issues |
| **Performance** | Bottlenecks, inefficiencies |
| **Maintainability** | Code quality, patterns |
| **Testing** | Coverage, test quality |

## Confidence Gating

Findings are filtered by confidence level:

| Confidence | Action |
|------------|--------|
| 65%+ | Include in report |
| 40-64% (critical/high) | Investigate further |
| Below 40% | Exclude from report |

## Judgment Outcomes

| Judgment | Meaning |
|----------|---------|
| ✅ `approve` | Ready to merge |
| ⚠️ `request_changes` | Issues to address |
| 🛑 `block` | Critical problems found |

## Examples

### Review Current Branch

=== "Claude Code"

    ```bash
    /pr-review
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-review
    ```

### Review Specific PR

=== "Claude Code"

    ```bash
    /pr-review 123
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-review 123
    ```

**Example output:**
```
✅ PR Review Complete

Judgment: APPROVE
The PR correctly implements user authentication with proper validation.

Findings:
- 🚨 Critical: 0
- ⚠️ High: 1
- 💡 Medium: 3
- ✅ Low: 5

Report: .rp1/work/pr-reviews/pr-123.md
```

## Output

**Location:** `.rp1/work/pr-reviews/<review-id>.md`

**Contents:**

- Intent summary
- Judgment with rationale
- Findings by severity
- Cross-file issues
- Recommendations

## Related Commands

- [`pr-visual`](pr-visual.md) - Generate diagrams from PR
- [`address-pr-feedback`](address-pr-feedback.md) - Collect and fix review comments

## See Also

- [Map-Reduce Workflows](../../concepts/map-reduce-workflows.md) - How parallel review works
