---
name: pr-visual
description: "Transform pull request diffs into Mermaid diagrams for visual code review and change understanding."
metadata:
  version: 3.0.0
  tags:
    - pr
    - review
    - analysis
    - code
  created: 2025-10-25
  updated: 2026-03-24
  author: cloud-on-prem/rp1
  argument-hint: "[pr-branch] [base-branch] [review-depth] [focus-areas]"
  sub_agents:
    - "rp1-dev:pr-visualizer"
---

# Visual PR Analyzer

This command invokes the **pr-visualizer** sub-agent for PR diff visualization.

Invoke the pr-visualizer agent:

{% dispatch_agent "rp1-dev:pr-visualizer" %}

The agent will:
- Accept PR URL, branch name, or use current branch
- Retrieve PR diff using `gh` CLI or git
- Generate 1-4 Mermaid diagrams showing behavioral changes
- Focus on control flow, architecture, data model changes
- Validate all diagrams for correct syntax
- Save markdown with embedded Mermaid to work artifacts
- Report back with diagram summary

The agent has access to all necessary tools and will handle the entire visualization workflow autonomously.
