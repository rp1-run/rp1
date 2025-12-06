# KB Loading Patterns for Agent Developers

Learn how to implement knowledge-aware agents that efficiently load KB context.

---

## Overview

rp1 agents are **self-contained**: they load knowledge base context automatically without requiring users to run `/knowledge-load` first. This guide explains how to implement KB loading in your agents.

!!! warning "Deprecated Command"
    The `/knowledge-load` command is deprecated. All rp1 commands now load KB context automatically via their agents.

---

## The Two Loading Patterns

### Progressive Loading (Recommended)

Use for most agents. Load only what you need.

```markdown
## 1. Load Knowledge Base

Read `{RP1_ROOT}/context/index.md` to understand project structure and available KB files.

**Selective Loading**: Based on your task, load additional files as needed:
- For pattern consistency checks → Read `{RP1_ROOT}/context/patterns.md`
- For architecture understanding → Read `{RP1_ROOT}/context/architecture.md`
- For component details → Read `{RP1_ROOT}/context/modules.md`

Do NOT load all KB files unless performing holistic analysis.
```

**Benefits**:

- ~80 lines vs ~1180 lines of context
- Better instruction following
- Faster responses
- More room for actual task work

### Full Loading (Holistic Tasks Only)

Use for agents that need complete codebase understanding.

```markdown
## 1. Load Knowledge Base

Read all markdown files from `{RP1_ROOT}/context/*.md`:
- `{RP1_ROOT}/context/index.md` - Project overview
- `{RP1_ROOT}/context/architecture.md` - System design
- `{RP1_ROOT}/context/modules.md` - Component breakdown
- `{RP1_ROOT}/context/concept_map.md` - Domain terminology
- `{RP1_ROOT}/context/patterns.md` - Code conventions

If `{RP1_ROOT}/context/` doesn't exist, warn user to run `/knowledge-build` first.
```

**Use for**:

- Strategic analysis (`strategic-advisor`)
- Security audits (`security-validator`)
- Project documentation (`project-documenter`)

---

## Task-to-KB-Files Mapping

| Task Type | KB Files to Load |
|-----------|------------------|
| Code review | `index.md` + `patterns.md` |
| Bug investigation | `index.md` + `architecture.md` + `modules.md` |
| Feature implementation | `index.md` + `modules.md` + `patterns.md` |
| PR review | `index.md` + `patterns.md` |
| Architecture analysis | `index.md` + `architecture.md` |
| Strategic analysis | ALL files |
| Security audit | `index.md` + `architecture.md` |
| Documentation | ALL files |

---

## Critical: Subagent Limitation

!!! danger "Never Use `/knowledge-load` in Subagents"
    Using the SlashCommand tool in subagents causes the agent to exit early, returning only the command output instead of completing its workflow.

**Correct Pattern** (in subagent):

```markdown
## 1. Load Knowledge Base

Read `{RP1_ROOT}/context/index.md` to understand project structure.

Based on your task, selectively load additional files:
- Read `{RP1_ROOT}/context/patterns.md` for code conventions
- Read `{RP1_ROOT}/context/architecture.md` for system design
```

**Incorrect Pattern** (DO NOT USE in subagents):

```markdown
## 1. Load Knowledge Base

Run `/knowledge-load` to load KB context.  <!-- BREAKS SUBAGENT -->
```

---

## Implementing in Your Agent

### Step 1: Add KB Loading Section

Add this as the first workflow step in your agent:

=== "Progressive (Most Agents)"

    ```markdown
    ## 1. Load Project Knowledge Base

    Read `{RP1_ROOT}/context/index.md` to understand:
    - Project structure and technology stack
    - Available KB files and when to load them
    - Key patterns and entry points

    **On-Demand Loading**: If your task requires deeper context:
    - Pattern checks → Read `patterns.md`
    - Architecture questions → Read `architecture.md`
    - Component details → Read `modules.md`
    - Domain terminology → Read `concept_map.md`
    ```

=== "Full (Holistic Agents)"

    ```markdown
    ## 1. Load Project Knowledge Base

    Read ALL KB files from `{RP1_ROOT}/context/`:

    1. `index.md` - Project overview and structure
    2. `architecture.md` - System design and patterns
    3. `modules.md` - Component breakdown
    4. `concept_map.md` - Domain terminology
    5. `patterns.md` - Code conventions

    If KB directory doesn't exist, inform user:
    "Knowledge base not found. Run `/knowledge-build` first."
    ```

### Step 2: Handle Missing KB

Always include error handling:

```markdown
**If KB files are missing**:
- Check if `{RP1_ROOT}/context/index.md` exists
- If not, inform user: "Knowledge base not found. Run `/knowledge-build` to generate it."
- Continue with reduced context if possible, or exit gracefully
```

### Step 3: Document KB Requirements

In your agent's parameter table, document which KB files are needed:

```markdown
## Parameters

| Name | Default | Purpose |
|------|---------|---------|
| RP1_ROOT | `.rp1/` | Root directory for KB artifacts |

**KB Files Used**:
- `index.md` (required) - Project overview
- `patterns.md` (task-dependent) - For pattern consistency checks
```

---

## Example: PR Sub-Reviewer Agent

Here's how the PR sub-reviewer implements progressive loading:

```markdown
## 1. Load Project Knowledge Base

Read `{RP1_ROOT}/context/index.md` to understand project structure.

**Selective Loading** (required for this agent):
- Read `{RP1_ROOT}/context/patterns.md` - Code patterns for consistency checks

**Do NOT load**: architecture.md, modules.md, concept_map.md
(not needed for single-file PR review)
```

---

## Best Practices

1. **Start minimal**: Load `index.md` first, add more only if needed
2. **Document clearly**: Specify which KB files your agent needs and why
3. **Handle errors gracefully**: Always check if KB exists before loading
4. **Never use SlashCommand**: Use direct Read tool calls in subagents
5. **Consider context budget**: ~1000 lines of KB = less room for code context

---

## Related Resources

- [Knowledge-Aware Agents](../concepts/knowledge-aware-agents.md) - How agents use KB context
- [Constitutional Prompting](../concepts/constitutional-prompting.md) - Agent structure patterns
- [`knowledge-build` Reference](../reference/base/knowledge-build.md) - Generating the KB
