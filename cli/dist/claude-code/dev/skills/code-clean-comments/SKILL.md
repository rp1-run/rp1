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

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --schema-path plugins/dev/skills/code-clean-comments/SKILL.md --args "{raw arguments from user invocation}"
```

Parse the JSON response. Extract values from `data.arguments`:

| Variable | Source |
|----------|--------|
| SCOPE | `data.arguments.SCOPE` |
| BASE_BRANCH | `data.arguments.BASE_BRANCH` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

Spawns the comment-cleaner agent for surgical comment cleanup.

Task tool:
subagent_type: rp1-dev:comment-cleaner
prompt: "SCOPE: {SCOPE}, BASE_BRANCH: {BASE_BRANCH}"