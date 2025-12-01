# Command Reference

Complete documentation for all 21 rp1 commands across both plugins.

---

## Base Plugin (6 commands)

The base plugin provides foundation capabilities: knowledge management, documentation generation, strategic analysis, and security validation.

| Command | Description |
|---------|-------------|
| [`knowledge-build`](base/knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`knowledge-load`](base/knowledge-load.md) | Load KB context for downstream agents |
| [`project-birds-eye-view`](base/project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`strategize`](base/strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`write-content`](base/write-content.md) | Interactive technical content creation assistant |
| [`analyse-security`](base/analyse-security.md) | Comprehensive security validation and vulnerability scanning |

[:octicons-arrow-right-24: Base Plugin Reference](base/index.md)

---

## Dev Plugin (15 commands)

The dev plugin provides development workflow capabilities: feature lifecycle, code quality, and PR management.

### Blueprint & Planning

| Command | Description |
|---------|-------------|
| [`blueprint`](dev/blueprint.md) | Create project charter and PRD documents |
| [`feature-requirements`](dev/feature-requirements.md) | Collect and document feature requirements |
| [`feature-design`](dev/feature-design.md) | Generate technical design specifications |
| [`feature-tasks`](dev/feature-tasks.md) | Break down design into actionable tasks |
| [`validate-hypothesis`](dev/validate-hypothesis.md) | Test design assumptions through experiments |

### Implementation

| Command | Description |
|---------|-------------|
| [`feature-build`](dev/feature-build.md) | Implement features from task lists |
| [`feature-verify`](dev/feature-verify.md) | Validate acceptance criteria before merge |
| [`feature-edit`](dev/feature-edit.md) | Propagate mid-stream changes across documents |
| [`feature-archive`](dev/feature-archive.md) | Archive completed features |
| [`feature-unarchive`](dev/feature-unarchive.md) | Restore archived features |

### Code Quality

| Command | Description |
|---------|-------------|
| [`code-check`](dev/code-check.md) | Fast hygiene validation (lint, test, coverage) |
| [`code-audit`](dev/code-audit.md) | Pattern consistency and maintainability audit |
| [`code-investigate`](dev/code-investigate.md) | Systematic bug investigation |
| [`code-clean-comments`](dev/code-clean-comments.md) | Remove unnecessary code comments |
| [`code-quick-build`](dev/code-quick-build.md) | Exploratory development for quick fixes |

### PR Management

| Command | Description |
|---------|-------------|
| [`pr-review`](dev/pr-review.md) | Map-reduce PR review with confidence gating |
| [`pr-visual`](dev/pr-visual.md) | Generate Mermaid diagrams from PR diffs |
| [`pr-feedback-collect`](dev/pr-feedback-collect.md) | Extract and classify PR review comments |
| [`pr-feedback-fix`](dev/pr-feedback-fix.md) | Systematically address PR feedback |

[:octicons-arrow-right-24: Dev Plugin Reference](dev/index.md)

---

## Command Syntax

Commands differ slightly between platforms:

=== "Claude Code"

    ```bash
    /rp1-base:command-name [arguments]
    /rp1-dev:command-name [arguments]
    ```

=== "OpenCode"

    ```bash
    /rp1-base/command-name [arguments]
    /rp1-dev/command-name [arguments]
    ```

---

## Quick Navigation

Looking for something specific?

- **Build a knowledge base**: [`knowledge-build`](base/knowledge-build.md)
- **Start a new feature**: [`blueprint`](dev/blueprint.md) → [`feature-requirements`](dev/feature-requirements.md)
- **Review a PR**: [`pr-review`](dev/pr-review.md)
- **Run code checks**: [`code-check`](dev/code-check.md)
- **Security scan**: [`analyse-security`](base/analyse-security.md)
