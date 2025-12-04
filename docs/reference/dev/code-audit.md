# code-audit

Analyzes code for pattern consistency, maintainability, duplication, and documentation drift.

---

## Synopsis

=== "Claude Code"

    ```bash
    /code-audit
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-audit
    ```

## Description

The `code-audit` command performs a comprehensive audit of your codebase beyond standard linting. It checks for pattern consistency, identifies code duplication, evaluates maintainability, and detects documentation drift.

## Analysis Dimensions

| Dimension | What It Checks |
|-----------|---------------|
| **Pattern Consistency** | Naming conventions, file structure, code organization |
| **Maintainability** | Complexity metrics, coupling, cohesion |
| **Code Duplication** | Similar code blocks, copy-paste patterns |
| **Comment Quality** | Outdated comments, missing docs, redundant comments |
| **Documentation Drift** | Code vs. docs mismatches |

## Output

**Location:** `.rp1/work/audit-report.md`

## Examples

### Run Audit

=== "Claude Code"

    ```bash
    /code-audit
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-audit
    ```

**Example output:**
```
✅ Code Audit Complete

Pattern Consistency: ⚠️ 3 deviations found
Maintainability: ✓ Good (avg complexity: 4.2)
Code Duplication: ⚠️ 2 similar blocks detected
Comment Quality: ✓ Clean
Documentation Drift: ✓ In sync

Report: .rp1/work/audit-report.md
```

## Related Commands

- [`code-check`](code-check.md) - Fast hygiene checks
- [`code-clean-comments`](code-clean-comments.md) - Remove unnecessary comments
