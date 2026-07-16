# Reference

User-facing reference for rp1 setup, workflows, reviews, automation, and
advanced material. Use the task groups below first; the plugin catalogs remain
available when you need the complete command list.

---

## Setup And Maintenance

| Need | Reference |
|------|-----------|
| Initialize a project | [`init`](cli/init.md) |
| Install rp1 into an AI coding host | [`install`](cli/install.md) |
| Verify host integrations and Antigravity plugin assets | [`verify`](cli/verify.md) |
| Update the CLI and installed plugins | [`update`](cli/update.md) |
| Remove rp1 project setup or host-specific assets | [`uninstall`](cli/uninstall.md) |
| Check available updates | [`check-update`](cli/check-update.md) |
| Update rp1 and refresh installed plugins from a workflow | [`self-update`](base/self-update.md) |
| Migrate an older project layout | [`rp1 migrate`](cli/rp1-migrate.md) |
| Configure model tier remappings | [`configuration`](configuration.md), [`settings`](cli/settings.md) |

[:octicons-arrow-right-24: CLI Reference](cli/index.md)

## Ship Code

| Need | Reference |
|------|-----------|
| Run the full feature workflow | [`build`](dev/build.md) |
| Make a small, well-scoped change | [`build-fast`](dev/build-fast.md) |
| Break a large plan into phases | [`phase-plan`](dev/phase-plan.md) |
| Validate a design assumption before coding | [`validate-hypothesis`](dev/validate-hypothesis.md) |
| Create or manage PRD and feature artifacts | [`blueprint`](dev/blueprint.md), [`feature-edit`](dev/feature-edit.md), [`feature-archive`](dev/feature-archive.md), [`feature-unarchive`](dev/feature-unarchive.md) |
| Check code quality or investigate a bug | [`code-check`](dev/code-check.md), [`code-audit`](dev/code-audit.md), [`code-investigate`](dev/code-investigate.md) |

[:octicons-arrow-right-24: Ship code guide](../guides/feature-development.md)

## Review PRs

| Need | Reference |
|------|-----------|
| Run an evidence-grounded PR review | [`pr-review`](dev/pr-review.md) |
| Generate a PR diagram | [`pr-visual`](dev/pr-visual.md) |
| Generate a markdown walkthrough | [`pr-walkthrough`](dev/pr-walkthrough.md) |
| Split a large PR into a stack | [`pr-stack`](dev/pr-stack.md) |
| Address review feedback | [`address-pr-feedback`](dev/address-pr-feedback.md) |
| Configure CI review behavior | [`pr-review.yaml`](pr-review-config.md) |

[:octicons-arrow-right-24: PR review guide](../guides/pr-review.md)

## Understand The Project

| Need | Reference |
|------|-----------|
| Generate project context | [`knowledge-build`](base/knowledge-build.md) |
| Produce a project overview for onboarding | [`project-birds-eye-view`](base/project-birds-eye-view.md) |
| Research a codebase or technical topic | [`deep-research`](base/deep-research.md) |
| Draft technical content | [`write-content`](base/write-content.md) |
| Compare strategic trade-offs | [`strategize`](base/strategize.md) |
| Run a security assessment | [`analyse-security`](base/analyse-security.md) |
| Validate Mermaid diagrams | [`fix-mermaid`](base/fix-mermaid.md) |
| Discover the right rp1 workflow | [`guide`](base/guide.md) |

## Platforms And Automation

| Need | Reference |
|------|-----------|
| GitHub Copilot CLI setup and verification | [GitHub Copilot CLI](platforms/copilot.md) |
| Antigravity CLI plugin assets and support matrix | [Antigravity CLI](platforms/antigravity.md) |
| CI/CD integration path | [CI/CD Integration](../guides/ci-cd-integration.md) |
| Remote PR review from automation | [Remote PR Review](../guides/remote-pr-review.md) |
| PR review configuration file | [`pr-review.yaml`](pr-review-config.md) |

## Advanced References

| Need | Reference |
|------|-----------|
| Project-local `.rp1/` files | [The `.rp1` Directory](../getting-started/rp1-directory.md) |
| User-facing concepts | [Concepts](../concepts/index.md) |
| Fence marker versioning | [Fence Versioning](cli/fence-versioning.md) |

## Complete Catalogs

| Catalog | Description |
|---------|-------------|
| [CLI Reference](cli/index.md) | Setup and maintenance commands |
| [Base Workflow Reference](base/index.md) | Project understanding, research, documentation, analysis, and maintenance workflows |
| [Development Workflow Reference](dev/index.md) | Feature delivery, code quality, PR review, and planning workflows |

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

    1. Type the skill name directly, for example `/rp1-dev-build` or `/rp1-base-knowledge-build`
    2. Type `/skills` to browse and select skills prefixed with `rp1-`

    ```bash
    /rp1-dev-build my-feature [arguments]
    /rp1-base-knowledge-build
    ```

    !!! note
        Autocomplete for skill names is not yet available in OpenCode. See [opencode#14506](https://github.com/anomalyco/opencode/issues/14506).

=== "Codex"

    ```bash
    $rp1-dev-build my-feature
    $rp1-base-knowledge-build
    ```

=== "Copilot CLI"

    ```bash
    /rp1-dev-build my-feature
    /rp1-base-knowledge-build
    ```

    Copilot CLI discovers rp1 skills from its configured skills directory.

=== "Antigravity CLI"

    ```bash
    /rp1-dev-build my-feature
    /rp1-base-knowledge-build
    ```

    Antigravity CLI loads rp1 plugin assets from the Antigravity package and
    reports workflow support through the Antigravity support matrix.

---

## Quick Navigation

- **Get started**: [Installation](../getting-started/installation.md), [First Workflow](../getting-started/first-workflow.md)
- **Ship a feature**: [Feature Development Guide](../guides/feature-development.md), [`build`](dev/build.md), [`build-fast`](dev/build-fast.md)
- **Review a PR**: [PR Review Guide](../guides/pr-review.md), [`pr-review`](dev/pr-review.md), [`pr-walkthrough`](dev/pr-walkthrough.md), [`pr-stack`](dev/pr-stack.md)
- **Monitor work**: [Arcade](../arcade/index.md)
- **Understand concepts**: [Concepts](../concepts/index.md), [Consistent Workflows](../concepts/constitutional-prompting.md), [Project Context](../concepts/knowledge-aware-agents.md)
- **Automate CI**: [CI/CD Integration](../guides/ci-cd-integration.md), [`pr-review.yaml`](pr-review-config.md)
- **Onboard a team**: [Team Onboarding](../guides/team-onboarding.md), [`project-birds-eye-view`](base/project-birds-eye-view.md)
- **Troubleshoot**: [Troubleshooting](../troubleshooting/index.md)
