# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, TSX, Markdown, Shell
**Version**: 0.6.4-dev
**Updated**: 2026-03-26

## Project Summary

rp1 is an AI agent orchestration CLI that enables developers to compose, build, and monitor agentic workflows across multiple host platforms (Claude Code, OpenCode, Codex). It provides a plugin architecture with skills and agents authored as markdown, compiled to platform-specific artifacts, and tracked via an event-sourced dashboard (Arcade).

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Skill-Agent delegation with state-machine-driven workflows |
| Tech Stack | Bun, TypeScript, fp-ts, React, Vite, SQLite, LiquidJS |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~112 | System design, component relationships, data flows |
| modules.md | ~159 | Component breakdown, module responsibilities |
| patterns.md | ~79 | Code conventions, implementation patterns |
| concept_map.md | ~183 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: .rp1/context/{filename}
```

## Project Structure

```
cli/
├── src/                  # CLI core (commands, agent-tools, build, install, init)
│   ├── agent-tools/      # 9 subcommands (emit, task, feedback, github-pr, state-machine, ...)
│   ├── build/            # Multi-platform LiquidJS build pipeline
│   ├── commands/         # Commander.js CLI commands
│   ├── install/          # Plugin installers (OpenCode, Claude Code, Codex)
│   └── init/             # Project initialization wizard
├── shared/               # Cross-cutting library (fp-ts, errors, events, config)
├── web-ui/               # Arcade dashboard (React SPA + Bun server)
│   ├── src/server/       # HTTP + WebSocket server, v2 API routes
│   └── src/              # React frontend (pages, components, hooks, providers)
├── scripts/              # Build scripts (build-claude-code.ts, build-codex.ts, build-opencode.ts)
plugins/
├── base/                 # Foundation: KB, strategy, Mermaid, research, security
├── dev/                  # Delivery: build, blueprint, PR review, code audit, features
└── utils/                # Prompt: writing, tersification, eval extraction
evals/                    # Prompt attestation system
packages/catppuccin-mermaid/  # Mermaid theme package
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, data flows, integrations
- **[modules.md](modules.md)**: 15 modules with components, dependencies, cross-module patterns
- **[patterns.md](patterns.md)**: Code conventions (naming, types, errors, testing, I/O)
- **[concept_map.md](concept_map.md)**: 20 domain concepts, terminology glossary, bounded contexts
