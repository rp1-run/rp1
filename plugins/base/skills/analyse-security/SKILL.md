---
name: analyse-security
description: "Performs thorough security validation of features including vulnerability scans, authentication/authorization verification, compliance assessment, and penetration testing."
metadata:
  version: 2.0.0
  tags:
    - security
    - analysis
    - review
    - testing
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-base:security-validator"
---

# Security Validator

This command invokes the **security-validator** sub-agent for comprehensive security analysis.

Invoke the security-validator agent:

{% dispatch_agent "rp1-base:security-validator" %}

The agent will:

- Auto-detect and run available security scanning tools
- Verify authentication and authorization implementation
- Check input validation and data protection
- Scan for vulnerabilities (SQL injection, XSS, etc.)
- Audit dependency security
- Assess compliance with security standards
- Generate security validation report
- Report back with vulnerability summary and recommendations

The agent has access to all necessary tools and will handle the entire security validation workflow autonomously.
