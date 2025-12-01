---
name: pr-visual
description: Transform pull request diffs into comprehensive Mermaid diagrams for visual code review and change understanding.
argument-hint: "[pr-branch] [base-branch] [review-depth] [focus-areas]"
tags:
  - pr
  - review
  - analysis
  - code
created: 2025-10-25
author: cloud-on-prem/rp1
version: 2.0.0
---

# Visual PR Analyzer

This command invokes the **pr-visualizer** sub-agent for PR diff visualization.

Use the Task tool to invoke the pr-visualizer agent:

```
subagent_type: rp1-dev:pr-visualizer
```

The agent will:
- Accept PR URL, branch name, or use current branch
- Retrieve PR diff using `gh` CLI or git
- Generate 1-4 Mermaid diagrams showing behavioral changes
- Focus on control flow, architecture, data model changes
- Validate all diagrams for correct syntax
- Save visualizations to work artifacts
- Report back with diagram summary

The agent follows a minimal, diagram-first approach with hard rule: skip trivial changes.

The agent has access to all necessary tools and will handle the entire visualization workflow autonomously.
