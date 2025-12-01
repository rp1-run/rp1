---
name: pr-feedback-collect
version: 2.0.0
description: Automatically gathers pull request review comments from GitHub, classifies them by priority and type, extracts actionable tasks, and generates structured feedback documents for systematic resolution.
tags:
  - pr
  - review
  - planning
  - core
created: 2025-10-25
author: cloud-on-prem/rp1
---

# PR Feedback Collector

This command invokes the **pr-feedback-collector** sub-agent to gather and organize GitHub PR review comments.

Use the Task tool to invoke the pr-feedback-collector agent:

```
subagent_type: rp1-dev:pr-feedback-collector
```

The agent will:
- Auto-detect repository and PR information
- Fetch all review comments from GitHub using `gh` CLI
- Classify comments by priority (blocking, important, suggestion, style)
- Extract actionable tasks from comments
- Generate structured pr_feedback.md document
- Report back with summary of collected feedback

The agent has access to all necessary tools and will handle the entire feedback collection workflow autonomously.
