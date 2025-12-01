---
name: code-investigate
version: 2.0.0
description: Systematic investigation of bugs and issues to identify root causes through evidence-based analysis, hypothesis testing, and comprehensive documentation without permanent code changes.
tags:
  - analysis
  - code
  - core
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Root Cause Investigator

This command invokes the **bug-investigator** sub-agent for systematic issue analysis.

Use the Task tool to invoke the bug-investigator agent:

```
subagent_type: rp1-dev:bug-investigator
```

The agent will:
- Analyze problem statement and gather context
- Form and test hypotheses systematically
- Add temporary debugging (tracked and reverted)
- Trace code execution paths
- Identify root cause with evidence
- Generate comprehensive investigation report
- Propose solutions with effort estimates
- Report back with findings

The agent has access to all necessary tools and will handle the entire investigation workflow autonomously.
