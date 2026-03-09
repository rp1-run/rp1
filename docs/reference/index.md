# Skill Reference

Complete documentation for all rp1 skills across both plugins, plus CLI tools.

---

## CLI Commands

The rp1 CLI provides tools for setup and management outside of AI assistant sessions.

| Command | Description |
|---------|-------------|
| [`init`](cli/init.md) | Initialize rp1 in a project with guided setup |
| [`install`](cli/install.md) | Install plugins for Claude Code, OpenCode, or Codex CLI |
| `build` | Build plugin packages from source |
| `self-update` | Update the rp1 CLI to the latest version |
| `arcade` | Launch web dashboard |

[:octicons-arrow-right-24: CLI Reference](cli/init.md)

### Agent Tools

Internal CLI utilities for AI agent workflows:

| Tool | Description |
|------|-------------|
| [`worktree`](cli/worktree.md) | Git worktree management for isolated execution |
| [`rp1-root-dir`](cli/rp1-root-dir.md) | RP1_ROOT path resolution |
| [`github-pr`](agent-tools.md#github-pr) | GitHub PR operations (submit-review, add-reaction, reply-comment, fetch-comments) |

[:octicons-arrow-right-24: Agent Tools Reference](agent-tools.md)

### Configuration Files

| Config | Description |
|--------|-------------|
| [`pr-review.yaml`](pr-review-config.md) | PR review behavior for CI/CD mode |

[:octicons-arrow-right-24: PR Review Config Reference](pr-review-config.md)

---

## Web UI

The rp1 web UI provides browser-based documentation viewing and agent activity monitoring.

| Feature | Description |
|---------|-------------|
| [Status Dashboard](web-ui.md#status-dashboard) | Real-time visibility into agent workflow progress |

[:octicons-arrow-right-24: Web UI Reference](web-ui.md)

---

## Base Plugin Skills

The base plugin provides foundation capabilities: knowledge management, documentation generation, strategic analysis, and security validation.

| Skill | Description |
|---------|-------------|
| [`knowledge-build`](base/knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`knowledge-load`](base/knowledge-load.md) | Load KB context for downstream agents |
| [`project-birds-eye-view`](base/project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`strategize`](base/strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`write-content`](base/write-content.md) | Interactive technical content creation assistant |
| [`analyse-security`](base/analyse-security.md) | Comprehensive security validation and vulnerability scanning |

[:octicons-arrow-right-24: Base Plugin Reference](base/index.md)

---

## Dev Plugin Skills

The dev plugin provides development workflow capabilities: feature lifecycle, code quality, and PR management.

### Feature Development

| Skill | Description |
|---------|-------------|
| [`build`](dev/build.md) | **Primary skill** -- End-to-end feature workflow (requirements -> design -> build -> verify -> archive) |
| [`build-fast`](dev/build-fast.md) | Quick iteration for small, well-scoped tasks |
| [`validate-hypothesis`](dev/validate-hypothesis.md) | Test design assumptions through experiments |

### Blueprint & Planning

| Skill | Description |
|---------|-------------|
| [`blueprint`](dev/blueprint.md) | Create project charter and PRD documents |
| [`blueprint-archive`](dev/blueprint-archive.md) | Archive completed blueprints |

### Feature Management

| Skill | Description |
|---------|-------------|
| [`feature-edit`](dev/feature-edit.md) | Propagate mid-stream changes across documents |
| [`feature-archive`](dev/feature-archive.md) | Archive completed features |
| [`feature-unarchive`](dev/feature-unarchive.md) | Restore archived features |

### Code Quality

| Skill | Description |
|---------|-------------|
| [`code-check`](dev/code-check.md) | Fast hygiene validation (lint, test, coverage) |
| [`code-audit`](dev/code-audit.md) | Pattern consistency and maintainability audit |
| [`code-investigate`](dev/code-investigate.md) | Systematic bug investigation |
| [`code-clean-comments`](dev/code-clean-comments.md) | Remove unnecessary code comments |

### PR Management

| Skill | Description |
|---------|-------------|
| [`pr-review`](dev/pr-review.md) | Map-reduce PR review with confidence gating |
| [`pr-visual`](dev/pr-visual.md) | Generate Mermaid diagrams from PR diffs |
| [`address-pr-feedback`](dev/address-pr-feedback.md) | Unified workflow: collect, triage, and fix PR review comments |

[:octicons-arrow-right-24: Dev Plugin Reference](dev/index.md)

---

## Skill Invocation

Skills can be invoked differently depending on your AI assistant:

=== "Claude Code"

    ```bash
    /skill-name [arguments]
    ```

    Type `/` to get autocomplete suggestions. Use the short form without prefix. If you have a name conflict with another plugin, use the prefixed form: `/rp1-base:skill-name` or `/rp1-dev:skill-name`.

=== "OpenCode"

    rp1 skills are installed with an `rp1-` prefix to avoid collisions with your own skills:

    1. **Type the skill name directly** (e.g., `/rp1-dev-build`, `/rp1-base-knowledge-build`)
    2. **Type `/skills`** to browse and select — look for skills prefixed with `rp1-`

    ```bash
    /rp1-dev-build my-feature [arguments]
    /rp1-base-knowledge-build
    ```

    !!! note
        Autocomplete for skill names is not yet available in OpenCode — see [opencode#14506](https://github.com/anomalyco/opencode/issues/14506). This may be supported soon.

=== "Codex CLI"

    In Codex CLI, rp1 skills are invoked using `$` mentions:

    ```text
    $rp1-dev-build my-feature [arguments]
    $rp1-base-knowledge-build
    ```

    !!! note
        Codex CLI uses `$skill-name` mentions instead of `/` slash commands. Tool approvals are configured globally in `~/.codex/config.toml`.

---

## Quick Navigation

Looking for something specific?

- **Build a knowledge base**: [`knowledge-build`](base/knowledge-build.md)
- **Start a new feature**: Use `/build` (orchestrates requirements, design, build, verify) - see [Feature Development Guide](../guides/feature-development.md)
- **Review a PR**: [`pr-review`](dev/pr-review.md)
- **Run code checks**: [`code-check`](dev/code-check.md)
- **Security scan**: [`analyse-security`](base/analyse-security.md)
- **Task dependency format**: [`dag-format`](dag-format.md)
- **Monitor agent progress**: [Status Dashboard](web-ui.md#status-dashboard)
