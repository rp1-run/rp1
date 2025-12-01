# code-clean-comments

Removes unnecessary comments from code while preserving essential documentation.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:code-clean-comments
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-clean-comments
    ```

## Description

The `code-clean-comments` command systematically removes unnecessary comments from your codebase. It preserves docstrings, critical logic explanations, and required directives while removing redundant, outdated, or obvious comments.

## What's Preserved

| Type | Example | Status |
|------|---------|--------|
| Docstrings | Function/class documentation | ✓ Kept |
| Critical logic | Complex algorithm explanation | ✓ Kept |
| Type directives | `# type: ignore`, `// @ts-ignore` | ✓ Kept |
| License headers | File copyright notices | ✓ Kept |
| TODO with ticket | `// TODO(JIRA-123)` | ✓ Kept |

## What's Removed

| Type | Example | Status |
|------|---------|--------|
| Obvious comments | `// increment counter` | ✗ Removed |
| Commented code | `// old_function()` | ✗ Removed |
| TODOs without tickets | `// TODO: fix later` | ✗ Removed |
| Progress markers | `// done` | ✗ Removed |
| Redundant docs | Self-evident getter/setter docs | ✗ Removed |

## Examples

### Clean Comments

=== "Claude Code"

    ```bash
    /rp1-dev:code-clean-comments
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-clean-comments
    ```

**Example output:**
```
✅ Comment Cleanup Complete

Files scanned: 45
Comments removed: 23
Comments preserved: 67

Changes:
- src/utils/helpers.ts: Removed 5 obvious comments
- src/api/routes.ts: Removed 3 commented code blocks
- src/models/user.ts: Removed 2 redundant docstrings

Note: Run code-check to verify no issues introduced
```

## Related Commands

- [`code-audit`](code-audit.md) - Includes comment quality analysis
- [`code-check`](code-check.md) - Verify after cleaning
