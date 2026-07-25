---
scope: kbRoot
path_pattern: "index.md"
producer: knowledge-base
type: document
description: "Project overview and progressive KB entry point. Always generated -- serves as the navigation hub for all other KB documents."
strictness: strict
---
# [Project Name] - Knowledge Base

**Type**: Single Project
**Languages**: [Primary languages]
**Version**: [Version]
**Updated**: [Date]

## Project Summary

[2-3 sentences describing WHAT this project does and WHY it exists]

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | [main file/command] |
| Key Pattern | [primary architectural pattern] |
| Tech Stack | [core technologies] |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~[N] | System design, component relationships, data flows |
| interaction-model.md | ~[N] | Cross-surface interaction semantics, UX principles |
| modules.md | ~[N] | Component breakdown, module responsibilities |
| patterns.md | ~[N] | Code conventions, implementation patterns |
| concept_map.md | ~[N] | Domain terminology, business concepts |
| features.md | ~[N] | Capability inventory, coverage gaps, feature audience |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md`, `features.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Capability audit / coverage review | `features.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: .rp1/context/{filename}
```

## Project Structure

```
[key directories]
src/
├── [dir]/    # [purpose]
└── [dir]/    # [purpose]
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior and UX semantics
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **[features.md](features.md)**: Capability inventory and coverage
