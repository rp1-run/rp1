# rp1 Skill Catalog

> Auto-generated from skill frontmatter metadata. Do not edit manually.

## Development

> **Suggest when**: User starts a new feature, describes a change, or needs to scaffold a project

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/task` | base | Discover and manage queued tasks for agent execution | `OPERATION` |  |  |  |
| `/bootstrap` | dev | Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development. | `PROJECT_NAME` |  |  |  |
| `/build` | dev | End-to-end feature workflow (requirements -> planning -> implementation -> release) in a single command. | `FEATURE_ID`, `REQUIREMENTS`, `PHASE_PLAN_PATH`, `PHASE_ID`, `AFK`, `GIT_COMMIT`, `GIT_PUSH`, `GIT_PR` | Yes | resumable | `FEATURE_ID` |
| `/build-fast` | dev | Quick-iteration development for small/medium scope changes with persistent artifacts and optional review. | `DEVELOPMENT_REQUEST`, `AFK`, `CONFIRM_PLAN`, `REVIEW`, `GIT_COMMIT`, `GIT_PUSH` | Yes | fresh |  |
| `/feature-archive` | dev | Archives a completed feature to the archives directory with optional documentation validation. | `FEATURE_ID` |  |  |  |
| `/feature-edit` | dev | Incorporates mid-stream changes into feature documentation with validation and propagation. | `FEATURE_ID`, `EDIT_DESCRIPTION` |  |  |  |
| `/feature-unarchive` | dev | Restores an archived feature from the archives directory back to the active features directory. | `FEATURE_ID` |  |  |  |
| `/phase-plan` | dev | Decompose a completed PRD or oversized requirements artifact into durable delivery phases. | `SOURCE`, `UPDATE_CONTEXT`, `AFK` | Yes | fresh |  |
| `/speedrun` | dev | Interactive speedrun loop for small, low-risk changes. Delegates each request to a general sub-agent. Redirects larger work to /build-fast or /build. | `REQUEST`, `AFK` | Yes | fresh |  |

## Investigation

> **Suggest when**: User is debugging, examining errors, or testing a design hypothesis

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/code-investigate` | dev | Systematic investigation of bugs and issues to identify root causes through evidence-based analysis, hypothesis testing, and comprehensive documentation without permanent code changes. | `PROBLEM_STATEMENT`, `ISSUE_ID` |  |  |  |
| `/validate-hypothesis` | dev | Validate design hypotheses via code experiments, codebase analysis, and external research. | `FEATURE_ID` |  |  |  |

## Quality

> **Suggest when**: User finishes implementation and needs hygiene checks, audits, or comment cleanup

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/code-comments` | base | Extract comment locations from code files for analysis. Use when cleaning comments, auditing code documentation, or analyzing comment patterns. Supports Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, Ruby, PHP, Shell scripts. Trigger terms - comments, extract comments, code comments, comment analysis, documentation audit, comment cleanup. |  |  |  |  |
| `/code-audit` | dev | Analyzes implemented code for pattern consistency, maintainability, code duplication, comment quality, and documentation drift. | `FEATURE_ID`, `AUDIT_SCOPE`, `PATTERN_STRICTNESS` |  |  |  |
| `/code-check` | dev | Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback. | `FEATURE_ID`, `TEST_SCOPE`, `COVERAGE_TARGET` |  |  |  |
| `/code-clean-comments` | dev | Systematically removes unnecessary comments from a user scope by first resolving it into a durable change manifest. | `SCOPE`, `CODE_ROOT` |  |  |  |

## Review

> **Suggest when**: User prepares a PR, receives review feedback, or needs visual diff understanding

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/address-pr-feedback` | dev | Unified PR feedback workflow - collect, triage, and fix review comments in a single command. | `PR_IDENTIFIER`, `FEATURE_ID`, `AFK` |  |  |  |
| `/arcade-collab` | dev | Structured guidance for agents to read, classify, and act on user feedback (annotations and direct file edits) from the Arcade. |  |  |  |  |
| `/pr-review` | dev | Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication. | `TARGET`, `BASE_BRANCH`, `SKIP_VISUAL` | Yes | fresh |  |
| `/pr-visual` | dev | Transform pull request diffs into Mermaid diagrams for visual code review and change understanding. | `PR_BRANCH`, `BASE_BRANCH`, `REVIEW_DEPTH`, `FOCUS_AREAS` | Yes | fresh |  |
| `/pr-walkthrough` | dev | Generate an evidence-grounded markdown walkthrough for a pull request. | `TARGET`, `BASE_BRANCH` | Yes | fresh |  |

## Documentation

> **Suggest when**: User writes, updates, or previews docs, diagrams, or project overviews

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/fix-mermaid` | base | Validates and repairs mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax, and auto-repairs common errors. | `FILE_PATH` |  |  |  |
| `/generate-user-docs` | base | Synchronizes user-facing documentation with the current knowledge base through validate -> stale gate -> scan -> approval -> process orchestration. |  | Yes | fresh |  |
| `/markdown-preview` | base | Generate browser-viewable HTML previews from markdown, plain text, and Mermaid diagrams. Auto-validates diagrams, applies professional styling, and opens in default browser. Use when agents need to preview documentation, visualizations, or formatted content. |  |  |  |  |
| `/mermaid` | base | Create, validate, and troubleshoot Mermaid.js diagrams. Use when generating flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, state diagrams, or any visualization. Handles diagram validation, syntax errors, broken diagrams, and automatic repair. Trigger terms - mermaid, diagram, flowchart, sequence, class diagram, ER diagram, entity relationship, state machine, gantt, visualization, chart, graph. |  |  |  |  |
| `/project-birds-eye-view` | base | Generates arc42/C4-aligned project overview artifacts with per-claim provenance, snapshot metadata, and Arcade-visible workflow tracking. | `PROJECT_CONTEXT`, `FOCUS_AREAS` | Yes | fresh |  |
| `/write-content` | base | Interactive prompt to help create polished technical documents through clarifying questions and structured writing workflows. |  |  |  |  |

## Knowledge

> **Suggest when**: User needs codebase context, KB is stale, or wants KB templates

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/guide` | base | Ask about rp1 capabilities, discover skills, and get workflow guidance. | `QUESTION` |  |  |  |
| `/knowledge-build` | base | Orchestrates parallel KB generation using spatial analysis and a map-reduce architecture with incremental and feature-learning modes. | `FEATURE_ID` | Yes | fresh |  |
| `/knowledge-load` | base | Ingests and prepares codebase documentation, builds internal knowledge graphs, and creates optimized context representations for downstream analysis tasks. | `LOAD_MODE` |  |  |  |
| `/self-update` | base | Update rp1 and run the full post-update lifecycle. |  |  |  |  |

## Strategy

> **Suggest when**: User faces architectural decisions, security concerns, or needs deep research

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/analyse-security` | base | Performs tracked, evidence-bounded security posture assessment for a project, sub-directory, module, concept, or feature topic with standards mapping and registered report output. | `TOPIC`, `FEATURE_ID`, `SECURITY_SCOPE`, `COMPLIANCE_FRAMEWORK` | Yes | fresh |  |
| `/deep-research` | base | Autonomous deep research on codebases and technical topics with structured report output via map-reduce explorer architecture. | `RESEARCH_TOPIC` | Yes | fresh |  |
| `/socratic-duel` | base | Run a bounded, evidence-driven two-agent debate into a separate rp1 debate artifact with backend locks only. | `TARGET_PATH`, `TOPIC`, `PARTICIPANT_NAME`, `MODEL_ID` | Yes | resumable | `TARGET_PATH`, `TOPIC` |
| `/socratic-duel-run` | base | Run Socratic Duel through two participant subagents while the launcher only coordinates and reports. | `TARGET_PATH`, `TOPIC`, `MODEL_ID` | Yes | fresh |  |
| `/strategize` | base | Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, complexity, and business objectives with quantified trade-offs. |  |  |  |  |

## Planning

> **Suggest when**: User plans a project, audits a PRD, or manages blueprint lifecycle

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/blueprint` | dev | Guided wizard for project vision via two-tier docs (charter + PRDs) with stateless interview loops. | `PRD_NAME`, `EXTRA_CONTEXT` | Yes | fresh |  |
| `/blueprint-archive` | dev | Archives a completed PRD to the archives directory with associated features and closure summary. | `PRD_NAME` |  |  |  |
| `/blueprint-audit` | dev | Audits a PRD against implementation status and guides lifecycle decisions. | `PRD_NAME` |  |  |  |

## Prompt

> **Suggest when**: User authors, rewrites, or evaluates agent prompts

| Skill | Plugin | Description | Key Args | Workflow | Run Policy | Identity Args |
|-------|--------|-------------|----------|----------|------------|---------------|
| `/prompt-writer` | base | Write maximally terse agent prompts from scratch. Use when creating new agent specs, command prompts, or instruction sets. Teaches structure-first composition with compression-by-default patterns. Extended with constitutional governance, epistemic stance selection, and a six-stage prompt pipeline. |  |  |  |  |
