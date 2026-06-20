---
scope: workRoot
path_pattern: "birds-eye/{YYYY-MM-DD}-{PROJECT_SLUG}.md"
producer: project-documenter
type: document
description: "3-tier/9-section project overview artifact generated from KB + codebase by /project-birds-eye-view. Tier 1 Orientation (TL;DR), Tier 2 Five Views (§1–§5), Tier 3 Working In It (§6–§9), plus conditional Reflexion appendix. Per-claim provenance in hidden HTML comments. Snapshot metadata frontmatter with 9-section coverage tuple. Path uses date prefix and project slug with n+1 dedup — registration MUST use the producer's resolved OUTPUT_PATH, not this pattern, because dedup suffixes (-2, -3, …) are assigned at write time."
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
  total: 9
  conditional_emitted: {CONDITIONAL_EMITTED}
  conditional_possible: 3
  gaps: {GAP_COUNT}
snapshot_source_of_truth: "{KB_ROOT}/"
snapshot_regenerate_command: "/rp1-base:project-birds-eye-view"
---

# {Project Name} — Bird's-Eye View

## TL;DR

- {What it is}
- {Who uses it}
- {How to run it}
- {Where to look first}
- {What's weird / what will surprise you}

---

## 1. Purpose and System Context

{2–4 sentences merging business context and system context. Answers: why does this exist, what problem does it solve, who/what interacts with it.} <!-- prov: [KB|CODE|INFER|GAP] -->

<!-- diagram: flowchart | nodes: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart TD
    %% System context diagram — external actors and systems
```

## 2. Building Blocks

{2–3 sentences describing major components/containers and their relationships.} <!-- prov: [KB|CODE|INFER|GAP] -->

<!-- diagram: flowchart | nodes: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart TD
    %% Component / building-block diagram
```

## 3. Runtime Flows

{2–3 sentences framing the key scenarios (1–3).} <!-- prov: [KB|CODE|INFER|GAP] -->

<!-- diagram: sequenceDiagram | participants: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
sequenceDiagram
    %% Hot-path sequence diagram — single most load-bearing flow
```

## 4. Data Model [conditional]

{Emit only if schema / ER / entity evidence exists. Otherwise omit entirely and record in §9 Risks & Gaps: "Omitted §4 Data Model — no schema or entity evidence".}

{Brief description of core entities and relationships.} <!-- prov: [KB|CODE|INFER|GAP] -->

<!-- diagram: erDiagram | entities: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
erDiagram
    %% Entity-relationship diagram
```

## 5. Integration Surface [conditional]

{Emit only if the project exposes or consumes significant external interfaces (APIs, events, CLI commands, protocol surfaces). Otherwise omit entirely and record in §9 Risks & Gaps: "Omitted §5 Integration Surface — no significant external interface evidence".}

{2–3 sentences on public integration points.} <!-- prov: [KB|CODE|INFER|GAP] -->

| Endpoint / command / event | Owning component | Direction | Purpose |
|----------------------------|------------------|-----------|---------|
| `{surface}` | `{component}` | `{in\|out\|both}` | `{purpose}` | <!-- prov: [KB|CODE] -->

<!-- diagram: flowchart | nodes: N | citations: [KB:…] [CODE:…] | confidence: Supported -->
```mermaid
flowchart LR
    %% Integration surface diagram — external boundaries and flows
```

---

## 6. Tech Stack

{2–3 sentences introducing the stack and rationale.} <!-- prov: [KB|CODE|INFER|GAP] -->

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| {name} | {purpose} | {rationale} | <!-- prov: [KB|CODE|GAP] -->

## 7. Getting Started

{Ordered steps: install → run locally → run tests → ship a first change. Source: README, package scripts, justfile, Makefile.}

1. {Step} <!-- prov: [KB|CODE] -->

## 8. Key Decisions

{Bulleted list of architectural and design decisions.}

- **{Decision title}** — {one-line summary} <!-- prov: [KB: charter.md|ADR|PRD] --> OR <!-- prov: [GAP — no decision note] -->

## 9. Risks & Gaps

{First-class risk register. Collects known issues, technical debt, observability gaps, and tracks omitted conditional sections.}

- **Known issues**: {description} <!-- prov: [KB|CODE] -->
- **Technical debt**: {description} <!-- prov: [KB] -->
- **Observability gaps**: {logs, traces, dashboards, oncall status} <!-- prov: [KB|CODE|GAP] -->
- **Top gaps that would most improve the overview**: {list with "next read" pointers}
- **Omitted conditional sections**: {e.g., "Omitted §4 Data Model — no schema or entity evidence" / "Omitted §5 Integration Surface — …"}

---

## Appendix A: Reflexion [conditional]

{Emit only when ≥1 divergence between KB claims and code observations is found. Otherwise omit entirely and record in §9 Risks & Gaps: "Omitted Appendix A Reflexion — no divergences found".}

### Convergences

- {KB claim ↔ code observation} <!-- prov: [KB:…] + [CODE:…] -->

### Divergences

- **{KB claim}** does not match **{code observation}**. Recommended follow-up: {action}. <!-- prov: [KB:…] vs [CODE:…] -->

### Absences

- {KB claim with no code evidence} <!-- prov: [KB:…] + [GAP:…] -->
