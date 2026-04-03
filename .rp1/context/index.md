# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, TSX, Markdown, Shell
**Version**: 0.6.5-dev
**Updated**: 2026-04-03

## Project Summary

rp1 is a developer-facing CLI and plugin system that orchestrates AI coding agents across multiple host tools (Claude Code, OpenCode, Codex). It provides structured workflows via skills and agents, real-time monitoring through the Arcade web dashboard, and a knowledge base system for codebase-aware agent execution.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin-based CLI with map-reduce agent orchestration |
| Tech Stack | Bun, TypeScript, React, Vite, fp-ts, SQLite, LiquidJS |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~144 | System design, component relationships, data flows |
| interaction-model.md | ~99 | Cross-surface interaction semantics, UX principles |
| modules.md | ~174 | Component breakdown, module responsibilities |
| patterns.md | ~82 | Code conventions, implementation patterns |
| concept_map.md | ~173 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: .rp1/context/{filename}
```

## Project Structure

```
cli/
├── src/               # CLI commands, agent-tools, build pipeline
│   ├── commands/      # User-facing CLI commands
│   ├── agent-tools/   # 9 agent tool subcommands (emit, task, feedback, etc.)
│   ├── build/         # Multi-platform artifact build pipeline
│   ├── install/       # Plugin installer with staging/rollback
│   └── init/          # Project initialization with Ink UI
├── shared/            # Cross-cutting library (errors, fp-ts, events, logger)
└── web-ui/            # Arcade dashboard (React SPA + Bun HTTP/WS server)
plugins/
├── base/              # KB, research, strategy, security (15 skills, 14 agents)
├── dev/               # Build, blueprint, PR review, code audit (19 skills, 33 agents)
└── utils/             # Prompt writing, tersification, evals (5 skills, 4 agents)
evals/                 # Prompt attestation with content-addressable hashing
packages/
└── catppuccin-mermaid/ # Mermaid theme package
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior and UX semantics
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
