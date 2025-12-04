# code-quick-build

Handles exploratory development requests including quick fixes, prototypes, and small enhancements.

---

## Synopsis

=== "Claude Code"

    ```bash
    /code-quick-build <development-request>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build <development-request>
    ```

## Description

The `code-quick-build` command handles development requests that don't warrant the full feature workflow. It's designed for quick fixes, prototypes, performance optimizations, and small feature enhancements with proper planning and scope management.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | `$ARGUMENTS` | Yes | - | Description of what to build |

## Use Cases

| Type | Example |
|------|---------|
| Quick fix | "Fix the null pointer in user validation" |
| Prototype | "Add a basic dark mode toggle" |
| Optimization | "Improve query performance in reports" |
| Enhancement | "Add loading spinner to submit button" |

## Examples

### Quick Fix

=== "Claude Code"

    ```bash
    /code-quick-build "Fix the authentication bug when token expires"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build "Fix the authentication bug when token expires"
    ```

### Small Enhancement

=== "Claude Code"

    ```bash
    /code-quick-build "Add export to CSV button on reports page"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-quick-build "Add export to CSV button on reports page"
    ```

## Workflow

1. Analyzes the request scope
2. Creates a brief implementation plan
3. Implements the changes
4. Runs code checks
5. Reports completion

!!! tip "When to Use Full Workflow"
    If the command determines the request requires significant architectural changes or spans multiple components, it will recommend using the full feature workflow instead.

## Related Commands

- [`feature-requirements`](feature-requirements.md) - For larger features
- [`code-check`](code-check.md) - Verify changes
