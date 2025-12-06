# Quick Start

Get rp1 running in under **5 minutes**.

---

## Prerequisites

Before installing rp1, ensure you have:

- **An AI coding assistant** installed:
    - [Claude Code](https://claude.ai/code) - Anthropic's official CLI for Claude
    - [OpenCode](https://github.com/opencode-ai/opencode) - Vendor-independent alternative
- **A codebase** you want to enhance with rp1 workflows

---

## Installation

Choose your platform and follow the installation steps:

=== "Claude Code"

    **Step 1: Add the marketplace**

    ```bash
    /plugin marketplace add rp1-run/rp1
    ```

    **Step 2: Install the plugins**

    ```bash
    /plugin install rp1-base
    /plugin install rp1-dev
    ```

    **Step 3: Restart Claude Code**

    Close and reopen Claude Code to load the new plugins.

    **Step 4: Verify installation**

    Type `/` to see available commands. You should see rp1 commands listed (look for `knowledge-build`, `feature-requirements`, etc.).

=== "OpenCode"

    **Step 1: Install rp1 CLI globally (recommended)**

    ```bash
    bun install -g @rp1-run/rp1
    rp1 install:opencode
    ```

    Or run without installing:

    ```bash
    bunx @rp1-run/rp1 install:opencode
    ```

    !!! tip "Using npm instead"
        If you prefer npm, use `npx @rp1-run/rp1 install:opencode`

    **Step 2: Restart OpenCode**

    Close and reopen OpenCode to load the new plugins.

    **Step 3: Verify installation**

    Type `/` to see available commands. You should see rp1 commands listed (look for `/rp1-base/` and `/rp1-dev/`).

---

## Your First Command

Let's build a **knowledge base** for your codebase. This analyzes your project structure, architecture, and patterns.

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base/knowledge-build
    ```

### Expected Output

After running the command, you should see output similar to:

```
READY [monorepo: 2 projects]
```

or for a single project:

```
READY [single-project]
```

This indicates rp1 has analyzed your codebase and created a knowledge base in `.rp1/context/`.

---

## What Just Happened?

The `knowledge-build` command:

1. **Scanned your codebase** - Analyzed file structure and identified key components
2. **Extracted architecture** - Mapped system patterns, layers, and integrations
3. **Documented concepts** - Built a domain concept map and terminology glossary
4. **Created a knowledge base** - Stored everything in `.rp1/context/` for future commands

!!! tip "Knowledge Base Files"

    Check out your new knowledge base:

    - `.rp1/context/index.md` - Project overview
    - `.rp1/context/architecture.md` - System architecture
    - `.rp1/context/modules.md` - Component breakdown
    - `.rp1/context/concept_map.md` - Domain concepts
    - `.rp1/context/patterns.md` - Implementation patterns

---

## Next Steps

Now that rp1 is installed and understands your codebase, explore what you can do:

<div class="grid cards" markdown>

-   :material-book-open-variant:{ .lg .middle } **Guides**

    ---

    Step-by-step tutorials for common workflows like feature development and PR review.

    [:octicons-arrow-right-24: View Guides](../guides/index.md)

-   :material-book-search:{ .lg .middle } **Reference**

    ---

    Complete documentation for all 21 commands across both plugins.

    [:octicons-arrow-right-24: View Reference](../reference/index.md)

-   :material-lightbulb:{ .lg .middle } **Concepts**

    ---

    Understand constitutional prompting and knowledge-aware agents.

    [:octicons-arrow-right-24: View Concepts](../concepts/index.md)

</div>

---

## Common Commands

Here are some frequently used commands to try next:

=== "Claude Code"

    | Command | Description |
    |---------|-------------|
    | `/blueprint` | Start a new project with charter and PRD |
    | `/feature-requirements <id>` | Collect requirements for a feature |
    | `/feature-design <id>` | Create technical design |
    | `/pr-review` | Review a pull request |
    | `/code-check` | Run lints, tests, and coverage |

=== "OpenCode"

    | Command | Description |
    |---------|-------------|
    | `/rp1-dev/blueprint` | Start a new project with charter and PRD |
    | `/rp1-dev/feature-requirements <id>` | Collect requirements for a feature |
    | `/rp1-dev/feature-design <id>` | Create technical design |
    | `/rp1-dev/pr-review` | Review a pull request |
    | `/rp1-dev/code-check` | Run lints, tests, and coverage |

---

## Troubleshooting

??? question "Commands not appearing after installation?"

    **Claude Code**: Make sure you restarted Claude Code after installing the plugins.

    **OpenCode**: Check that the installer completed successfully and the plugins are in the correct directory.

??? question "Knowledge build taking too long?"

    First-time builds analyze your entire codebase and can take 10-15 minutes for large projects. Subsequent builds are incremental and take 2-5 minutes.

??? question "Getting errors?"

    Check the [GitHub Issues](https://github.com/rp1-run/rp1/issues) or open a new issue with your error message.

---

## Need Help?

- **GitHub**: [rp1-run/rp1](https://github.com/rp1-run/rp1)
- **Issues**: [Report a bug or request a feature](https://github.com/rp1-run/rp1/issues)
