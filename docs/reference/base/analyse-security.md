# analyse-security

Performs tracked, evidence-bounded security posture assessment for a feature or target. It maps observations to modern security standards, records scanner coverage and gaps, and writes a canonical report artifact.

---

## Synopsis

=== "Claude Code"

    ```bash
    /analyse-security FEATURE_ID=<feature-id> [SECURITY_SCOPE=full] [COMPLIANCE_FRAMEWORK=""]
    ```

=== "OpenCode"

    ```bash
    /rp1-base-analyse-security FEATURE_ID=<feature-id> [SECURITY_SCOPE=full] [COMPLIANCE_FRAMEWORK=""]
    ```

## Description

The `analyse-security` command starts a tracked workflow and delegates the assessment to the `security-validator` agent. The workflow resolves canonical project directories, passes the knowledge base, work root, code root, and run ID to the validator, and registers one report artifact in Arcade.

The assessment uses NIST CSF 2.0 as the posture spine and maps findings to relevant standards such as OWASP ASVS, OWASP Top 10, OWASP API Top 10, CIS Controls and Benchmarks, NIST SSDF, SLSA, OpenSSF Scorecard, NIST SP 800-63 identity guidance, privacy controls, MITRE ATT&CK/D3FEND, NIST AI RMF, and OWASP LLM/agentic risk guidance when applicable.

It analyzes:

- **Vulnerability Scanning**: SQL injection, XSS, CSRF, and OWASP Top 10
- **Authentication**: Token handling, session management, password policies
- **Authorization**: Access control, permission checks, role validation
- **Input Validation**: Data sanitization, type checking, boundary validation
- **Dependency Security**: Known vulnerabilities in dependencies
- **Data Protection**: Encryption, secrets management, data exposure
- **Infrastructure and Supply Chain**: IaC, containers, CI/CD, SBOM/provenance, and build integrity
- **Detection and Response**: Logging, alerting, incident handoff, and recovery evidence
- **AI-Agent Risk**: Prompt injection, tool overreach, untrusted context, and data exfiltration when AI workflows are present

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FEATURE_ID` | Yes | - | Feature identifier or stable target slug. Used in the report path. |
| `SECURITY_SCOPE` | No | `full` | Assessment scope: `full`, `application`, `api`, `infrastructure`, `supply-chain`, `identity-privacy`, or `ai-agent`. |
| `COMPLIANCE_FRAMEWORK` | No | empty | Optional framework focus, such as `OWASP ASVS`, `NIST CSF`, `SOC 2`, `PCI DSS`, `CIS`, or a project-specific control set. |

## Output

The command produces one registered security posture report:

**Location:** `.rp1/work/security/{FEATURE_ID}/report.md`

**Artifact path:** `security/{FEATURE_ID}/report.md` with `storageRoot: "work_dir"`

**Contents:**

| Section | Description |
|---------|-------------|
| Executive Summary | Posture, release recommendation, confidence, and evidence boundary |
| Scope and Assumptions | Assets in scope, exclusions, runtime access, credentials, and assumptions |
| Standards Mapping | Control-family mapping across NIST, OWASP, CIS, SSDF/SLSA, privacy, identity, and AI risk |
| Attack Surface Inventory | Entry points, trust boundaries, exposed data/capabilities, and evidence |
| Evidence Register | Source, scanner, runtime, KB, and assumption evidence with limitations |
| Tool Matrix | Scanner commands, versions, exit status, findings, and unavailable-tool gaps |
| Coverage Matrix | What was checked, what was not, result, confidence, and refutation condition |
| Findings | Severity, priority, confidence, controls, abuse case, remediation, and verification |
| POA&M | Owner/action/SLO-oriented remediation plan |
| Release Rationale | Decision, conditions, residual risk, and risk acceptance requirements |
| Verification Plan | Follow-up checks and closure evidence |

## Severity Levels

Findings separate technical severity from contextual priority and confidence:

| Severity | Description | Typical Action |
|----------|-------------|----------------|
| **Critical** | Immediate exploitation risk | Fix immediately |
| **High** | Significant vulnerability | Fix within 1 week |
| **Medium** | Moderate risk | Fix within 1 month |
| **Low** | Minor issue | Fix when convenient |
| **Informational** | Best practice suggestion or evidence note | Consider implementing |

| Priority | Description |
|----------|-------------|
| **P0** | Blocking or urgent remediation |
| **P1** | Required before release or with explicit exception |
| **P2** | Planned remediation |
| **P3** | Backlog hardening |

## Examples

### Full Security Assessment

=== "Claude Code"

    ```bash
    /analyse-security FEATURE_ID=checkout-hardening
    ```

=== "OpenCode"

    ```bash
    /rp1-base-analyse-security FEATURE_ID=checkout-hardening
    ```

### API-Focused Assessment

=== "Claude Code"

    ```bash
    /analyse-security FEATURE_ID=public-api-v2 SECURITY_SCOPE=api COMPLIANCE_FRAMEWORK="OWASP API Top 10 2023"
    ```

=== "OpenCode"

    ```bash
    /rp1-base-analyse-security FEATURE_ID=public-api-v2 SECURITY_SCOPE=api COMPLIANCE_FRAMEWORK="OWASP API Top 10 2023"
    ```

**Example output:**
```
Security assessment complete

Summary:
- Recommendation: CONDITIONAL APPROVAL
- Confidence: Medium
- Critical: 0
- High: 1
- Medium: 3
- Coverage gaps: 2

High Priority Findings:
1. [HIGH/P1/MEDIUM] Hardcoded API key in config/settings.py
   - Line 45: API_KEY = "sk-..."
   - Recommendation: Move to environment variables

2. [MEDIUM/P2/HIGH] SQL query lacks parameterization evidence
   - File: src/db/queries.py:123
   - Recommendation: Use parameterized queries

Full report: .rp1/work/security/public-api-v2/report.md
```

## Security Tools Integration

The validator auto-detects and runs tools that are already installed. It does not install missing tools. Missing tools are recorded as coverage gaps rather than treated as passing evidence.

| Tool Class | Examples |
|------------|----------|
| SAST | `semgrep`, `bandit`, `gosec`, language-native analyzers |
| Dependency / SCA | `npm audit`, `bun audit`, `pip-audit`, `cargo audit`, `govulncheck`, `bundler-audit` |
| Secrets | `gitleaks`, `trufflehog`, `detect-secrets`, targeted pattern scans |
| IaC / Container | `checkov`, `tfsec`, `trivy`, `kubesec` |
| SBOM / Provenance | `syft`, `grype`, OpenSSF Scorecard, SLSA metadata checks |
| DAST / API | Safe local runtime checks only when a runnable target exists |
| AI / Prompt | Manual or tool-assisted checks for prompt injection, tool permissions, and data exfiltration |

!!! tip "Tool Installation"
    For more comprehensive scans, install security tools in your environment. The command works without them but provides deeper analysis when they're available.

## Requirements

!!! warning "Prerequisite"
    The knowledge base must exist before the dispatcher invokes the validator. Run [`knowledge-build`](knowledge-build.md) first if `.rp1/context/` has not been generated.

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base
- [`strategize`](strategize.md) - Strategic analysis including security considerations

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How agents understand your codebase
