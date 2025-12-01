---
name: analyse-security
version: 2.0.0
description: Performs thorough security validation of features including vulnerability scans, authentication/authorization verification, compliance assessment, and penetration testing.
tags:
  - security
  - analysis
  - review
  - testing
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Security Validator

This command invokes the **security-validator** sub-agent for comprehensive security analysis.

Use the Task tool to invoke the security-validator agent:

```
subagent_type: rp1-base:security-validator
```

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
