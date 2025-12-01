---
hide:
  - navigation
  - toc
---

# Stop prompting. **Start shipping.**

Professional development workflows for AI coding assistants. No iteration loops. No guesswork. Just battle-tested patterns that execute flawlessly.

[Get Started](getting-started/quickstart.md){ .md-button .md-button--primary }
[View on GitHub](https://github.com/rp1-run/rp1){ .md-button }

---

## The Problem

AI coding assistants are powerful, but ad-hoc prompting leads to:

<div class="grid cards" markdown>

-   :material-refresh:{ .lg .middle } **Iteration Loops**

    ---

    Back-and-forth refinement wastes time and context. Each retry loses valuable context from the conversation.

-   :material-head-question:{ .lg .middle } **Inconsistent Results**

    ---

    Same task, different prompts, different outcomes. Quality depends on how well you phrase your request.

-   :material-puzzle:{ .lg .middle } **Context Blindness**

    ---

    Generic responses ignore your codebase patterns, architecture, and conventions.

</div>

---

## The Solution

**Constitutional prompting** encodes expertise into reusable patterns that execute in a single pass.

<div class="grid cards" markdown>

-   :material-clock-fast:{ .lg .middle } **Time Savings**

    ---

    Expert-crafted prompts eliminate trial and error. Tasks that took multiple iterations now complete in one shot.

-   :material-check-all:{ .lg .middle } **Consistency**

    ---

    Same workflow, same quality, every time. Built-in validation ensures outputs meet your standards.

-   :material-eye:{ .lg .middle } **Codebase Awareness**

    ---

    Knowledge-aware agents understand your architecture, patterns, and conventions before they write code.

</div>

---

## How It Works

```mermaid
graph LR
    A[Your Idea] --> B[Blueprint]
    B --> C[Requirements]
    C --> D[Design]
    D --> E[Tasks]
    E --> F[Build]
    F --> G[Verify]
    G --> H[Ship]

    style A fill:#673ab7,color:#fff
    style H fill:#673ab7,color:#fff
```

**rp1** provides 21 commands backed by 18 specialized agents that handle the entire development lifecycle:

1. **Blueprint**: Capture project vision through charter and PRD documents
2. **Requirements**: Transform ideas into detailed specifications
3. **Design**: Create technical designs with architecture diagrams
4. **Tasks**: Break down work into actionable steps
5. **Build**: Implement systematically with automated testing
6. **Verify**: Validate against acceptance criteria
7. **Review**: Comprehensive PR review with map-reduce analysis

---

## Platform Support

rp1 works with your favorite AI coding assistant:

<div class="grid cards" markdown>

-   :simple-anthropic:{ .lg .middle } **Claude Code**

    ---

    Native plugin support via the Claude Code marketplace.

    ```bash
    /plugin marketplace add rp1-run/rp1
    /plugin install rp1-base
    /plugin install rp1-dev
    ```

-   :material-code-braces:{ .lg .middle } **OpenCode**

    ---

    Vendor-independent CLI plugin execution.

    ```bash
    curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
    ```

</div>

---

## Ready to Ship?

Get started in under 5 minutes with our quick start guide.

[Get Started :material-arrow-right:](getting-started/quickstart.md){ .md-button .md-button--primary }

<br>

<div align="center" markdown>

[![GitHub stars](https://img.shields.io/github/stars/rp1-run/rp1?style=social)](https://github.com/rp1-run/rp1)

</div>
