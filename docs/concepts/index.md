# Concepts

Understanding the core ideas behind rp1 helps you get the most out of its workflows. These concept guides explain the "why" behind rp1's design decisions.

---

<div class="grid cards" markdown>

-   :material-script-text: **Constitutional Prompting**

    ---

    Learn how rp1 encodes expert knowledge into AI-executable workflows for consistent, single-pass execution.

    [:octicons-arrow-right-24: Learn more](constitutional-prompting.md)

-   :material-brain: **Knowledge-Aware Agents**

    ---

    Discover how agents understand your codebase before writing code, respecting your patterns and architecture.

    [:octicons-arrow-right-24: Learn more](knowledge-aware-agents.md)

-   :material-layers: **Command-Agent Pattern**

    ---

    Understand the architecture where thin wrapper commands delegate to autonomous agents.

    [:octicons-arrow-right-24: Learn more](command-agent-pattern.md)

-   :material-sitemap: **Map-Reduce Workflows**

    ---

    See how rp1 parallelizes work for knowledge base generation and PR reviews.

    [:octicons-arrow-right-24: Learn more](map-reduce-workflows.md)

-   :material-restart: **Stateless Agents**

    ---

    Learn how resumable interview workflows use file-based state for robustness.

    [:octicons-arrow-right-24: Learn more](stateless-agents.md)

-   :material-source-branch: **Parallel Worktrees**

    ---

    Run multiple tasks simultaneously using git worktrees for isolated execution.

    [:octicons-arrow-right-24: Learn more](parallel-worktrees.md)

-   :material-account-check: **Builder-Reviewer Agents**

    ---

    Learn how adversarial cooperation between builder and reviewer agents ensures reliable code implementation.

    [:octicons-arrow-right-24: Learn more](builder-reviewer-agents.md)

</div>

---

## Quick Overview

| Concept | What It Is | Why It Matters |
|---------|-----------|----------------|
| [Constitutional Prompting](constitutional-prompting.md) | Expert knowledge encoded in prompts | No iteration loops, consistent output |
| [Knowledge-Aware Agents](knowledge-aware-agents.md) | Agents that understand your codebase | Output fits your architecture |
| [Command-Agent Pattern](command-agent-pattern.md) | Commands delegate to agents | Clean, reusable workflows |
| [Map-Reduce Workflows](map-reduce-workflows.md) | Parallel processing pattern | Fast KB and PR analysis |
| [Stateless Agents](stateless-agents.md) | Resumable interview workflows | Robust, transparent state |
| [Parallel Worktrees](parallel-worktrees.md) | Git worktree isolation | Run multiple tasks at once |
| [Builder-Reviewer Agents](builder-reviewer-agents.md) | Adversarial agent cooperation | Higher quality, reliable code |

---

## Where to Start

**New to rp1?** Start with [Constitutional Prompting](constitutional-prompting.md) to understand rp1's core philosophy.

**Want context-aware output?** Read [Knowledge-Aware Agents](knowledge-aware-agents.md) to learn about the knowledge base.

**Curious about architecture?** See [Command-Agent Pattern](command-agent-pattern.md) for the technical design.

**Need performance?** Check [Map-Reduce Workflows](map-reduce-workflows.md) for parallelization patterns.

**Building resumable workflows?** See [Stateless Agents](stateless-agents.md) for interrupt-safe interview patterns.

**Running tasks in parallel?** Check [Parallel Worktrees](parallel-worktrees.md) for isolated task execution.

**Want reliable implementations?** See [Builder-Reviewer Agents](builder-reviewer-agents.md) for adversarial cooperation.
