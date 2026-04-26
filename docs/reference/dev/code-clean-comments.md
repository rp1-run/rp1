# code-clean-comments

Removes unnecessary comments from a scoped set of code changes while preserving essential documentation.

---

## Synopsis

=== "Claude Code"

    ```bash
    /code-clean-comments [scope] [code-root]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-code-clean-comments [scope] [code-root]
    ```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `scope` | `.` | File path, directory path, git ref, git range, or existing change-manifest JSON |
| `code-root` | Current project code root | Source root for resolving scoped paths |

**Scope Options:**

- `<file>` - A single file under `code-root`
- `<directory>` - Supported code files under a directory
- `<git-ref>` - Changes from the ref to `HEAD`
- `<commit-range>` - Any valid git commit range (e.g., `HEAD~5..HEAD`, `abc123..def456`)
- `<change-manifest.json>` - Existing manifest to validate and reuse

## Description

The `code-clean-comments` command first resolves the requested scope into a durable `change-manifest-*.json` artifact, then invokes the comment-cleaner agent with only `CHANGE_MANIFEST` and `CODE_ROOT`. The cleaner itself does not accept branch-wide or unstaged cleanup parameters directly.

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

### Clean the current directory

```bash
/code-clean-comments
```

### Clean one file

```bash
/code-clean-comments cli/src/main.ts
```

### Clean one directory

```bash
/code-clean-comments cli/src/agent-tools
```

### Clean a specific commit range

```bash
/code-clean-comments HEAD~5..HEAD
```

### Clean from an existing manifest

```bash
/code-clean-comments .rp1/work/comment-clean-comments/change-manifest-001.json
```

**Example output:**
```
✅ Comment Cleanup Complete

Files scanned: 45
Comments removed: 23
Comments preserved: 67
Manifest: .rp1/work/comment-clean-comments/change-manifest-001.json

Changes:
- src/utils/helpers.ts: Removed 5 obvious comments
- src/api/routes.ts: Removed 3 commented code blocks
- src/models/user.ts: Removed 2 redundant docstrings

Note: Run code-check to verify no issues introduced
```

## Related Commands

- [`code-audit`](code-audit.md) - Includes comment quality analysis
- [`code-check`](code-check.md) - Verify after cleaning
