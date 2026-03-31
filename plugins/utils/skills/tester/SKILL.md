---
name: tester
description: "Test harness for verifying skill argument passing and invocation. Echoes parsed parameter values to confirm the skill system correctly extracts and passes arguments. Use when testing skill infrastructure, debugging argument parsing, or verifying that skill invocation works correctly."
metadata:
  version: 1.0.0
  tags:
    - prompt-engineering
    - testing
    - utilities
  created: 2025-12-21
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "[git-commit] [git-branch]"
---

# Skill Invocation Tester

A diagnostic skill for verifying that the skill system correctly parses and passes arguments.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `GIT_COMMIT` | No | `(none)` | Git commit reference (SHA, tag, or ref) if provided |
| `GIT_BRANCH` | No | `(none)` | Git branch name if provided |

## Usage

```
/rp1-utils:tester abc123 main
/rp1-utils:tester --commit HEAD~3 --branch feature/login
/rp1-utils:tester
```

## Execution

Print the parsed parameter values in this format:

```
GIT_COMMIT: {GIT_COMMIT}
GIT_BRANCH: {GIT_BRANCH}
```

If a parameter was not provided, print `(none)` as its value.

## Verification Checklist

After printing, confirm:
- Parameters were correctly extracted from user input
- Default values applied for missing parameters
- No extra arguments were captured or lost
