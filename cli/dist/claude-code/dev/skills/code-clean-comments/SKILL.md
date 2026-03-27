---
name: code-clean-comments
description: Systematically removes unnecessary comments from code using git-scoped file detection.
metadata:
  version: 3.0.0
  tags:
    - code
    - refactoring
    - review
  created: 2025-10-25
  author: cloud-on-prem/rp1
  argument-hint: "[scope] [base-branch]"
---

# Comment Cleaner

Spawns the comment-cleaner agent for surgical comment cleanup.

Task tool:
subagent_type: rp1-dev:comment-cleaner
prompt: "SCOPE: {SCOPE}, BASE_BRANCH: {BASE_BRANCH}"