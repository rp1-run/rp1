# rp1 Skill Catalog

> Auto-generated from skill frontmatter metadata. Do not edit manually.

## Development

> **Suggest when**: User starts a new feature, describes a change, or needs to scaffold a project

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/task` | base | Discover and manage queued tasks for agent execution |
| `/bootstrap` | dev | Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development. |
| `/build` | dev | End-to-end feature workflow (requirements -> planning -> implementation -> release) in a single command. |
| `/build-fast` | dev | Quick-iteration development for small/medium scope changes with persistent artifacts and optional review. |
| `/feature-archive` | dev | Archives a completed feature to the archives directory with optional documentation validation. |
| `/feature-edit` | dev | Incorporates mid-stream changes into feature documentation with validation and propagation. |
| `/feature-unarchive` | dev | Restores an archived feature from the archives directory back to the active features directory. |
| `/phase-plan` | dev | Decompose a completed PRD or oversized requirements artifact into durable delivery phases. |
| `/speedrun` | dev | Interactive speedrun loop for small, low-risk changes. Delegates each request to a general sub-agent. Redirects larger work to /build-fast or /build. |

## Investigation

> **Suggest when**: User is debugging, examining errors, or testing a design hypothesis

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/code-investigate` | dev | Systematic investigation of bugs and issues to identify root causes through evidence-based analysis, hypothesis testing, and comprehensive documentation without permanent code changes. |
| `/validate-hypothesis` | dev | Validate design hypotheses via code experiments, codebase analysis, and external research. |

## Quality

> **Suggest when**: User finishes implementation and needs hygiene checks, audits, or comment cleanup

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/code-comments` | base | Extract comment locations from code files for analysis. Use when cleaning comments, auditing documentation, or analyzing comment patterns across languages. |
| `/code-audit` | dev | Analyzes implemented code for pattern consistency, maintainability, code duplication, comment quality, and documentation drift. |
| `/code-check` | dev | Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback. |
| `/code-clean-comments` | dev | Systematically removes unnecessary comments from a user scope by first resolving it into a durable change manifest. |

## Review

> **Suggest when**: User prepares a PR, receives review feedback, or needs visual diff understanding

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/address-pr-feedback` | dev | Unified PR feedback workflow - collect, triage, and fix review comments in a single command. |
| `/arcade-collab` | dev | Structured guidance for agents to read, classify, and act on user feedback (annotations and direct file edits) from the Arcade. |
| `/pr-review` | dev | Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication. |
| `/pr-stack` | dev | Plan and execute splitting a large PR or branch into a reviewable stacked PR sequence. |
| `/pr-visual` | dev | Transform pull request diffs into Mermaid diagrams for visual code review and change understanding. |
| `/pr-walkthrough` | dev | Generate an evidence-grounded markdown walkthrough for a pull request. |

## Documentation

> **Suggest when**: User writes, updates, or previews docs, diagrams, or project overviews

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/fix-mermaid` | base | Validates and repairs mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax, and auto-repairs common errors. |
| `/generate-user-docs` | base | Synchronizes user-facing documentation with the current knowledge base through validate -> stale gate -> scan -> approval -> process orchestration. |
| `/markdown-preview` | base | Generate browser-viewable HTML previews from markdown, plain text, and Mermaid diagrams. Auto-validates, styles, and opens in browser. |
| `/mermaid` | base | Create, validate, and repair Mermaid.js diagrams. Use when generating flowcharts, sequence, class, ER, state, or Gantt diagrams, or any visualization. |
| `/project-birds-eye-view` | base | Generates arc42/C4-aligned project overview artifacts with per-claim provenance, snapshot metadata, and Arcade-visible workflow tracking. |
| `/write-content` | base | Interactive prompt to help create polished technical documents through clarifying questions and structured writing workflows. |

## Knowledge

> **Suggest when**: User needs codebase context, KB is stale, or wants KB templates

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/guide` | base | Ask about rp1 capabilities, discover skills, and get workflow guidance. |
| `/knowledge-build` | base | Orchestrates parallel KB generation using spatial analysis and a map-reduce architecture with incremental and feature-learning modes. |
| `/note` | base | Capture session context as a structured, frontmatter-rich markdown note under .rp1/work/notes/ with auto-maintained index and log. |
| `/self-update` | base | Update rp1 and run the full post-update lifecycle. |

## Strategy

> **Suggest when**: User faces architectural decisions, security concerns, or needs deep research

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/analyse-security` | base | Performs tracked, evidence-bounded security posture assessment for a project, sub-directory, module, concept, or feature topic with standards mapping and registered report output. |
| `/deep-research` | base | Autonomous deep research on codebases and technical topics with structured report output via map-reduce explorer architecture. |
| `/socratic-duel` | base | Run a bounded, evidence-driven two-agent debate into a separate rp1 debate artifact with backend locks only. |
| `/socratic-duel-run` | base | Run Socratic Duel through two participant subagents while the launcher only coordinates and reports. |
| `/strategize` | base | Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, complexity, and business objectives with quantified trade-offs. |

## Planning

> **Suggest when**: User plans a project, audits a PRD, or manages blueprint lifecycle

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/blueprint` | dev | Guided wizard for project vision via two-tier docs (charter + PRDs) with stateless interview loops. |
| `/blueprint-archive` | dev | Archives a completed PRD to the archives directory with associated features and closure summary. |
| `/blueprint-audit` | dev | Audits a PRD against implementation status and guides lifecycle decisions. |

## Prompt

> **Suggest when**: User authors, rewrites, or evaluates agent prompts

| Skill | Plugin | Description |
|-------|--------|-------------|
| `/prompt-writer` | base | Write maximally terse agent prompts from scratch. Use when creating agent specs, command prompts, or instruction sets with constitutional governance. |
