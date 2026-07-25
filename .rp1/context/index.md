---
rp1_doc_id: e56577c2-c3e0-48bb-b20b-2c69c103d940
---
# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, JSON, YAML, TOML, Shell, CSS, HTML
**Version**: 0.7.12
**Updated**: 2026-07-25

## Project Summary

rp1 is a Bun/TypeScript CLI and plugin monorepo for authoring, building, and running AI agent workflows across Claude Code, OpenCode, Codex, Copilot, and Antigravity. It combines markdown-defined skills and agents, tracked runtime state with deterministic workflow bootstrap, storage-mode-aware directory resolution (prompts reference `{KB_ROOT}`/`{WORK_ROOT}` variables, never literal paths), the Arcade dashboard (browser and native macOS shell via Electrobun) with notifications and annotations, a multi-platform build pipeline with per-agent model/effort tiering, user-controllable install-time model tier remapping via `settings.toml`, containerized test isolation with a protected-home boundary, catalog-driven skill discovery, and a progressively loaded knowledge base.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin-based CLI with tracked workflow state, deterministic bootstrap, and map-reduce agents |
| Tech Stack | Bun, TypeScript, React, fp-ts, SQLite, LiquidJS, Electrobun |

## KB File Manifest

**Progressive Loading**: Load files on demand based on the task you are performing.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | 98 | System design, layers, data flow, integrations |
| interaction-model.md | 75 | Cross-surface semantics, workflow states, notifications, accessibility |
| modules.md | 106 | Module boundaries, responsibilities, dependency highlights |
| patterns.md | 88 | Code conventions, workflow idioms, extension patterns |
| concept_map.md | 167 | Domain concepts, terminology, bounded contexts |
| features.md | 427 | Capability inventory, coverage gaps, feature audience |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md`, `features.md` |
| Frontend / UX / surface work | `interaction-model.md`, `modules.md`, `patterns.md` |
| Capability audit / coverage review | `features.md` |
| Model tiering / settings work | `modules.md` (settings module), `patterns.md`, `concept_map.md` (Model Settings context) |
| Prompt authoring / path variables | `patterns.md` (path variables, L014), `concept_map.md` (Storage Resolution context) |
| Strategic or system-wide analysis | All KB files |

## How to Load

```text
Read: .rp1/context/{filename}
```

## Project Structure

```text
cli/
├── src/               # CLI commands, agent-tools, build pipeline, init/install flows
│   ├── commands/      # User-facing CLI commands including build, migrate, arcade, and settings
│   ├── agent-tools/   # Workflow protocol tools (emit, workflow-bootstrap, resolve-args, feedback, root-dir, etc.)
│   ├── build/         # Multi-platform artifact build pipeline with model/effort tiering + arcade tracking
│   ├── settings/      # Install-time model tier remapping + harness selection (loader, presets, rewriter, apply, validator)
│   ├── catalog/       # Skill/agent catalog registry with distribution scoping
│   ├── install/       # Host-tool installation and verification
│   ├── migrate/       # Project migration with stanza upgrades, DB backfill, central-store opt-in, and settings JSON→TOML migration
│   └── init/          # Project initialization wizard with harness selection, sandbox grants, and Ink UI
├── scripts/           # Test isolation launchers and protected-home boundary verification
├── shared/            # Errors, fp-ts helpers, events, logging, directory resolution, storage mode
└── web-ui/            # Arcade dashboard SPA with annotations, notifications, and Bun HTTP/WS server
plugins/
├── base/              # KB suite (6 dimensions incl. features), docs sync, writing, research, strategy, security, guide
├── dev/               # Build workflows, blueprinting, PR review, feature delivery
└── utils/             # Prompt writing, tersification, eval helpers
native-app/            # macOS native Arcade shell built with Electrobun
docs/
└── reference/         # User-facing reference docs for CLI, configuration, plugins, web UI, and platform tags
evals/                 # Prompt attestation with content-addressable hashing and dockerized execution
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, flows, and integrations
- **[interaction-model.md](interaction-model.md)**: Cross-surface behavior, notifications, and user-visible workflow semantics
- **[modules.md](modules.md)**: Module boundaries, key components, and dependency highlights
- **[patterns.md](patterns.md)**: Implementation conventions and workflow idioms
- **[concept_map.md](concept_map.md)**: Domain concepts, terminology, and bounded contexts
- **[features.md](features.md)**: Capability inventory, evidence tiers, and audience coverage
