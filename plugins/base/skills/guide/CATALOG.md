# rp1 Skill Catalog

> Auto-generated from skill frontmatter metadata. Do not edit manually.

## Development

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/bootstrap` | dev | Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development. |  |
| `/build` | dev | End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command. | Yes |
| `/build-fast` | dev | Quick-iteration development for small/medium scope changes with persistent artifacts and optional review. | Yes |
| `/feature-archive` | dev | Archives a completed feature to the archives directory with optional documentation validation. |  |
| `/feature-edit` | dev | Incorporates mid-stream changes into feature documentation with validation and propagation. |  |
| `/feature-unarchive` | dev | Restores an archived feature from the archives directory back to the active features directory. |  |
| `/speedrun` | dev | Interactive speedrun loop for small, low-risk changes. Delegates each request to a general sub-agent. Redirects larger work to /build-fast or /build. | Yes |
| `/task` | base | Discover and manage queued tasks for agent execution |  |

## Investigation

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/code-investigate` | dev | Systematic investigation of bugs and issues to identify root causes through evidence-based analysis, hypothesis testing, and comprehensive documentation without permanent code changes. |  |
| `/validate-hypothesis` | dev | Validate design hypotheses via code experiments, codebase analysis, and external research. |  |

## Quality

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/code-audit` | dev | Analyzes implemented code for pattern consistency, maintainability, code duplication, comment quality, and documentation drift. |  |
| `/code-check` | dev | Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback. |  |
| `/code-clean-comments` | dev | Systematically removes unnecessary comments from code using git-scoped file detection. |  |
| `/code-comments` | base | Extract comment locations from code files for analysis. Use when cleaning comments, auditing code documentation, or analyzing comment patterns. Supports Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, Ruby, PHP, Shell scripts. Trigger terms - comments, extract comments, code comments, comment analysis, documentation audit, comment cleanup. |  |

## Review

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/address-pr-feedback` | dev | Unified PR feedback workflow - collect, triage, and fix review comments in a single command. |  |
| `/arcade-collab` | dev | Structured guidance for agents to read, classify, and act on user feedback (annotations and direct file edits) from the Arcade. |  |
| `/pr-review` | dev | Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication. | Yes |
| `/pr-visual` | dev | Transform pull request diffs into Mermaid diagrams for visual code review and change understanding. |  |

## Documentation

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/fix-mermaid` | base | Validates and repairs mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax, and auto-repairs common errors. |  |
| `/generate-user-docs` | base | Synchronizes user-facing documentation with the current knowledge base through validate -> stale gate -> scan -> approval -> process orchestration. | Yes |
| `/markdown-preview` | base | Generate browser-viewable HTML previews from markdown, plain text, and Mermaid diagrams. Auto-validates diagrams, applies professional styling, and opens in default browser. Use when agents need to preview documentation, visualizations, or formatted content. |  |
| `/mermaid` | base | Create, validate, and troubleshoot Mermaid.js diagrams. Use when generating flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, state diagrams, or any visualization. Handles diagram validation, syntax errors, broken diagrams, and automatic repair. Trigger terms - mermaid, diagram, flowchart, sequence, class diagram, ER diagram, entity relationship, state machine, gantt, visualization, chart, graph. |  |
| `/project-birds-eye-view` | base | Generates comprehensive project overview documents with diagrams for new developers using internal knowledge base and codebase context. |  |
| `/write-content` | base | Interactive prompt to help create polished technical documents through clarifying questions and structured writing workflows. |  |

## Knowledge

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/knowledge-base-templates` | base | Provides reusable templates for generating comprehensive codebase knowledge bases including architecture diagrams, concept maps, and module documentation. Supports both single-project and monorepo structures. Use when creating project documentation, knowledge bases, or when user mentions KB templates, codebase documentation, or project documentation structure. |  |
| `/knowledge-build` | base | Orchestrates parallel KB generation using spatial analysis and a map-reduce architecture with incremental and feature-learning modes. | Yes |
| `/knowledge-load` | base | Ingests and prepares codebase documentation, builds internal knowledge graphs, and creates optimized context representations for downstream analysis tasks. |  |
| `/self-update` | base | Update rp1 CLI and all plugins to the latest version. |  |

## Strategy

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/analyse-security` | base | Performs thorough security validation of features including vulnerability scans, authentication/authorization verification, compliance assessment, and penetration testing. |  |
| `/deep-research` | base | Autonomous deep research on codebases and technical topics with structured report output via map-reduce explorer architecture. |  |
| `/strategize` | base | Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, complexity, and business objectives with quantified trade-offs. |  |

## Planning

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/blueprint` | dev | Guided wizard for project vision via two-tier docs (charter + PRDs) with stateless interview loops. | Yes |
| `/blueprint-archive` | dev | Archives a completed PRD to the archives directory with associated features and closure summary. |  |
| `/blueprint-audit` | dev | Audits a PRD against implementation status and guides lifecycle decisions. |  |

## Prompt

| Skill | Plugin | Description | Workflow |
|-------|--------|-------------|----------|
| `/build-prompt-evals` | utils | Builds eval assertions and minimal test prompt from prompt text, then optimizes assertions via specialist agent. |  |
| `/prompt-eval-builder` | utils | Domain knowledge for extracting eval assertions and generating test invocation prompts from command/agent specs. Used for building promptfoo evaluation configs. |  |
| `/prompt-writer` | utils | Write maximally terse agent prompts from scratch. Use when creating new agent specs, command prompts, or instruction sets. Teaches structure-first composition with compression-by-default patterns. |  |
| `/tersify-prompt` | utils | Rewrites agent-instruction prompts to be maximally terse while preserving full intent. |  |
| `/tester` | utils | Test command template for verifying argument passing and skill invocation. |  |
