---
name: code-clean-comments
version: 3.0.0
description: Systematically removes unnecessary comments from code using git-scoped file detection.
argument-hint: "[scope] [base-branch]"
tags:
  - code
  - refactoring
  - review
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Comment Cleaner

Spawns the comment-cleaner agent for surgical comment cleanup.

**Scope Options**:
- `branch` (default): Files changed since diverging from base branch
- `unstaged`: Only unstaged files (pre-commit use case)
- `<commit-range>`: Any valid git commit range (e.g., `HEAD~5..HEAD`, `abc123..def456`)

Use the Task tool:

```
subagent_type: rp1-dev:comment-cleaner
prompt: |
  SCOPE: {$1 or "branch"}
  BASE_BRANCH: {$2 or "main"}
```
