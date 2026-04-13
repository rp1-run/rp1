# Your First Workflow

You've installed rp1. Now let's put it to work.

---

## Choose Your Path

=== "Existing Codebase"

    You have an existing project and want rp1 to learn it. **Continue below** to build your knowledge base.

=== "Starting Fresh"

    You're creating a brand new project from scratch (a "greenfield" project - starting with a clean slate, no existing code).

    [Go to Bootstrap Guide :material-arrow-right:](../guides/bootstrap.md){ .md-button .md-button--primary }

    The bootstrap workflow will guide you through project creation with charter interviews, tech stack selection, and scaffolding.

---

## Build Your Knowledge Base

The first step with any existing codebase is building a **knowledge base**. This teaches rp1 about your project's structure, architecture, and patterns.

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

    !!! tip "Discovering Skills"
        Type `/skills` in OpenCode to browse all available skills. rp1 skills are prefixed with `rp1-` (e.g., `rp1-base-knowledge-build`, `rp1-dev-build`).

=== "Codex"

    ```bash
    $rp1-base-knowledge-build
    ```

### Expected Output

After the command completes, the final report ends with a summary like:

```
Knowledge Base Generated Successfully
Repository: single-project
Files Analyzed: 142

Files Written:
- .rp1/context/index.md
- .rp1/context/concept_map.md
- .rp1/context/architecture.md
- .rp1/context/interaction-model.md
- .rp1/context/modules.md
- .rp1/context/patterns.md
```

If nothing changed since the last successful build, you'll instead see a short
up-to-date message such as:

```
KB is up-to-date (commit a1b2c3d). No regeneration needed.
```

---

## What Just Happened?

The `knowledge-build` skill analyzed your codebase and updated the knowledge
base files in `.rp1/context/`.

!!! info "KB File Reference"
    See [What's in the Knowledge Base?](../concepts/knowledge-aware-agents.md#whats-in-the-knowledge-base) for the complete list of generated files and their purposes.

Future rp1 skills use this knowledge base automatically to understand your
codebase context, making their outputs more accurate and relevant. This is a
passive workflow, so it does not create an Arcade run.

!!! tip "Incremental Updates"
    First builds take 10-15 minutes for large projects. Subsequent runs are
    incremental and usually complete in 2-5 minutes.

---

## Ready to Ship? Start Here

The **recommended next step** is to pick the delivery workflow that matches your
scope:

| If you want to... | Start with |
|-------------------|------------|
| Run a multi-step feature workflow that you can resume later by feature id | `build` |
| Make a small or medium one-off change with a lightweight plan artifact | `build-fast` |

`build` is rp1's flagship workflow. It reuses the active run for the same
feature when possible. `build-fast` always starts fresh and stores its plan
under `.rp1/work/quick-builds/`.

[Start Feature Development :material-arrow-right:](../guides/feature-development.md){ .md-button .md-button--primary }

---

## Explore More Workflows

Now that rp1 understands your codebase, try these workflows:

!!! tip "Codex equivalents"
    In Codex, use the same workflows with `$rp1-...` names such as
    `$rp1-dev-blueprint`, `$rp1-dev-build`, `$rp1-dev-build-fast`, and
    `$rp1-dev-pr-review`.

<div class="grid cards" markdown>

-   :material-file-document-edit: **Start a New Feature**

    ---

    Create a charter and PRD for a new project or feature.

    `/blueprint`

-   :material-hammer-wrench: **Build a Feature**

    ---

    Full workflow from requirements to verified implementation.

    `/build my-feature`

-   :material-lightning-bolt: **Quick Task**

    ---

    Small fixes or enhancements under 2 hours.

    `/build-fast "Add dark mode toggle"`

-   :material-source-pull: **Review a Pull Request**

    ---

    Get structured feedback on code changes.

    `/pr-review`

</div>

---

## Next Steps

<div class="grid cards" markdown>

-   :material-book-open-variant: **[Guides](../guides/index.md)**

    ---

    Step-by-step tutorials for feature development, PR review, and more.

-   :material-book-search: **[Reference](../reference/index.md)**

    ---

    Complete documentation for all skills.

-   :material-lightbulb: **[Concepts](../concepts/index.md)**

    ---

    Understand constitutional prompting and knowledge-aware agents.

</div>
