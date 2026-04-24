# Base Plugin Reference

The `rp1-base` plugin provides foundation workflows for understanding your
project, generating documentation, doing deep analysis, and keeping rp1 up to
date.

---

## Skills

| Skill | Description |
|---------|-------------|
| [`knowledge-build`](knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`deep-research`](deep-research.md) | Autonomous research on codebases and technical topics |
| [`project-birds-eye-view`](project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`write-content`](write-content.md) | Interactive technical content creation assistant |
| [`strategize`](strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`socratic-duel`](socratic-duel.md) | Bounded two-agent debate inside a local Markdown document |
| [`analyse-security`](analyse-security.md) | Comprehensive security validation and vulnerability scanning |
| [`fix-mermaid`](fix-mermaid.md) | Validate and repair Mermaid diagrams in markdown files |
| [`self-update`](self-update.md) | Update rp1 to the latest version |

---

## Skill Categories

### Knowledge Management

Build and load the knowledge base that powers context-aware agents.

- **[`knowledge-build`](knowledge-build.md)**: Analyzes your codebase and
  generates documentation in `.rp1/context/`

### Research

Autonomous investigation of codebases and technical topics.

- **[`deep-research`](deep-research.md)**: Map-reduce architecture with explorer agents for thorough investigation. Supports single-project analysis, multi-project comparison, and technical investigations with web search.

### Documentation

Generate comprehensive documentation for onboarding and communication.

- **[`project-birds-eye-view`](project-birds-eye-view.md)**: Creates overview documents with architecture diagrams
- **[`write-content`](write-content.md)**: Interactive assistant for blog posts, proposals, and feedback documents

### Analysis

Deep analysis for strategy and security.

- **[`strategize`](strategize.md)**: Provides strategic recommendations balancing cost, quality, and complexity
- **[`socratic-duel`](socratic-duel.md)**: Runs a bounded, evidence-driven two-agent debate inside a local Markdown document
- **[`analyse-security`](analyse-security.md)**: Comprehensive security validation and vulnerability detection

### Validation

Repair and validate documentation artifacts.

- **[`fix-mermaid`](fix-mermaid.md)**: Validates Mermaid diagram syntax and auto-repairs common errors (up to 3 attempts per diagram). Unfixable diagrams get placeholder comments.

### Maintenance

Keep rp1 up to date.

- **[`self-update`](self-update.md)**: Updates rp1 using your package manager (Homebrew, Scoop) or provides manual instructions for other installations.

---

## Invocation Patterns

Base workflows use the same names on every host:

| Host | Example |
|------|---------|
| Claude Code | `/knowledge-build` |
| OpenCode | `/rp1-base-knowledge-build` |
| Codex | `$rp1-base-knowledge-build` |

---

## Quick Start

After installation, generate a knowledge base:

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

    You can also type `/skills` to browse all available skills — rp1 skills are prefixed with `rp1-` (e.g., `/rp1-base-knowledge-build`, `/rp1-base-strategize`).

=== "Codex"

    ```bash
    $rp1-base-knowledge-build
    ```

This creates `.rp1/context/` with documentation files that other skills use for context-aware execution.
