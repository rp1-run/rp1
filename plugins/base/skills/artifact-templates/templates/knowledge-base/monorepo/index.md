---
scope: kbRoot
path_pattern: "index.md"
producer: knowledge-base
type: document
description: "Repository overview and progressive KB entry point for a monorepo. Always generated -- serves as the navigation hub for all other KB documents."
strictness: strict
---
# [Repository Name] - Knowledge Base

**Type**: Monorepo
**Languages**: [Primary languages]
**Version**: [Version]
**Updated**: [Date]
**Projects**: [Count] ([list project names])

## Project Summary

[2-3 sentences describing WHAT this repository does and WHY it exists]

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | [main command/project] |
| Key Pattern | [primary architectural pattern] |
| Tech Stack | [core technologies] |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| [project-a] | [brief purpose] | [lang] | [entry file] |
| [project-b] | [brief purpose] | [lang] | [entry file] |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~[N] | System design, component relationships, data flows |
| interaction-model.md | ~[N] | Cross-surface interaction semantics, UX principles |
| modules.md | ~[N] | Component breakdown, module responsibilities |
| patterns.md | ~[N] | Code conventions, implementation patterns |
| concept_map.md | ~[N] | Domain terminology, business concepts |
| dependencies.md | ~[N] | Inter-project dependencies, shared code |
| technology-matrix.md | ~[N] | Technology decisions, framework choices |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |
| Security audit | `architecture.md`, `dependencies.md` |

## How to Load

```
Read: .rp1/context/{filename}
```

## Repository Structure

```
[repo-name]/
├── [project-a]/    # [purpose]
├── [project-b]/    # [purpose]
└── [shared]/       # [shared infrastructure]
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior and UX semantics
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **[dependencies.md](dependencies.md)**: Inter-project dependencies
- **[technology-matrix.md](technology-matrix.md)**: Technology decisions
