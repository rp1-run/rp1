# Getting Started

Use this path to go from a fresh install to a project-aware workflow you can
monitor in Arcade.

rp1 adds repeatable development workflows to AI coding assistants. You install
the CLI, initialize a repository, generate project context once, then run
workflow skills for feature work, bug investigation, PR review, documentation,
and team handoffs.

## Start Here

| Step | Goal | Where to go |
|------|------|-------------|
| 1 | Install rp1 and connect at least one supported host tool. | [Installation](installation.md) |
| 2 | Initialize a repository with `rp1 init`. | [Installation: Initialize your project](installation.md#step-2-initialize-your-project) |
| 3 | Generate project context so workflows understand your codebase. | [Your first workflow](first-workflow.md#build-project-context) |
| 4 | Choose a first tracked workflow that creates visible work. | [Your first workflow](first-workflow.md#choose-your-first-tracked-workflow) |
| 5 | Open Arcade and inspect the run, artifacts, and any attention needed. | [Your first workflow](first-workflow.md#open-arcade) |

## Invocation Patterns

The workflow is the same on each host. Only the invocation syntax changes:

| Host | Example |
|------|---------|
| Claude Code | `/build my-feature` |
| OpenCode | `/rp1-dev-build my-feature` |
| Codex | `$rp1-dev-build my-feature` |
| GitHub Copilot CLI | `/rp1-dev-build my-feature` |

## Pick Your First Outcome

<div class="grid cards" markdown>

-   :material-hammer-wrench:{ .lg .middle } **Ship code**

    ---

    Turn a feature idea into requirements, a plan, implementation, and
    verification.

    [:octicons-arrow-right-24: Feature workflow](../guides/feature-development.md)

-   :material-source-pull:{ .lg .middle } **Review a PR**

    ---

    Run a structured review, inspect findings, and decide whether to block or
    proceed.

    [:octicons-arrow-right-24: PR review](../guides/pr-review.md)

-   :material-view-dashboard:{ .lg .middle } **Monitor in Arcade**

    ---

    Watch active runs, open artifacts, follow external links, and respond to
    gates or feedback.

    [:octicons-arrow-right-24: Arcade overview](../arcade/index.md)

-   :material-account-group:{ .lg .middle } **Bring in a teammate**

    ---

    Help another developer install rp1, build context, and choose a useful
    first workflow.

    [:octicons-arrow-right-24: Team onboarding](../guides/team-onboarding.md)

</div>

## Prerequisites

Before you begin, you need:

- **A supported AI coding assistant**:
  [Claude Code](https://claude.ai/code),
  [OpenCode](https://github.com/opencode-ai/opencode),
  [Codex](https://github.com/openai/codex), or
  [GitHub Copilot CLI](https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
- **A repository** where you want rp1 to help with real work

## After The First Run

Most users continue with:

- [Feature development](../guides/feature-development.md) for larger changes
  that need requirements, planning, implementation, and release checks.
- [Build Fast](../reference/dev/build-fast.md) for smaller bounded tasks.
- [PR review](../guides/pr-review.md) when the next decision is whether a
  branch is ready.
- [Arcade](../arcade/index.md) whenever you want to monitor runs and give
  feedback on artifacts.

The [.rp1 directory guide](rp1-directory.md) is available when you need to
understand project files, sharing choices, or troubleshooting details. You do
not need it to complete normal onboarding.
