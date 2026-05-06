# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, JSON, YAML, TOML, Shell, CSS, HTML
**Version**: 0.7.6
**Updated**: 2026-05-06
**Projects**: 7 (`cli/`, `cli/web-ui/`, `native-app/`, `plugins/base/`, `plugins/dev/`, `plugins/utils/`, `evals/`)

## Project Summary

rp1 is a Bun/TypeScript CLI and plugin monorepo for authoring, compiling, installing, and running AI agent workflows across Claude Code, OpenCode, Codex, and GitHub Copilot. It pairs markdown-defined skills and agents with deterministic workflow bootstrap, event-sourced SQLite runtime state, Arcade observability, native Arcade shell support, and durable project knowledge under `.rp1/context`.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Local-first plugin CLI with tracked workflow runtime and multi-platform prompt compilation |
| Tech Stack | Bun, TypeScript, React, Vite, SQLite, LiquidJS, fp-ts, Electrobun |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| `cli/` | Core CLI, build pipeline, installers, migrations, and agent-tools runtime. | TypeScript | `cli/src/main.ts` |
| `cli/web-ui/` | Arcade dashboard SPA plus Bun HTTP/WebSocket daemon server. | TypeScript/TSX | `cli/web-ui/src/server.ts` |
| `native-app/` | Electrobun native shell that launches or attaches to Arcade. | TypeScript/Bun | `native-app/src/bun/index.ts` |
| `plugins/base/` | Foundation skills/agents for KB, docs, research, security, prompt writing, templates, and debate. | Markdown | `plugins/base/.claude-plugin/plugin.json` |
| `plugins/dev/` | Development workflows for features, planning, implementation, cleanup, PR review, and walkthroughs. | Markdown | `plugins/dev/.claude-plugin/plugin.json` |
| `plugins/utils/` | Internal prompt-build and prompt-eval utilities. | Markdown | `plugins/utils/.claude-plugin/plugin.json` |
| `evals/` | Promptfoo suites, assertions, outputs, and attestation assets. | TypeScript/YAML | `evals/package.json` |

## KB File Manifest

**Progressive Loading**: Load files on demand based on the task you are performing.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | 156 | System design, layers, data flow, integrations, deployment |
| interaction-model.md | 129 | Cross-surface interaction semantics, states, feedback, accessibility |
| modules.md | 159 | Module boundaries, components, dependencies, metrics |
| patterns.md | 103 | Code conventions, implementation patterns, validation idioms |
| concept_map.md | 129 | Domain concepts, terminology, relationships, bounded contexts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Documentation updates | `concept_map.md`, `interaction-model.md`, `patterns.md` |
| Prompt or workflow authoring | `concept_map.md`, `patterns.md`, `modules.md` |
| Strategic or system-wide analysis | All KB files |
| Security audit | `architecture.md`, `modules.md`, `patterns.md` |

## How to Load

```text
Read: .rp1/context/{filename}
```

## Repository Structure

```text
rp1/
├── cli/                 # CLI commands, agent-tools, build/install/init/migrate logic
│   └── web-ui/          # Arcade SPA, server, daemon, routes, hooks, components
├── native-app/          # Electrobun wrapper for native Arcade
├── plugins/
│   ├── base/            # Foundation skills, agents, templates
│   ├── dev/             # Feature delivery, review, planning, quality workflows
│   └── utils/           # Internal prompt and eval utilities
├── docs/                # User and reference documentation
├── evals/               # Promptfoo suites and attestation
├── docker/              # Eval/test harness images
└── .rp1/context/        # Project knowledge base
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, data flows, integrations, deployment
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior, states, feedback loops, accessibility
- **[modules.md](modules.md)**: Module and component breakdown, boundaries, dependencies, metrics
- **[patterns.md](patterns.md)**: Code conventions, implementation patterns, testing and validation idioms
- **[concept_map.md](concept_map.md)**: Domain terminology, relationships, bounded contexts, cross-cutting concerns
