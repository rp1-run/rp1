---
name: knowledge-load
description: "Loads and prepares the rp1 knowledge base for analysis tasks. Reads KB markdown files from .rp1/context/, detects repository structure, and reports readiness. Use when the user wants to load the knowledge base, prepare context for analysis, or initialize KB before working with code. Deprecated — commands now load KB automatically."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 2.1.0
  tags:
    - core
    - documentation
    - analysis
    - planning
    - deprecated
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "[mode]"
---

# Knowledge Loader

> **DEPRECATED**: All rp1 commands now load KB context automatically via their agents.
> You no longer need to run `/knowledge-load` before using other commands.
>
> **For agent developers**: Use direct Read tool calls to load KB files progressively.
> See the [Progressive Loading Pattern](#progressive-loading-pattern) below.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `LOAD_MODE` | No | `progressive` | Loading mode. Set `full` if user says "full", "all", or "everything"; otherwise `progressive` |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)

## Workflow

1. **Detect repository structure** — Determine single project, monorepo root, or monorepo subproject based on directory layout
2. **Load KB files** based on mode:
   - **Progressive** (default): Load only `{{$RP1_ROOT}}/context/index.md` — agents load additional files on demand
   - **Full**: Load all markdown files from `{{$RP1_ROOT}}/context/`
3. **Report status** — Output a single-line readiness confirmation

### Loading by Repository Type

All files are in `{{$RP1_ROOT}}/context/`.

| Type | Required Files | Optional Files |
|------|---------------|----------------|
| Single project | index.md, concept_map.md, architecture.md, modules.md, patterns.md | api.md, runtime.md, data.md |
| Monorepo root | index.md, architecture.md, dependencies.md, patterns.md | concept_map.md, shared/*.md, projects/*/overview.md |
| Monorepo subproject | dependencies.md, patterns.md, projects/{name}/*.md | index.md, architecture.md, shared/*.md |

## Output

**Success**: `READY [progressive]` or `READY [full: N files]`
**Error**: `ERROR: [specific error description]`

Do ALL analysis in `<thinking>` tags. Output only the final `READY` or `ERROR` line.

---

## Progressive Loading Pattern

**For agent developers**: The recommended pattern for KB-aware agents.

### Why Progressive Loading?

- **Context efficiency**: ~80 lines vs ~1180 lines for most tasks
- **Better instruction following**: Smaller context improves adherence
- **Faster responses**: Less context to process

### Task-to-KB-Files Mapping

| Task Type | KB Files to Load |
|-----------|------------------|
| Code review | `index.md` + `patterns.md` |
| Bug investigation | `index.md` + `architecture.md` + `modules.md` |
| Feature implementation | `index.md` + `modules.md` + `patterns.md` |
| PR review | `index.md` + `patterns.md` |
| Strategic analysis | ALL files (use full mode) |
| Security audit | `index.md` + `architecture.md` |

### Critical: Subagent Limitation

**NEVER use `/knowledge-load` command in subagents**. Using SlashCommand tool in subagents causes early exit.

Always use direct Read tool calls:

```markdown
# CORRECT (in subagent)
Read `{{$RP1_ROOT}}/context/index.md`

# INCORRECT (causes subagent to exit)
Run `/knowledge-load`
```
