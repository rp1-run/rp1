---
name: code-comments
description: Extract comment locations from code files for analysis. Use when cleaning comments, auditing code documentation, or analyzing comment patterns. Supports Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, Ruby, PHP, Shell scripts. Trigger terms - comments, extract comments, code comments, comment analysis, documentation audit, comment cleanup.
allowed-tools: Bash, Read
---

# Comments Extraction Skill

Extract comment locations from git-changed files for analysis by the comment-cleaner agent.

## What This Skill Does

- Detects files changed in a git scope (branch or unstaged)
- Extracts all comments with line numbers and context
- Outputs structured JSON for downstream processing
- Supports multiple programming languages

## When to Use

Activate this skill when:

- Preparing for comment cleanup operations
- Auditing code documentation coverage
- Analyzing comment patterns in a codebase
- Working with the comment-cleaner agent

## Supported Languages

| Extension | Single-line | Multi-line |
|-----------|-------------|------------|
| `.py`, `.sh`, `.rb`, `.yml`, `.yaml` | `#` | N/A |
| `.js`, `.ts`, `.tsx`, `.jsx`, `.go`, `.rs`, `.java`, `.kt`, `.swift`, `.c`, `.cpp`, `.h`, `.hpp` | `//` | `/* */` |
| `.html`, `.xml`, `.vue`, `.svelte` | N/A | `<!-- -->` |
| `.css`, `.scss`, `.less` | N/A | `/* */` |
| `.php` | `//`, `#` | `/* */` |

## Usage

### Extract Comments from Git Scope

```bash
# Default: files changed since branch diverged from main
rp1 agent-tools comment-extract branch main

# Only unstaged files (pre-commit use case)
rp1 agent-tools comment-extract unstaged main

# Extract from commit range with line-scoped filtering
rp1 agent-tools comment-extract "abc123..def456" main --line-scoped
```

### Output Format

```json
{
  "success": true,
  "tool": "comment-extract",
  "data": {
    "scope": "branch",
    "base": "main",
    "filesScanned": 12,
    "linesAdded": 150,
    "comments": [
      {
        "file": "src/auth.py",
        "line": 45,
        "type": "single",
        "content": "# Check if user is active",
        "contextBefore": "def validate_user(user):",
        "contextAfter": "    if user.is_active:"
      }
    ]
  }
}
```

### Output Fields

| Field | Description |
|-------|-------------|
| `success` | Whether extraction completed successfully |
| `tool` | Tool name (`comment-extract`) |
| `data.scope` | The scope used (`branch`, `unstaged`, or commit range) |
| `data.base` | Base branch for comparison |
| `data.filesScanned` | Number of files processed |
| `data.linesAdded` | Total lines added in diff |
| `data.lineScoped` | Whether line-scoped filtering was applied |
| `data.comments` | Array of comment objects |
| `data.comments[].file` | Relative file path |
| `data.comments[].line` | Line number (1-indexed) |
| `data.comments[].type` | Comment type (`single` or `multi`) |
| `data.comments[].content` | The comment text |
| `data.comments[].contextBefore` | Line before the comment |
| `data.comments[].contextAfter` | Line after the comment |

## Error Handling

The tool handles:

- Git command failures (not a repo, invalid branch)
- Missing files (deleted in working tree)
- Binary files (automatically skipped)
- Encoding issues (UTF-8)

Error output format:

```json
{
  "success": false,
  "tool": "comment-extract",
  "data": {
    "scope": "branch",
    "base": "main",
    "filesScanned": 0,
    "linesAdded": 0,
    "comments": []
  },
  "errors": [{ "message": "Not a git repository" }]
}
```

## Integration

This skill is used by the `comment-cleaner` agent to:

1. Get a manifest of all comments in scope
2. Avoid reading entire files for comment detection
3. Process comments efficiently with context

## Limitations

- Does not detect comments inside string literals (best effort)
- Multi-line string docstrings in Python are not extracted (intentional - docstrings are kept)
- Very large files (>10000 lines) are skipped to prevent memory issues
