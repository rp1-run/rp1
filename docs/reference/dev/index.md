# Dev Plugin Reference

The `rp1-dev` plugin provides feature delivery, code-quality, and PR workflows
for day-to-day development.

---

## Skills by Category

### Feature Development

Build features with full workflow orchestration.

| Skill | Description |
|---------|-------------|
| [`build`](build.md) | **Primary skill** -- End-to-end feature workflow (requirements -> design -> build -> verify -> archive) |
| [`build-fast`](build-fast.md) | Quick iteration for small, well-scoped tasks |
| [`phase-plan`](phase-plan.md) | Decompose a completed PRD or oversized requirements artifact into delivery phases |
| [`validate-hypothesis`](validate-hypothesis.md) | Test design assumptions through experiments |

### Blueprint & Planning

Start projects with structured documentation.

| Skill | Description |
|---------|-------------|
| [`blueprint`](blueprint.md) | Create project charter and PRD documents |
| [`phase-plan`](phase-plan.md) | Turn a large PRD or oversized requirements artifact into child-feature handoffs |
| [`blueprint-archive`](blueprint-archive.md) | Archive completed blueprints |
| [`blueprint-audit`](blueprint-audit.md) | Audit PRDs against implementation status |

### Feature Management

Manage features during and after development.

| Skill | Description |
|---------|-------------|
| [`feature-edit`](feature-edit.md) | Propagate mid-stream changes across documents |
| [`feature-archive`](feature-archive.md) | Archive completed features |
| [`feature-unarchive`](feature-unarchive.md) | Restore archived features |

### Code Quality

Maintain code health with automated checks and analysis.

| Skill | Description |
|---------|-------------|
| [`code-check`](code-check.md) | Fast hygiene validation (lint, test, coverage) |
| [`code-audit`](code-audit.md) | Pattern consistency and maintainability audit |
| [`code-investigate`](code-investigate.md) | Systematic bug investigation |
| [`code-clean-comments`](code-clean-comments.md) | Remove unnecessary code comments |

### PR Management

Review and manage pull requests effectively.

| Skill | Description |
|---------|-------------|
| [`pr-review`](pr-review.md) | Map-reduce PR review with confidence gating |
| [`pr-visual`](pr-visual.md) | Generate Mermaid diagrams from PR diffs |
| [`pr-walkthrough`](pr-walkthrough.md) | Generate plain markdown walkthroughs grounded in direct PR evidence |
| [`address-pr-feedback`](address-pr-feedback.md) | Unified workflow: collect, triage, and fix PR review comments |

### Collaboration

| Skill | Description |
|---------|-------------|
| [`address-pr-feedback`](address-pr-feedback.md) | Collect, triage, and fix reviewer comments from a PR |

---

## Feature Development Workflow

Use the same workflow on every host:

| Host | Example |
|------|---------|
| Claude Code | `/build my-feature` |
| OpenCode | `/rp1-dev-build my-feature` |
| Codex | `$rp1-dev-build my-feature` |

`/build` is the primary entry point for large or multi-step feature work, and
`/phase-plan` sits just ahead of it when a planning source is too large for one
independent feature:

```mermaid
flowchart LR
    P[Phase Plan]
    P --> R[Requirements]
    R --> D[Design]
    D --> B[Build]
    B --> V[Verify]
    V --> UR[User Review]
    UR -->|More work| F[Follow-up]
    F --> B
    UR -->|Done| A[Archive]
```

`/build` is resumable: rp1 reuses an active non-terminal run only when the
canonical project and `FEATURE_ID` match, then continues from the first
incomplete step in the canonical feature directory. `build-fast` uses the same
bootstrap contract, but always starts a fresh run and writes its plan under
`.rp1/work/quick-builds/`.

| Step | What Happens | Artifact |
|------|--------------|----------|
| Requirements | Collect and document requirements | `requirements.md` |
| Design | Generate technical design + tasks | `design.md`, `tasks.md` |
| Build | Implement via builder-reviewer | Code changes |
| Verify | Validate against acceptance criteria | `verification-report.md` |
| User Review | Manual verification checkpoint | User decision |
| Follow-up | Add more work if needed | Loops to Build |
| Archive | Store completed feature | Archived artifacts |

**When to use which skill:**

| Use Case | Skill |
|----------|---------|
| Initiative-sized work, phased rollout, or multiple child features | `/phase-plan` |
| Multi-component features, architectural changes | `/build` |
| Bug fixes, small enhancements, isolated changes | `/build-fast` |

[:octicons-arrow-right-24: Feature Development Tutorial](../../guides/feature-development.md)

---

## Installation

Install the plugin from the CLI:

```bash
rp1 install claude-code
rp1 install opencode
rp1 install codex
```

---

## Quick Start

After installation, start a new feature:

=== "Claude Code"

    ```bash
    /build my-feature
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build my-feature
    ```

    You can also type `/skills` to browse all available skills — rp1 skills are prefixed with `rp1-` (e.g., `/rp1-dev-build`, `/rp1-dev-build-fast`).

=== "Codex"

    ```bash
    $rp1-dev-build my-feature
    ```

This runs the complete feature workflow -- collecting requirements, generating design, implementing with builder-reviewer, and verifying the result.
