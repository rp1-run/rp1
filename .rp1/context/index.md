# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, Shell
**Version**: 0.6.4-dev
**Updated**: 2026-03-25
**Projects**: 7 (cli, cli/web-ui, plugins/base, plugins/dev, plugins/utils, evals, packages/catppuccin-mermaid)

## Project Summary

rp1 is a CLI tool and plugin system that orchestrates AI coding agents across multiple host platforms (Claude Code, OpenCode, Codex). It provides a plugin architecture for skills and agents, a build pipeline that compiles markdown-first workflow definitions into platform-specific artifacts, and an event-sourced dashboard (Arcade) for monitoring agent runs with real-time WebSocket updates and inline annotations.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin-based CLI + Map-Reduce Agent Orchestration |
| Tech Stack | Bun, TypeScript, fp-ts, React, Vite, SQLite, LiquidJS |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| cli | Core CLI: commands, agent-tools, build, install, init | TypeScript | src/main.ts |
| cli/web-ui | Arcade dashboard: React SPA + Bun HTTP/WS server | TypeScript/TSX | src/main.tsx / src/server.ts |
| plugins/base | KB generation, research, strategy, security, Mermaid | Markdown | skills/knowledge-build/ |
| plugins/dev | Feature delivery, PR review, blueprint, code audit | Markdown | skills/build/ |
| plugins/utils | Prompt writing, tersification, eval building | Markdown | skills/prompt-writer/ |
| evals | Prompt attestation with content-addressable hashing | TypeScript | src/index.ts |
| packages/catppuccin-mermaid | Catppuccin Mermaid theme with WCAG contrast | TypeScript | src/index.ts |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~130 | System design, component relationships, data flows |
| modules.md | ~175 | Component breakdown, module responsibilities |
| patterns.md | ~82 | Code conventions, implementation patterns |
| concept_map.md | ~175 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |
| Security audit | `architecture.md` |

## How to Load

```
Read: {{$RP1_ROOT}}/context/{filename}
```

## Repository Structure

```
rp1/
├── cli/                # Core CLI (commands, agent-tools, build, install, init)
│   ├── src/            # TypeScript source
│   ├── web-ui/         # Arcade dashboard (React SPA + Bun server)
│   ├── scripts/        # Build scripts per platform
│   └── dist/           # Compiled plugin artifacts
├── plugins/
│   ├── base/           # KB, research, strategy, security, Mermaid
│   ├── dev/            # Build, PR review, blueprint, code audit
│   └── utils/          # Prompt writing, eval building
├── evals/              # Prompt attestation system
├── packages/
│   └── catppuccin-mermaid/  # Mermaid theme package
├── docs/               # MkDocs documentation site
├── scripts/            # Repository-level build/install scripts
├── catalog/            # Generated agent/skill catalogs
└── .rp1/               # Workspace (context, config, work)
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
