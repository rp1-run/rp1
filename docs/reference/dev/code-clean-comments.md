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

- `<file>` - Generate a full-file manifest for one supported source file under
  `code-root`
- `<directory>` - Generate a manifest for supported source files under a
  directory, excluding generated and dependency paths
- `<git-ref>` - Generate a manifest from changes between the ref and `HEAD`
- `<commit-range>` - Generate a manifest from any valid git commit range
  (for example, `HEAD~5..HEAD` or `abc123..def456`)
- `<change-manifest.json>` - Validate and reuse an existing manifest as the
  cleanup boundary

## Description

The `code-clean-comments` command first resolves the requested scope into a
durable, validated cleanup manifest, then removes unnecessary comments only
within that proven scope. Cleanup runs only when the manifest is created and
non-empty.

The manifest is the audit trail for what rp1 was allowed to edit. If cleanup
skips or changes less than expected, inspect the manifest and status file (see
Generated Artifacts) instead of widening the scope blindly.

Scope inputs such as a directory, git ref, or commit range are always converted
into a manifest before any file is edited — cleanup never operates on raw
branch-wide or dirty-state input directly, which keeps every edit bounded and
reviewable.

### Generated Artifacts

Artifacts are written under the canonical work root:

- `.rp1/work/comment-clean-comments/change-manifest-001.json` - cleanup-owned
  files and line ranges, when generated
- `.rp1/work/comment-clean-comments/change-manifest-status-001.json` -
  created/skipped status, file counts, owned-line counts, and skip reason

The number increments when either artifact already exists.

If generation skips, no cleaner is dispatched. Common skip reasons include
`no_supported_source_hunks`, `scope_outside_code_root`, `invalid_scope`, and
`unsupported_scope`. Invalid, missing, empty, or outside-root manifests fail
closed rather than widening cleanup authority.

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
Manifest status: .rp1/work/comment-clean-comments/change-manifest-status-001.json

Changes:
- src/utils/helpers.ts: Removed 5 obvious comments
- src/api/routes.ts: Removed 3 commented code blocks
- src/models/user.ts: Removed 2 redundant docstrings

Note: Run code-check to verify no issues introduced
```

**Skipped output includes:**

```
Comment Cleanup Skipped

Scope: .
Manifest: None
Status: .rp1/work/comment-clean-comments/change-manifest-status-001.json
Skip reason: no_supported_source_hunks
```

## Related Commands

- [`code-audit`](code-audit.md) - Includes comment quality analysis
- [`code-check`](code-check.md) - Verify after cleaning
