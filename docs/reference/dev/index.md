# Dev Plugin Reference

The `rp1-dev` plugin provides development workflow capabilities for the complete feature lifecycle, code quality tools, and PR management.

**Version**: 3.0.0
**Commands**: 20
**Agents**: 20
**Dependencies**: rp1-base >= 2.0.0

---

## Commands by Category

### Blueprint & Planning

Start projects and plan features with structured documentation.

| Command | Description |
|---------|-------------|
| [`blueprint`](blueprint.md) | Create project charter and PRD documents |
| [`blueprint-archive`](blueprint-archive.md) | Archive completed PRDs with closure summary |
| [`feature-requirements`](feature-requirements.md) | Collect and document feature requirements |
| [`feature-design`](feature-design.md) | Generate technical design specifications (auto-generates tasks) |
| [`feature-tasks`](feature-tasks.md) | Regenerate tasks (optional - tasks auto-generate after design) |
| [`validate-hypothesis`](validate-hypothesis.md) | Test design assumptions through experiments |

### Implementation

Build features from specifications and manage the implementation lifecycle.

| Command | Description |
|---------|-------------|
| [`feature-build`](feature-build.md) | Implement features via builder-reviewer architecture |
| [`feature-verify`](feature-verify.md) | Validate acceptance criteria before merge |
| [`feature-edit`](feature-edit.md) | Propagate mid-stream changes across documents |
| [`feature-archive`](feature-archive.md) | Archive completed features |
| [`feature-unarchive`](feature-unarchive.md) | Restore archived features |

### Code Quality

Maintain code health with automated checks and analysis.

| Command | Description |
|---------|-------------|
| [`code-check`](code-check.md) | Fast hygiene validation (lint, test, coverage) |
| [`code-audit`](code-audit.md) | Pattern consistency and maintainability audit |
| [`code-investigate`](code-investigate.md) | Systematic bug investigation |
| [`code-clean-comments`](code-clean-comments.md) | Remove unnecessary code comments |
| [`code-quick-build`](code-quick-build.md) | Exploratory development for quick fixes |

### PR Management

Review and manage pull requests effectively.

| Command | Description |
|---------|-------------|
| [`pr-review`](pr-review.md) | Map-reduce PR review with confidence gating |
| [`pr-visual`](pr-visual.md) | Generate Mermaid diagrams from PR diffs |
| [`pr-feedback-collect`](pr-feedback-collect.md) | Extract and classify PR review comments |
| [`pr-feedback-fix`](pr-feedback-fix.md) | Systematically address PR feedback |

---

## Feature Development Workflow

The dev plugin commands work together to support a **5-step feature lifecycle**:

```
feature-requirements → feature-design → feature-build → feature-verify → feature-archive
```

!!! note "Tasks Auto-Generate"
    Running `/feature-design` automatically generates `tasks.md`. The separate `/feature-tasks` command is optional and only needed to regenerate tasks manually.

Each step produces artifacts that feed into the next:

| Step | Command | Artifact |
|------|---------|----------|
| 1 | `feature-requirements` | `.rp1/work/features/{id}/requirements.md` |
| 2 | `feature-design` | `.rp1/work/features/{id}/design.md` + `tasks.md` |
| 3 | `feature-build` | Implementation + task updates |
| 4 | `feature-verify` | Verification report |
| 5 | `feature-archive` | Archived feature in `.rp1/work/archives/` |

**Optional Steps**:

- `blueprint` - Create project charter and PRDs before starting features
- `blueprint-archive` - Archive completed PRDs with closure summary
- `validate-hypothesis` - Test design assumptions before building
- `feature-tasks` - Manually regenerate or update tasks

[:octicons-arrow-right-24: Feature Development Tutorial](../../guides/feature-development.md)

---

## Installation

=== "Claude Code"

    ```bash
    /plugin marketplace add rp1-run/rp1
    /plugin install rp1-base  # Required dependency
    /plugin install rp1-dev
    ```

=== "OpenCode"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
    ```

---

## Quick Start

After installation, start a new feature:

=== "Claude Code"

    ```bash
    /feature-requirements my-feature
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/feature-requirements my-feature
    ```

This creates `.rp1/work/features/my-feature/requirements.md` and guides you through requirements collection.
