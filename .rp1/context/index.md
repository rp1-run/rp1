# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, JSON, YAML, TOML, Shell, CSS, HTML
**Version**: 0.7.1-dev
**Updated**: 2026-04-12

## Project Summary

rp1 is a Bun/TypeScript CLI and plugin monorepo for authoring, building, and running AI agent workflows across Claude Code, OpenCode, and Codex. It combines markdown-defined skills and agents, tracked runtime state with deterministic workflow bootstrap, the Arcade dashboard with notifications, a multi-platform build pipeline, catalog-driven skill discovery, and a progressively loaded knowledge base.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin-based CLI with tracked workflow state, deterministic bootstrap, and map-reduce agents |
| Tech Stack | Bun, TypeScript, React, fp-ts, SQLite, LiquidJS |

## KB File Manifest

**Progressive Loading**: Load files on demand based on the task you are performing.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | 133 | System design, layers, data flow, integrations |
| interaction-model.md | 154 | Cross-surface semantics, workflow states, notifications, accessibility |
| modules.md | 119 | Module boundaries, responsibilities, dependency highlights |
| patterns.md | 81 | Code conventions, workflow idioms, extension patterns |
| concept_map.md | 142 | Domain concepts, terminology, bounded contexts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Strategic or system-wide analysis | All KB files |

## How to Load

```text
Read: .rp1/context/{filename}
```

## Project Structure

```text
cli/
├── src/               # CLI commands, agent-tools, build pipeline, init/install flows
│   ├── commands/      # User-facing CLI commands including build, migrate, and arcade
│   ├── agent-tools/   # Workflow protocol tools (emit, workflow-bootstrap, resolve-args, feedback, root-dir, etc.)
│   ├── build/         # Multi-platform artifact build pipeline
│   ├── catalog/       # Skill/agent catalog registry with distribution scoping
│   ├── install/       # Host-tool installation and verification
│   ├── migrate/       # Project migration with stanza upgrades and DB backfill
│   └── init/          # Project initialization with versioned fence markers and Ink UI
├── shared/            # Errors, fp-ts helpers, events, logging, directory resolution
└── web-ui/            # Arcade dashboard SPA with notifications sidebar, and Bun HTTP/WS server
plugins/
├── base/              # KB, docs sync, writing, research, strategy, security, guide meta-skill
├── dev/               # Build workflows, blueprinting, PR review, feature delivery
└── utils/             # Prompt writing, tersification, eval helpers
docs/
└── reference/         # User-facing reference docs for CLI, plugins, web UI, and platform tags
evals/                 # Prompt attestation with content-addressable hashing and dockerized execution
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, flows, and integrations
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior, notifications, and user-visible workflow semantics
- **[modules.md](modules.md)**: Module boundaries, key components, and dependency highlights
- **[patterns.md](patterns.md)**: Implementation conventions and workflow idioms
- **[concept_map.md](concept_map.md)**: Domain concepts, terminology, and bounded contexts
