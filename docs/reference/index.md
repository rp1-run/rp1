# Reference

User-facing reference for rp1 setup, workflows, and automation configuration.

---

## CLI Commands

The rp1 CLI handles setup, verification, migration, and updates outside your AI
assistant session.

| Command | Description |
|---------|-------------|
| [`init`](cli/init.md) | Initialize rp1 in a project with guided setup |
| [`install`](cli/install.md) | Install plugins for Claude Code, OpenCode, Codex, or Copilot CLI |
| [`update`](cli/update.md) | Update the rp1 CLI and installed plugins |
| [`rp1 migrate`](cli/rp1-migrate.md) | Migrate older projects into the project-local `.rp1/` layout |

[:octicons-arrow-right-24: CLI Reference](cli/index.md)

### Automation Config

| Config | Description |
|--------|-------------|
| [`pr-review.yaml`](pr-review-config.md) | PR review behavior for CI/CD mode |

[:octicons-arrow-right-24: PR Review Config Reference](pr-review-config.md)

---

## Base Plugin Skills

The base plugin provides project understanding, documentation, analysis, and
maintenance workflows.

| Skill | Description |
|---------|-------------|
| [`knowledge-build`](base/knowledge-build.md) | Generate knowledge base using parallel map-reduce architecture |
| [`deep-research`](base/deep-research.md) | Investigate a codebase or technical topic in depth |
| [`project-birds-eye-view`](base/project-birds-eye-view.md) | Generate comprehensive project overview with diagrams |
| [`write-content`](base/write-content.md) | Interactive technical content creation assistant |
| [`strategize`](base/strategize.md) | Holistic strategic analysis with trade-off recommendations |
| [`socratic-duel`](base/socratic-duel.md) | Strategy workflow for direct two-agent debate recorded in a separate debate artifact |
| [`socratic-duel-run`](base/socratic-duel.md#launcher-mode) | Same-harness Socratic Duel launcher that delegates debate turns to participant subagents |
| [`analyse-security`](base/analyse-security.md) | Comprehensive security validation and vulnerability scanning |
| [`fix-mermaid`](base/fix-mermaid.md) | Validate and repair Mermaid diagrams in markdown docs |
| [`guide`](base/guide.md) | Discover skills, get workflow guidance, and ask about rp1 capabilities |
| [`self-update`](base/self-update.md) | Update rp1 and refresh installed plugins |

### Base Plugin Agent Tools

| Tool | Description |
|------|-------------|
| [`work-search`](base/work-search.md) | Search project-scoped markdown work artifacts through `rp1 agent-tools work-search` |

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

| [`blueprint`](dev/blueprint.md) | Create project charter and PRD documents |
| [`blueprint-archive`](dev/blueprint-archive.md) | Archive completed blueprints |
| [`blueprint-audit`](dev/blueprint-audit.md) | Audit a PRD against implementation status |
| [`feature-edit`](dev/feature-edit.md) | Propagate mid-stream changes across build artifacts |
| [`feature-archive`](dev/feature-archive.md) | Archive completed features |
| [`feature-unarchive`](dev/feature-unarchive.md) | Restore archived features |
| [`code-check`](dev/code-check.md) | Fast hygiene validation (lint, test, coverage) |
| [`code-audit`](dev/code-audit.md) | Pattern consistency and maintainability audit |
| [`code-investigate`](dev/code-investigate.md) | Systematic bug investigation |
| [`code-clean-comments`](dev/code-clean-comments.md) | Remove unnecessary code comments |
| [`pr-review`](dev/pr-review.md) | Map-reduce PR review with confidence gating |
| [`pr-visual`](dev/pr-visual.md) | Generate Mermaid diagrams from PR diffs |
| [`pr-walkthrough`](dev/pr-walkthrough.md) | Generate markdown PR walkthroughs grounded in direct PR evidence |
| [`address-pr-feedback`](dev/address-pr-feedback.md) | Collect, triage, and fix PR review comments |

[:octicons-arrow-right-24: Dev Plugin Reference](dev/index.md)

---

## Skill Invocation

The workflow stays the same across hosts. Only the command syntax changes:

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

=== "Codex"

    ```bash
    $rp1-dev-build my-feature
    $rp1-base-knowledge-build
    ```

=== "Copilot CLI"

    rp1 skills are installed with an `rp1-` prefix under `~/.config/github-copilot/skills/`:

    ```bash
    /rp1-dev-build my-feature
    /rp1-base-knowledge-build
    ```

    Copilot CLI discovers skills from its configured skills directory. Parameters are passed inline and resolved via model-parsed recovery.

---

## Quick Navigation

Looking for something specific?

- **Build a knowledge base**: [`knowledge-build`](base/knowledge-build.md)
- **Start a new feature**: Use `/build` (orchestrates requirements, design, build, verify) - see [Feature Development Guide](../guides/feature-development.md)
- **Review a PR**: [`pr-review`](dev/pr-review.md)
- **Understand a PR**: [`pr-walkthrough`](dev/pr-walkthrough.md)
- **Run code checks**: [`code-check`](dev/code-check.md)
- **Security scan**: [`analyse-security`](base/analyse-security.md)
- **Monitor agent progress**: [Arcade](../arcade/index.md)
- **CLI commands**: [`init`](cli/index.md), [`install`](cli/install.md), [`update`](cli/update.md)
- **Troubleshooting install issues**: [Troubleshooting](../troubleshooting/index.md)
- **Deprecated features**: [Retired Features](../retired-features.md)
