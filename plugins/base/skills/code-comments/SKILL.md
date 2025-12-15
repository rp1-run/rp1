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
python plugins/base/skills/comments/scripts/extract_comments.py branch main

# Only unstaged files (pre-commit use case)
python plugins/base/skills/comments/scripts/extract_comments.py unstaged main
```

### Output Format

```json
{
  "scope": "branch",
  "base": "main",
  "files_scanned": 12,
  "comments": [
    {
      "file": "src/auth.py",
      "line": 45,
      "type": "single",
      "content": "# Check if user is active",
      "context_before": "def validate_user(user):",
      "context_after": "    if user.is_active:"
    }
  ]
}
```

### Output Fields

| Field | Description |
|-------|-------------|
| `scope` | The scope used (`branch` or `unstaged`) |
| `base` | Base branch for comparison |
| `files_scanned` | Number of files processed |
| `comments` | Array of comment objects |
| `comments[].file` | Relative file path |
| `comments[].line` | Line number (1-indexed) |
| `comments[].type` | Comment type (`single` or `multi`) |
| `comments[].content` | The comment text |
| `comments[].context_before` | Line before the comment |
| `comments[].context_after` | Line after the comment |

## Error Handling

The script handles:

- Git command failures (not a repo, invalid branch)
- Missing files (deleted in working tree)
- Binary files (automatically skipped)
- Encoding issues (UTF-8 with fallback)

Error output format:

```json
{
  "error": "Not a git repository",
  "scope": "branch",
  "base": "main",
  "files_scanned": 0,
  "comments": []
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
