# analyse-security

Performs comprehensive security validation including vulnerability scanning, authentication verification, and compliance assessment.

---

## Synopsis

=== "Claude Code"

    ```bash
    /analyse-security
    ```

=== "OpenCode"

    ```bash
    /rp1-base/analyse-security
    ```

## Description

The `analyse-security` command performs thorough security validation of your codebase. It automatically detects and runs available security scanning tools, verifies authentication and authorization implementations, and checks for common vulnerabilities.

The command analyzes:

- **Vulnerability Scanning**: SQL injection, XSS, CSRF, and OWASP Top 10
- **Authentication**: Token handling, session management, password policies
- **Authorization**: Access control, permission checks, role validation
- **Input Validation**: Data sanitization, type checking, boundary validation
- **Dependency Security**: Known vulnerabilities in dependencies
- **Data Protection**: Encryption, secrets management, data exposure

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Root directory for output |

## Output

The command produces a security validation report:

**Location:** `.rp1/work/security-report.md`

**Contents:**

| Section | Description |
|---------|-------------|
| Executive Summary | Overall security posture and risk level |
| Vulnerability Findings | Issues found with severity ratings |
| Authentication Analysis | Auth implementation review |
| Authorization Analysis | Access control review |
| Dependency Audit | Vulnerable packages identified |
| Recommendations | Prioritized remediation steps |

## Severity Levels

Findings are classified by severity:

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **Critical** | Immediate exploitation risk | Fix immediately |
| **High** | Significant vulnerability | Fix within 1 week |
| **Medium** | Moderate risk | Fix within 1 month |
| **Low** | Minor issue | Fix when convenient |
| **Info** | Best practice suggestion | Consider implementing |

## Examples

### Run Security Analysis

=== "Claude Code"

    ```bash
    /analyse-security
    ```

=== "OpenCode"

    ```bash
    /rp1-base/analyse-security
    ```

**Example output:**
```
✅ Security Analysis Complete

Summary:
- Overall Risk: MEDIUM
- Critical: 0
- High: 2
- Medium: 5
- Low: 8

High Priority Findings:
1. [HIGH] Hardcoded API key in config/settings.py
   - Line 45: API_KEY = "sk-..."
   - Recommendation: Move to environment variables

2. [HIGH] SQL query vulnerable to injection
   - File: src/db/queries.py:123
   - Recommendation: Use parameterized queries

Full report: .rp1/work/security-report.md
```

## Security Tools Integration

The command auto-detects and integrates with these tools when available:

| Tool | Language | Type |
|------|----------|------|
| `npm audit` | JavaScript | Dependency scanning |
| `pip-audit` | Python | Dependency scanning |
| `cargo audit` | Rust | Dependency scanning |
| `bandit` | Python | Static analysis |
| `semgrep` | Multi-language | Pattern matching |

!!! tip "Tool Installation"
    For more comprehensive scans, install security tools in your environment. The command works without them but provides deeper analysis when they're available.

## Requirements

!!! warning "Prerequisite"
    The knowledge base should exist for full context-aware analysis. Run [`knowledge-build`](knowledge-build.md) first for best results.

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base
- [`strategize`](strategize.md) - Strategic analysis including security considerations

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How agents understand your codebase
