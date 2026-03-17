# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, JSON, YAML, TOML, Shell, Python, CSS, HTML
**Version**: 0.5.2
**Updated**: 2026-03-15
**Projects**: 7 (`cli`, `cli/web-ui`, `plugins/base`, `plugins/dev`, `plugins/utils`, `evals`, `packages/catppuccin-mermaid`)

## Project Summary

rp1 is a plugin-driven AI development workflow system built around a Bun and TypeScript CLI, markdown-authored skills and agents, local workflow state tracking, a live Web UI dashboard, and eval tooling for prompt attestation. The repository exists to make agent workflows inspectable, reproducible, and easier to ship across Claude Code, OpenCode, and Codex.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Skill-as-orchestrator with agent delegation |
| Tech Stack | Bun, TypeScript, React, Vite, Tailwind CSS, Commander, fp-ts, SQLite |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| `cli` | Main executable, installers, build pipeline, and runtime services | TypeScript | `cli/src/main.ts` |
| `cli/web-ui` | Local dashboard, daemon server, APIs, and run visualization | TSX | `cli/web-ui/src/server.ts` |
| `plugins/base` | KB, docs, Mermaid, strategy, and foundational workflows | Markdown | `plugins/base/skills/` |
| `plugins/dev` | Feature delivery, review, audit, and archive workflows | Markdown | `plugins/dev/skills/` |
| `plugins/utils` | Prompt utility and eval-helper workflows | Markdown | `plugins/utils/skills/` |
| `evals` | Prompt evaluation and attestation tooling | TypeScript | `evals/src/index.ts` |
| `packages/catppuccin-mermaid` | Shared Mermaid theming package | TypeScript | `packages/catppuccin-mermaid/src/index.ts` |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~88 | System design, component relationships, data flows |
| modules.md | ~68 | Component breakdown, module responsibilities |
| patterns.md | ~84 | Code conventions, implementation patterns |
| concept_map.md | ~64 | Domain terminology, business concepts |
| dependencies.md | ~100 | Inter-project dependencies, shared code |
| technology-matrix.md | ~84 | Technology decisions, framework choices |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |
| Security audit | `architecture.md`, `dependencies.md` |

## How to Load

```
Read: {{$RP1_ROOT}}/context/{filename}
```

## Repository Structure

```text
rp1/
├── cli/                         # Main CLI, installers, and runtime services
├── cli/web-ui/                  # Dashboard frontend and Bun daemon server
├── plugins/base/                # Foundational KB and utility workflows
├── plugins/dev/                 # Delivery, review, and archive workflows
├── plugins/utils/               # Prompt and helper workflows
├── evals/                       # Prompt evaluation and attestation tooling
└── packages/catppuccin-mermaid/ # Shared Mermaid theming package
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **[dependencies.md](dependencies.md)**: Inter-project dependencies
- **[technology-matrix.md](technology-matrix.md)**: Technology decisions
