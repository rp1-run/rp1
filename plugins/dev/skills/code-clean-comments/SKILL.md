---
name: code-clean-comments
description: "Systematically removes unnecessary comments from code using git-scoped file detection."
metadata:
  category: quality
  is_workflow: false
  version: 3.0.0
  tags:
    - code
    - refactoring
    - review
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: SCOPE
      type: string
      required: false
      default: "branch"
      description: "Scope of files to clean: branch, unstaged, or a git commit range"
    - name: BASE_BRANCH
      type: string
      required: false
      default: "main"
      description: "Base branch for branch scope comparison"
  sub_agents:
    - "rp1-dev:comment-cleaner"
---

# Comment Cleaner

Spawns the comment-cleaner agent for surgical comment cleanup.

{% dispatch_agent "rp1-dev:comment-cleaner", "SCOPE: {SCOPE}, BASE_BRANCH: {BASE_BRANCH}" %}
