---
name: project-birds-eye-view
description: "Generates a project overview document with architecture diagrams, module summaries, and data models for developer onboarding. Outputs a single markdown file with validated Mermaid diagrams covering system context, architecture, modules, workflows, and APIs. Use when onboarding new developers, creating a project summary, generating architecture documentation, or building a getting-started guide."
metadata:
  version: 2.0.0
  tags:
    - documentation
    - analysis
    - onboarding
    - visualization
  created: 2025-10-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-base:project-documenter"
---

# Project Bird's-Eye View Generator

Dispatches the **project-documenter** sub-agent to produce a comprehensive project overview document.

## Usage

```
/rp1-base:project-birds-eye-view
/rp1-base:project-birds-eye-view generate overview for the payments service
```

## Workflow

{% dispatch_agent "rp1-base:project-documenter" %}

The agent performs these steps:

1. **Load KB** — Read the internal knowledge base from `.rp1/context/`
2. **Explore codebase** — Scan source files for additional architectural context
3. **Generate document** — Produce a structured overview covering:
   - Project summary and system context
   - Architecture overview with Mermaid diagrams
   - Module breakdown and dependencies
   - Data model and key workflows
   - API surface
4. **Validate diagrams** — Run Mermaid syntax validation on all generated diagrams
5. **Save and report** — Write the document and return a summary

Unknowns are marked as **TBD** — the agent never invents facts, using only loaded sources and codebase exploration.
