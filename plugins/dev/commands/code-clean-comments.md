---
name: code-clean-comments
version: 2.0.0
description: Systematically removes unnecessary comments from code while preserving docstrings, critical logic explanations, and type directives.
tags:
  - code
  - refactoring
  - review
  - analysis
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Comment Sanitizer

This command invokes the **comment-cleaner** sub-agent for surgical comment cleanup.

Use the Task tool to invoke the comment-cleaner agent:

```
subagent_type: rp1-dev:comment-cleaner
```

The agent will:
- Identify changed files in current branch
- Classify comments (preserve docstrings, critical logic, type directives)
- Remove unnecessary comments (obvious explanations, redundant, leaked info)
- Validate changes with tests and linting
- Perform multiple sweep iterations if needed
- Report back with cleanup summary

The agent has access to all necessary tools and will handle the entire comment cleanup workflow autonomously.
