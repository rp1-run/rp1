# guide

Discover rp1 skills, get workflow guidance, and ask questions about rp1 capabilities.

---

## Synopsis

=== "Claude Code"

    ```bash
    /guide
    ```

    With a question:

    ```bash
    /guide "what can rp1 do for documentation?"
    ```

=== "OpenCode"

    ```bash
    /rp1-base-guide
    ```

    With a question:

    ```bash
    /rp1-base-guide "what can rp1 do for documentation?"
    ```

## Description

The `guide` skill helps you discover and use rp1 capabilities. It operates in two modes:

- **No question**: Shows a capability overview of all installed skills organized by category.
- **With question**: Classifies your question and answers from the appropriate source (skill catalog, workflow patterns, or reference docs).

The skill dynamically validates that suggested skills are actually installed using `rp1 list --json`, so recommendations always reflect your current setup.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `QUESTION` | No | Freeform question about rp1 capabilities (omit for overview) |

## Intent Categories

When you ask a question, the skill classifies it into one of six categories and routes to the appropriate source:

| Intent | Example Questions | Source |
|--------|-------------------|--------|
| **Discovery** | "What skills are available?", "List documentation skills" | Skill catalog |
| **Comparison** | "Difference between /build and /build-fast?", "When to use /speedrun?" | Skill catalog |
| **Workflow** | "How do I do a full feature end-to-end?", "What comes after /build?" | Workflow patterns |
| **How-to** | "How do I use /pr-review?", "What flags does /build accept?" | Workflow patterns, then catalog |
| **Troubleshooting** | "/knowledge-build isn't working", "Can't find a skill" | Reference docs |
| **Meta** | "How does rp1 work internally?", "Architecture of the build pipeline" | Reference docs |

## Examples

### Capability Overview

=== "Claude Code"

    ```bash
    /guide
    ```

=== "OpenCode"

    ```bash
    /rp1-base-guide
    ```

Shows all installed skills grouped by category (development, investigation, quality, review, documentation, knowledge, strategy, planning, prompt) with one-line descriptions and workflow indicators.

### Skill Discovery

```
/guide "what can rp1 do for code quality?"
```

Returns relevant skills (`/code-check`, `/code-audit`, `/code-clean-comments`) with descriptions and offers to invoke them.

### Workflow Guidance

```
/guide "how do I build a feature end-to-end?"
```

Explains the `/build` workflow sequence (requirements, design, tasks, implementation, verification) and offers to start it.

### Skill Comparison

```
/guide "difference between /build and /build-fast?"
```

Provides a side-by-side comparison covering purpose, scope, workflow phases, and when to use each.

## Suggestion Format

When the skill recommends a command, each suggestion includes:

1. **Skill name** with `/` prefix
2. **One sentence** explaining why it fits your situation
3. **Invocation offer** with pre-filled parameters inferred from context

The skill waits for your confirmation before invoking anything.

## Related

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base that powers rp1 agents
- [`deep-research`](deep-research.md) - In-depth codebase and technical investigation
- [`write-content`](write-content.md) - Interactive technical content creation
