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
    /rp1-base/knowledge-build
    ```

### Expected Output

After the command completes, you'll see:

```
READY [monorepo: 2 projects]
```

or for a single project:

```
READY [single-project]
```

---

## What Just Happened?

The `knowledge-build` command analyzed your codebase and created knowledge base files in `.rp1/context/`.

!!! info "KB File Reference"
    See [What's in the Knowledge Base?](../concepts/knowledge-aware-agents.md#whats-in-the-knowledge-base) for the complete list of generated files and their purposes.

Future rp1 commands use this knowledge base to understand your codebase context, making their outputs more accurate and relevant.

!!! tip "Incremental Updates"
    First builds take 10-15 minutes for large projects. Subsequent runs are incremental and complete in 2-5 minutes.

---

## Ready to Ship? Start Here

The **recommended next step** is to build a feature. This is rp1's flagship workflow - from requirements to deployed code.

[Start Feature Development :material-arrow-right:](../guides/feature-development.md){ .md-button .md-button--primary }

---

## Explore More Workflows

Now that rp1 understands your codebase, try these workflows:

<div class="grid cards" markdown>

-   :material-file-document-edit: **Start a New Feature**

    ---

    Create a charter and PRD for a new project or feature.

    `/blueprint`

-   :material-clipboard-check: **Gather Requirements**

    ---

    Collect and structure requirements for a feature.

    `/feature-requirements my-feature`

-   :material-pencil-ruler: **Create Technical Design**

    ---

    Generate detailed technical specifications.

    `/feature-design my-feature`

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

    Complete documentation for all commands.

-   :material-lightbulb: **[Concepts](../concepts/index.md)**

    ---

    Understand constitutional prompting and knowledge-aware agents.

</div>
