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

Print out the values of {GIT_COMMIT} and {GIT_BRANCH}
