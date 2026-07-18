# tech-debt-collector

Evidence-gated tech debt and software bloat detection with concrete remediation actions.

---

## Synopsis

=== "Claude Code"

    ```bash
    /tech-debt-collector <SCOPE> [LENS]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-tech-debt-collector <SCOPE> [LENS]
    ```

## Description

The `tech-debt-collector` command finds tech debt and software bloat in a target scope and reports only findings that survive an explicit refutation attempt. A scout agent discovers candidate signals, the orchestrator clusters them by root cause and ranks them by materiality, and the admitted leads are framed as refutation hypotheses ("try to refute this claim" — hidden consumers, dynamic dispatch, protected obligations, semantic differences) and validated by the hypothesis-tester agent. Only claims that survive validation at sufficient confidence are promoted.

The workflow is **analysis-only**: it never edits source code or project state. Each finding ships with a concrete remediation action and a rollback plan for you to apply manually.

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCOPE` | Yes | — | Target to analyze: project root, file path, branch name, or PR diff |
| `LENS` | No | `unused-code` | Primary detection pattern: `unused-code`, `over-abstraction`, `redundancy`, `speculative-generalization` |

## How Findings Are Gated

Signals are never verdicts: low usage, no static callers, or a single implementation only nominate a candidate — they never conclude it. Every finding carries an ordinal confidence tier:

| Tier | Meaning |
|------|---------|
| **C1** | Speculative — a smell or unvalidated conjecture |
| **C2** | Provisional — supporting evidence exists, but a decision-critical source is missing |
| **C3** | Supported — scope covered, counterevidence searched, no known contradiction |
| **C4** | Well-established — independent evidence converges and the claim survived refutation |

Hard caps keep confidence honest: a usage-based claim without runtime telemetry or a complete static reference proof caps at C2, as does unchecked dynamic dispatch. **Only C3+ leads become findings.** C1–C2 leads are routed to a *Needs Measurement* queue with the evidence that would raise them; refuted leads land in a *Retain Register* documenting why they were kept.

## Output

**Location:** `.rp1/work/features/tech-debt-collector/report.md`

The report contains up to **5 findings** ranked by materiality — **0 findings is a valid, successful outcome** on a healthy target, never padded. Each finding includes the atomic claim, exact sites, burden signal in natural units, confidence tier, remediation steps, and a rollback plan. The report also includes the Needs Measurement queue, the Retain Register, and a methodology section with lead counts at each phase.

## Workflow Phases

| Phase | What Happens |
|-------|-------------|
| **Scoping** | Resolve and validate the target (project, file, branch, or PR diff); unresolvable targets fail closed |
| **Scouting** | 1–3 scout dispatches return structured leads (claim, sites, burden, safety flags, usage evidence) |
| **Validating** | Leads clustered by root cause, ranked by materiality; top ~8 framed as refutation hypotheses and validated by hypothesis-tester |
| **Reporting** | Survivors promoted through the C3+ gate; report written and registered with the Arcade |

## Examples

### Audit the Whole Project

=== "Claude Code"

    ```bash
    /tech-debt-collector project
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-tech-debt-collector project
    ```

### Check a PR Diff for Incoming Bloat

PR scopes are resolved through the GitHub CLI (`gh`), which must be installed and authenticated.

=== "Claude Code"

    ```bash
    /tech-debt-collector "PR #128" speculative-generalization
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-tech-debt-collector "PR #128" speculative-generalization
    ```

### Focus a Module on Redundancy

=== "Claude Code"

    ```bash
    /tech-debt-collector src/services/ redundancy
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-tech-debt-collector src/services/ redundancy
    ```

## Related Commands

- [`code-audit`](code-audit.md) — broad pattern-consistency and maintainability audit (quality findings without removal recommendations)
- [`validate-hypothesis`](validate-hypothesis.md) — the refutation engine this workflow reuses for lead validation
- [`code-investigate`](code-investigate.md) — root-cause investigation for a specific known bug
