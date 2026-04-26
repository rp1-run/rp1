---
scope: workRoot
path_pattern: "birds-eye/{YYYY-MM-DD}-{PROJECT_SLUG}.md"
producer: project-documenter
type: document
description: "arc42/C4-aligned project overview artifact generated from KB + codebase by /project-birds-eye-view. 16 sections with per-claim provenance tags, snapshot metadata frontmatter, and conditional Reflexion appendix. Path uses date prefix and project slug with n+1 dedup — registration MUST use the producer's resolved OUTPUT_PATH, not this pattern, because dedup suffixes (-2, -3, …) are assigned at write time."
strictness: flexible
# No emit_hint: path_pattern is NOT safe to use directly for registration.
# The `/project-birds-eye-view` dispatcher (or any caller) MUST register with the
# OUTPUT_PATH returned by the project-documenter sub-agent, which includes any
# n+1 dedup suffix that was actually assigned at write time. See
# plugins/base/skills/project-birds-eye-view/SKILL.md for the canonical call.
---
---
snapshot_generated: "{YYYY-MM-DD}"
snapshot_git_sha: "{GIT_SHA}"
snapshot_code_root: "{CODE_ROOT}"
snapshot_kb_root: "{KB_ROOT}"
snapshot_kb_files: "{KB_FILES_WITH_VERSIONS}"
snapshot_coverage:
  filled: {FILLED}
  total: {TOTAL}
  conditional_emitted: {CONDITIONAL_EMITTED}
  gaps: {GAP_COUNT}
snapshot_source_of_truth: "{KB_ROOT}/"
snapshot_regenerate_command: "/rp1-base:project-birds-eye-view"
---

# {Project Name} — Bird's-Eye View

## 1. TL;DR for a new dev

- {What it is}
- {Who uses it}
- {How to run it}
- {Where to look first}
- {What's weird / what will surprise you}

## 2. Business context & purpose

{2–3 sentences with [KB|CODE|INFER|GAP] provenance tags per sentence. Answers: why does this exist, what problem does it solve, what is the core value proposition.}

## 3. System context (C4 L1)

{2–3 sentences describing external systems, users, integrations. Tagged.}

<!-- diagram: flowchart | nodes: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart TD
    %% System context diagram — external actors and systems
```

## 4. Containers / Building blocks (C4 L2)

{2–3 sentences describing major runtime containers and their relationships. Tagged.}

<!-- diagram: flowchart | nodes: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart TD
    %% Container / building-block diagram
```

## 5. Tech stack & rationale

{2–3 sentences introducing the stack. Tagged.}

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| {name} | {purpose} | `[KB|CODE|GAP]` tagged |

## 6. Runtime view — key scenarios (1–3)

{2–3 sentences framing the scenarios. Tagged.}

<!-- diagram: sequenceDiagram | participants: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
sequenceDiagram
    %% Hot-path sequence diagram — single most load-bearing flow
```

## 7. Data model [conditional]

{Emit only if schema / ER / entity evidence exists. Otherwise omit and record in §13 Risks: "Omitted §7 Data model — no schema or KB entity evidence".}

<!-- diagram: erDiagram | entities: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
erDiagram
    %% Entity-relationship diagram
```

## 8. API / interface surface

{2–3 sentences on major public surfaces. Tagged.}

| Endpoint / command / event | Owning component | Purpose |
|----------------------------|------------------|---------|
| `{surface}` | `{component}` | `{purpose}` |

## 9. Deployment & environments [conditional]

{Emit only if Dockerfile / compose / CI / IaC / deployment doc evidence exists. Otherwise omit and record in §13.}

<!-- diagram: flowchart | deployment_units: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart LR
    %% Deployment topology
```

## 10. Architecture decisions

{Always emitted. Bulleted list; each item cites `[KB: charter.md|ADR|PRD]` or `[GAP — no decision note]`.}

- **{Decision title}** — {one-line summary}. `[KB: …]` OR `[GAP — …]`

## 11. Getting started

{Ordered steps: install → run locally → run tests → ship a first change. Source: README, package scripts, justfile, Makefile. Every step tagged.}

1. {Step} — `[KB|CODE: …]`

## 12. Debugging & observability

{Logs, traces, dashboards, oncall. Likely many `[GAP]` on first generation — that's a finding, not a failure. Tagged.}

## 13. Risks, gaps, and what isn't covered

{First-class risk register. Tagged.}

- **Known issues**: `[KB|CODE: …]`
- **Technical debt**: `[KB: …]`
- **Top `[GAP]`s that would most improve the overview**: list with "next read" pointers
- **Omitted conditional sections**: `Omitted §7 … — <reason>` / `Omitted §9 … — <reason>`

## 14. Glossary

{Domain terms extracted from `concept_map.md` or inferred from code. Tagged.}

| Term | Definition | Source |
|------|------------|--------|
| `{term}` | {definition} | `[KB|CODE: …]` |

## 15. Appendix: Intended vs observed architecture [conditional]

{Emit only when ≥1 divergence found. Otherwise omit and record in §13.}

### Convergences

- {KB claim ↔ code observation} — `[KB: …]` + `[CODE: …]`

### Divergences

- **{KB claim}** does not match **{code observation}** — `[KB: …]` vs `[CODE: …]`. Recommended follow-up: {action}.

### Absences

- {KB claim with no code evidence} — `[KB: …]` + `[GAP: …]`
