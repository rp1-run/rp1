# Getting Started

Get rp1 running in minutes and start using KB-backed workflows from Claude
Code, OpenCode, or Codex.

## What is rp1?

rp1 brings structured, repeatable workflows to AI coding assistants. Instead of
rebuilding context in every prompt, you generate a project knowledge base once
and then use workflow skills for feature delivery, bug investigation, PR
review, documentation, and more.

## Invocation Patterns

The workflow is the same on each host. Only the invocation syntax changes:

| Host | Example |
|------|---------|
| Claude Code | `/build my-feature` |
| OpenCode | `/rp1-dev-build my-feature` |
| Codex | `$rp1-dev-build my-feature` |

## Quick Links

<div class="grid cards" markdown>

-   :material-download:{ .lg .middle } **Install rp1**

    ---

    Get the CLI and plugins installed on your platform.

    [:octicons-arrow-right-24: Installation](installation.md)

-   :material-rocket-launch:{ .lg .middle } **First Workflow**

    ---

    Run your first command and build your knowledge base.

    [:octicons-arrow-right-24: First Workflow](first-workflow.md)

-   :material-folder-outline:{ .lg .middle } **The .rp1 Directory**

    ---

    Understand the workspace structure and configuration.

    [:octicons-arrow-right-24: Directory Guide](rp1-directory.md)

</div>

## Prerequisites

Before you begin, you need:

- **An AI coding assistant**:
  [Claude Code](https://claude.ai/code),
  [OpenCode](https://github.com/opencode-ai/opencode), or
  [Codex](https://github.com/openai/codex)
- **A codebase** to enhance with rp1 workflows
