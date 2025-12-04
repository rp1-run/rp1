# pr-visual

Transform pull request diffs into comprehensive Mermaid diagrams for visual code review.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-visual [pr-branch] [base-branch] [review-depth] [focus-areas]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual [pr-branch] [base-branch] [review-depth] [focus-areas]
    ```

## Description

The `pr-visual` command generates Mermaid diagrams from PR diffs to help understand code changes visually. It creates architecture diagrams, flow charts, and dependency graphs showing what changed and how components interact.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PR_BRANCH` | `$1` | No | Current branch | Branch to visualize |
| `BASE_BRANCH` | `$2` | No | `main` | Base branch for comparison |
| `REVIEW_DEPTH` | `$3` | No | `standard` | Level of detail |
| `FOCUS_AREAS` | `$4` | No | All | Specific areas to focus on |

## Diagram Types

| Type | Shows |
|------|-------|
| **Architecture** | Component relationships, new/modified modules |
| **Flow** | Control flow through changed code paths |
| **Dependency** | Import/dependency changes |
| **Data Flow** | Data transformations and state changes |

## Examples

### Visualize Current Branch

=== "Claude Code"

    ```bash
    /pr-visual
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual
    ```

### Visualize Specific PR

=== "Claude Code"

    ```bash
    /pr-visual feature/auth main
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual feature/auth main
    ```

**Example output:**
```
✅ PR Visualization Complete

Diagrams Generated:
1. Architecture Overview (12 components)
2. Auth Flow Changes (3 new paths)
3. Dependency Graph (2 new imports)

Output: .rp1/work/pr-diagrams/feature-auth.md
```

## Output

**Location:** `.rp1/work/pr-diagrams/<branch-name>.md`

Contains validated Mermaid diagrams ready for rendering.

## Related Commands

- [`pr-review`](pr-review.md) - Full PR review
- [`project-birds-eye-view`](../base/project-birds-eye-view.md) - Project-wide diagrams
