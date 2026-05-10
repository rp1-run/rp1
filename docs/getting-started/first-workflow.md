# Your First Workflow

After installation and `rp1 init`, run one context-building command, choose a
tracked workflow, then open Arcade to see the work.

---

## Choose Your Starting Point

=== "Existing Codebase"

    You have a repository and want rp1 to understand it. Continue below to build
    project context, then run a tracked workflow.

=== "Starting Fresh"

    You are creating a new project from scratch.

    [Go to Bootstrap Guide :material-arrow-right:](../guides/bootstrap.md){ .md-button .md-button--primary }

    The bootstrap workflow helps turn an idea into a charter, project scaffold,
    and first implementation path.

---

## Build Project Context

Run `knowledge-build` once so later workflows can use your project's structure,
architecture, and patterns.

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

    !!! tip "Discovering Skills"
        Type `/skills` in OpenCode to browse installed skills. rp1 skills use
        names such as `rp1-base-knowledge-build` and `rp1-dev-build`.

=== "Codex"

    ```bash
    $rp1-base-knowledge-build
    ```

=== "GitHub Copilot CLI"

    ```bash
    /rp1-base-knowledge-build
    ```

### Expected Result

The first run may take 10-15 minutes on a large repository. When it finishes,
you should see either a success summary or an up-to-date message if the context
was already current.

`knowledge-build` is an enabling step, not the destination. It prepares project
context that feature, review, investigation, and documentation workflows use
automatically. Because it is passive setup work, it does not create an Arcade
run by itself.

---

## Choose Your First Tracked Workflow

Pick a workflow that matches a real next action. Tracked workflows create runs
and artifacts you can inspect in Arcade.

| Goal | Claude Code | OpenCode | Codex | GitHub Copilot CLI |
|------|-------------|----------|-------|--------------------|
| Ship a multi-step feature | `/build my-feature` | `/rp1-dev-build my-feature` | `$rp1-dev-build my-feature` | `/rp1-dev-build my-feature` |
| Make a bounded quick change | `/build-fast "Add dark mode toggle"` | `/rp1-dev-build-fast "Add dark mode toggle"` | `$rp1-dev-build-fast "Add dark mode toggle"` | `/rp1-dev-build-fast "Add dark mode toggle"` |
| Review a pull request | `/pr-review` | `/rp1-dev-pr-review` | `$rp1-dev-pr-review` | `/rp1-dev-pr-review` |

For a first visible run, choose the smallest real task you have. `build-fast`
is a good fit for a bounded change; `build` is better when you need
requirements, planning, implementation, and release checks.

[Start Feature Development :material-arrow-right:](../guides/feature-development.md){ .md-button .md-button--primary }

---

## Open Arcade

After starting a tracked workflow, open Arcade from the same repository:

```bash
rp1 arcade
```

Use Arcade to:

- confirm the run appears under the right project
- see whether the workflow is running, waiting, completed, or failed
- open requirements, plans, reviews, and other artifacts
- follow external links such as reviewed PRs
- add or resolve artifact feedback when a run needs human input

[Explore Arcade :material-arrow-right:](../arcade/index.md){ .md-button }

---

## Branch From Here

<div class="grid cards" markdown>

-   :material-hammer-wrench: **Ship code**

    ---

    Use the main feature workflow when work needs requirements, design, task
    planning, implementation, review, and release checks.

    [:octicons-arrow-right-24: Feature development](../guides/feature-development.md)

-   :material-source-pull: **Review PRs**

    ---

    Run reviews, read findings, decide whether to block or proceed, and address
    feedback.

    [:octicons-arrow-right-24: PR review](../guides/pr-review.md)

-   :material-view-dashboard: **Monitor work**

    ---

    Open runs, inspect artifacts, follow links, and respond when workflows need
    attention.

    [:octicons-arrow-right-24: Arcade](../arcade/index.md)

-   :material-account-group: **Onboard teammates**

    ---

    Help teammates install rp1, generate context, and choose first workflows
    without reading raw project files first.

    [:octicons-arrow-right-24: Team onboarding](../guides/team-onboarding.md)

</div>
