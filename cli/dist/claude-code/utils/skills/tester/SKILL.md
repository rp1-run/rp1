---
name: tester
description: Test command template for verifying argument passing and skill invocation.
metadata:
  version: 1.0.0
  tags:
    - prompt-engineering
    - refactoring
  created: 2025-12-21
  author: cloud-on-prem/rp1
  argument-hint: "[git-commit] [git-branch]"
---

# Tester Prompt

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `GIT_COMMIT` | No | - | Git commit reference if provided |
| `GIT_BRANCH` | No | - | Git branch name if provided |

Print out the values of {GIT_COMMIT} and {GIT_BRANCH}