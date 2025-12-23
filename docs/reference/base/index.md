# Base Plugin Reference

The `rp1-base` plugin provides foundation capabilities for knowledge management, deep research, documentation, strategic analysis, security validation, and self-maintenance.

**Version**: 4.1.0
**Commands**: 9
**Agents**: 12
**Dependencies**: None (base plugin)

---

## Commands

| Command | Description |
|---------|-------------|
| [`knowledge-build`](knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`knowledge-load`](knowledge-load.md) | Load KB context for downstream agents |
| [`deep-research`](deep-research.md) | Autonomous research on codebases and technical topics |
| [`project-birds-eye-view`](project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`write-content`](write-content.md) | Interactive technical content creation assistant |
| [`strategize`](strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`analyse-security`](analyse-security.md) | Comprehensive security validation and vulnerability scanning |
| [`fix-mermaid`](fix-mermaid.md) | Validate and repair Mermaid diagrams in markdown files |
| [`self-update`](self-update.md) | Update rp1 to the latest version |

---

## Command Categories

### Knowledge Management

Build and load the knowledge base that powers context-aware agents.

- **[`knowledge-build`](knowledge-build.md)**: Analyzes your codebase and generates documentation in `.rp1/context/`
- **[`knowledge-load`](knowledge-load.md)**: Loads KB context for other agents to use

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
- **[`analyse-security`](analyse-security.md)**: Comprehensive security validation and vulnerability detection

### Validation

Repair and validate documentation artifacts.

- **[`fix-mermaid`](fix-mermaid.md)**: Validates Mermaid diagram syntax and auto-repairs common errors (up to 3 attempts per diagram). Unfixable diagrams get placeholder comments.

### Maintenance

Keep rp1 up to date.

- **[`self-update`](self-update.md)**: Updates rp1 using your package manager (Homebrew, Scoop) or provides manual instructions for other installations.

---

## Automatic Update Notifications

rp1 automatically checks for updates when you start a new session. If a newer version is available, you will see a notification with the current and available versions.

**Behavior**:

- Checks only on new session start (not on resume, compact, or clear)
- Version check results are cached for 24 hours to minimize network requests
- Network failures are handled gracefully (no error shown, session continues normally)
- Use `rp1 check-update --force` to bypass the cache and check immediately

**Cache Location**: `~/.config/rp1/version-cache.json`

**After Updating**: Restart Claude Code or OpenCode to use the new version.

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
