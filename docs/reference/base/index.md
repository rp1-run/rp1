# Base Plugin Reference

The `rp1-base` plugin provides foundation capabilities for knowledge management, documentation, strategic analysis, and security validation.

**Version**: 4.1.0
**Dependencies**: None (base plugin)

---

## Commands

| Command | Description |
|---------|-------------|
| [`knowledge-build`](knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`knowledge-load`](knowledge-load.md) | Load KB context for downstream agents |
| [`project-birds-eye-view`](project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`strategize`](strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`write-content`](write-content.md) | Interactive technical content creation assistant |
| [`analyse-security`](analyse-security.md) | Comprehensive security validation and vulnerability scanning |

---

## Command Categories

### Knowledge Management

Build and load the knowledge base that powers context-aware agents.

- **[`knowledge-build`](knowledge-build.md)**: Analyzes your codebase and generates documentation in `.rp1/context/`
- **[`knowledge-load`](knowledge-load.md)**: Loads KB context for other agents to use

### Documentation

Generate comprehensive documentation for onboarding and communication.

- **[`project-birds-eye-view`](project-birds-eye-view.md)**: Creates overview documents with architecture diagrams
- **[`write-content`](write-content.md)**: Interactive assistant for blog posts, proposals, and feedback documents

### Analysis

Deep analysis for strategy and security.

- **[`strategize`](strategize.md)**: Provides strategic recommendations balancing cost, quality, and complexity
- **[`analyse-security`](analyse-security.md)**: Comprehensive security validation and vulnerability detection

---

## Installation

=== "Claude Code"

    ```bash
    /plugin marketplace add rp1-run/rp1
    /plugin install rp1-base
    ```

=== "OpenCode"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
    ```

---

## Quick Start

After installation, generate a knowledge base:

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base/knowledge-build
    ```

This creates `.rp1/context/` with documentation files that other commands use for context-aware execution.
