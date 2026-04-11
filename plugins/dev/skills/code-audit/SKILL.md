---
name: code-audit
description: "Analyzes implemented code for pattern consistency, maintainability, code duplication, comment quality, and documentation drift."
metadata:
  category: quality
  is_workflow: false
  version: 2.0.0
  tags:
    - analysis
    - review
    - code
    - documentation
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      default: ""
      description: "Optional feature identifier to focus the audit"
    - name: AUDIT_SCOPE
      type: string
      required: false
      default: "full"
      description: "Optional audit scope"
    - name: PATTERN_STRICTNESS
      type: enum
      required: false
      default: "standard"
      description: "Pattern strictness level"
      enum_values:
        - "relaxed"
        - "standard"
        - "strict"
  sub_agents:
    - "rp1-dev:code-auditor"
---

# Code Quality Auditor

This command invokes the **code-auditor** sub-agent for pattern and quality analysis.

Invoke the code-auditor agent:

{% dispatch_agent "rp1-dev:code-auditor" %}
FEATURE_ID: {FEATURE_ID}
AUDIT_SCOPE: {AUDIT_SCOPE}
PATTERN_STRICTNESS: {PATTERN_STRICTNESS}
KB_ROOT: {kbRoot}
{% enddispatch_agent %}
The agent will:
- Discover existing project patterns and conventions
- Detect pattern violations and inconsistencies
- Scan for invalid or leaked information in comments
- Identify code duplication
- Check documentation drift
- Generate comprehensive audit report
- Report back with quality metrics and recommended fixes

The agent has access to all necessary tools and will handle the entire code audit workflow autonomously.
