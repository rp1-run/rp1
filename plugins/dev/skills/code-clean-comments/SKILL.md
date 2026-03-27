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

{% dispatch_agent "rp1-dev:comment-cleaner", "SCOPE: {SCOPE}, BASE_BRANCH: {BASE_BRANCH}" %}
