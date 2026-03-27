---
name: tester
description: "Test command template for verifying argument passing and skill invocation."
metadata:
  version: 1.0.0
  tags:
    - prompt-engineering
    - refactoring
  created: 2025-12-21
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: GIT_COMMIT
      type: string
      required: false
      description: "Git commit reference if provided"
    - name: GIT_BRANCH
      type: string
      required: false
      description: "Git branch name if provided"
---

# Tester Prompt

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --schema-path plugins/utils/skills/tester/SKILL.md --args "{raw arguments from user invocation}"
```

Parse the JSON response. Extract values from `data.arguments`:

| Variable | Source |
|----------|--------|
| GIT_COMMIT | `data.arguments.GIT_COMMIT` |
| GIT_BRANCH | `data.arguments.GIT_BRANCH` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

Print out the values of {GIT_COMMIT} and {GIT_BRANCH}
