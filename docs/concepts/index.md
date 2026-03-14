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

-   :material-layers: **Skill-Agent Pattern**

    ---

    Understand the architecture where skills (SKILL.md) delegate to autonomous agents.

    [:octicons-arrow-right-24: Learn more](command-agent-pattern.md)

-   :material-sitemap: **Map-Reduce Workflows**

    ---

    See how rp1 parallelizes work for knowledge base generation and PR reviews.

    [:octicons-arrow-right-24: Learn more](map-reduce-workflows.md)

-   :material-restart: **Stateless Agents**

    ---

    Learn how resumable interview workflows use file-based state for robustness.

    [:octicons-arrow-right-24: Learn more](stateless-agents.md)

-   :material-account-check: **Builder-Reviewer Agents**

    ---

    Learn how adversarial cooperation between builder and reviewer agents ensures reliable code implementation.

    [:octicons-arrow-right-24: Learn more](builder-reviewer-agents.md)

-   :material-shield-check: **Eval System**

    ---

    Understand how content-addressable attestation ensures prompt changes are tested and traceable.

    [:octicons-arrow-right-24: Learn more](eval-system.md)

-   :material-file-document-edit: **SKILL.md Format**

    ---

    The canonical format specification for all rp1 invocable prompts, replacing the legacy command format.

    [:octicons-arrow-right-24: Learn more](skill-format.md)

-   :material-keyboard: **WebUI Interaction**

    ---

    Navigate the rp1 WebUI with keyboard shortcuts, a command palette, and vim-style navigation.

    [:octicons-arrow-right-24: Learn more](webui.md)

-   :material-state-machine: **State Machines**

    ---

    Declarative workflow state management via co-located Mermaid state diagrams for validated transitions and dashboard visibility.

    [:octicons-arrow-right-24: Learn more](state-machines.md)

</div>

---

## Quick Overview

| Concept | What It Is | Why It Matters |
|---------|-----------|----------------|
| [Constitutional Prompting](constitutional-prompting.md) | Expert knowledge encoded in prompts | No iteration loops, consistent output |
| [Knowledge-Aware Agents](knowledge-aware-agents.md) | Agents that understand your codebase | Output fits your architecture |
| [Skill-Agent Pattern](command-agent-pattern.md) | Skills delegate to agents | Clean, reusable workflows |
| [Map-Reduce Workflows](map-reduce-workflows.md) | Parallel processing pattern | Fast KB and PR analysis |
| [Stateless Agents](stateless-agents.md) | Resumable interview workflows | Robust, transparent state |
| [Builder-Reviewer Agents](builder-reviewer-agents.md) | Adversarial agent cooperation | Higher quality, reliable code |
| [Eval System](eval-system.md) | Content-addressable attestation | Deterministic, traceable releases |
| [SKILL.md Format](skill-format.md) | Canonical format for all rp1 prompts | Single source of truth, cross-platform |
| [WebUI Interaction](webui.md) | Keyboard-first WebUI navigation | Fast navigation without a mouse |
| [State Machines](state-machines.md) | Declarative workflow state management | Validated transitions, automatic dashboard visibility |

---

## Where to Start

**New to rp1?** Start with [Constitutional Prompting](constitutional-prompting.md) to understand rp1's core philosophy.

**Want context-aware output?** Read [Knowledge-Aware Agents](knowledge-aware-agents.md) to learn about the knowledge base.

**Curious about architecture?** See [Skill-Agent Pattern](command-agent-pattern.md) for the technical design.

**Need performance?** Check [Map-Reduce Workflows](map-reduce-workflows.md) for parallelization patterns.

**Building resumable workflows?** See [Stateless Agents](stateless-agents.md) for interrupt-safe interview patterns.

**Want reliable implementations?** See [Builder-Reviewer Agents](builder-reviewer-agents.md) for adversarial cooperation.

**Building evals for prompts?** See [Eval System](eval-system.md) for content-addressable attestation.


**Migrating commands to skills?** See [SKILL.md Format](skill-format.md) for the canonical format specification.

**Using the WebUI?** See [WebUI Interaction](webui.md) for keyboard shortcuts and the command palette.

**Adding workflow tracking to a skill?** See [State Machines](state-machines.md) for the declarative state management pattern.
