# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, JSON, YAML, TOML, Shell, Python, CSS, HTML
**Version**: 0.5.2
**Updated**: 2026-03-09
**Projects**: 7 (`cli`, `cli/web-ui`, `plugins/base`, `plugins/dev`, `plugins/utils`, `evals`, `packages/catppuccin-mermaid`)

## Project Summary

rp1 is an AI-assisted development workflow system built around a Bun and TypeScript CLI, markdown-authored skills and agents, a live Web UI dashboard, and supporting evaluation and documentation tooling. The repository is organized as a plugin-driven monorepo where `base` provides foundational knowledge and utility workflows, `dev` builds higher-level implementation and review workflows on top of that base, and shared runtime services track execution state through local SQLite-backed agent tools.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin architecture with skill-agent delegation |
| Tech Stack | Bun, TypeScript, React, Vite, Tailwind CSS, Commander, fp-ts, SQLite |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| `cli` | Main executable and shared runtime | TypeScript | `cli/src/main.ts` |
| `cli/web-ui` | Live project and run dashboard | TSX | `cli/web-ui/src/app/App.tsx` |
| `plugins/base` | KB, docs, strategy, and utility workflows | Markdown | `plugins/base/skills/` |
| `plugins/dev` | Build, review, and delivery workflows | Markdown | `plugins/dev/skills/` |
| `plugins/utils` | Prompt and helper workflows | Markdown | `plugins/utils/skills/` |
| `evals` | Prompt and artifact attestation tooling | TypeScript | `evals/src/index.ts` |
| `packages/catppuccin-mermaid` | Mermaid theming package | TypeScript | `packages/catppuccin-mermaid/src/index.ts` |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~189 | System design, component relationships, data flows |
| modules.md | ~144 | Component breakdown, module responsibilities |
| patterns.md | ~84 | Code conventions, implementation patterns |
| concept_map.md | ~101 | Domain terminology, business concepts |
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
├── cli/                         # Main CLI, runtime services, and Web UI server
├── plugins/base/                # Foundational KB and utility workflows
├── plugins/dev/                 # Feature and PR workflows
├── plugins/utils/               # Prompt utility workflows
├── evals/                       # Prompt and artifact evaluation tooling
├── packages/catppuccin-mermaid/ # Mermaid theming package
└── docs/                        # Published documentation site
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **[dependencies.md](dependencies.md)**: Inter-project dependencies
- **[technology-matrix.md](technology-matrix.md)**: Technology decisions
