---
name: project-birds-eye-view
version: 2.0.0
description: Generates comprehensive project overview documents with diagrams for new developers using internal knowledge base and codebase context.
tags:
  - documentation
  - analysis
  - onboarding
  - visualization
created: 2025-10-29
author: cloud-on-prem/rp1
---

# Project Bird's-Eye View Generator

This command invokes the **project-documenter** sub-agent to generate project overview documentation.

Use the Task tool to invoke the project-documenter agent:

```
subagent_type: rp1-base:project-documenter
```

The agent will:

- Load internal knowledge base
- Explore codebase for additional context
- Generate comprehensive overview with diagrams
- Include: Summary, System Context, Architecture, Modules, Data Model, Workflows, APIs
- Create Mermaid diagrams (validated)
- Mark unknowns as TBD
- Save the output document
- Report back with documentation summary

The agent follows strict rules: never invent facts, use only loaded sources and codebase exploration.

The agent has access to all necessary tools and will handle the entire documentation workflow autonomously.
