---
name: code-audit
version: 2.0.0
description: Analyzes implemented code for pattern consistency, maintainability, code duplication, comment quality, and documentation drift.
tags:
  - analysis
  - review
  - code
  - documentation
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Code Quality Auditor

This command invokes the **code-auditor** sub-agent for pattern and quality analysis.

Use the Task tool to invoke the code-auditor agent:

```
subagent_type: rp1-dev:code-auditor
```

The agent will:
- Discover existing project patterns and conventions
- Detect pattern violations and inconsistencies
- Scan for invalid or leaked information in comments
- Identify code duplication
- Check documentation drift
- Generate comprehensive audit report
- Report back with quality metrics and recommended fixes

The agent has access to all necessary tools and will handle the entire code audit workflow autonomously.
