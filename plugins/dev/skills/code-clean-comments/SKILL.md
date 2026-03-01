---
name: code-clean-comments
description: "Systematically removes unnecessary comments from code using git-scoped file detection."
metadata:
  version: 3.0.0
  tags:
    - code
    - refactoring
    - review
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "[scope] [base-branch]"
---

# Comment Cleaner

Spawns the comment-cleaner agent for surgical comment cleanup.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `SCOPE` | No | `branch` | Scope of files to clean. Options: `branch` (files changed since diverging from base branch), `unstaged` (only unstaged files), or a git commit range (e.g., `HEAD~5..HEAD`, `abc123..def456`) |
| `BASE_BRANCH` | No | `main` | Base branch for `branch` scope comparison |

**Scope Options**:
- `branch` (default): Files changed since diverging from base branch
- `unstaged`: Only unstaged files (pre-commit use case)
- `<commit-range>`: Any valid git commit range (e.g., `HEAD~5..HEAD`, `abc123..def456`)

Use the Task tool:

```
subagent_type: rp1-dev:comment-cleaner
prompt: |
  SCOPE: {SCOPE}
  BASE_BRANCH: {BASE_BRANCH}
```
