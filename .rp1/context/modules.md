# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-04-04
**Modules Analyzed**: 21

## Core Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `cli/commands` | User-facing CLI commands via Commander.js, including thin adapters into install, init, update, verify, arcade, and build workflows. | 27 files; now explicitly wires `build:opencode` through `cli/src/main.ts` and `cli/src/commands/build.ts`. |
| `cli/agent-tools` | Agent-tools CLI surface with tool registry and workflow-oriented subcommands for AI agent infrastructure. | 45 files; includes `emit`, `state-machine`, `resolve-args`, `task`, `feedback`, `github-pr`, `comment-extract`, `mmd-validate`, and `rp1-root-dir`. |
| `cli/build` | Multi-platform artifact build pipeline for Claude Code, OpenCode, and Codex outputs. | 64 files; owns parsing, linting, template transforms, and platform-specific emitters. |
| `cli/install` | Install plugin artifacts into host tools with staging, backup/rollback, and verification. | 22 files. |
| `cli/init` | Project initialization with context detection, tool detection, plugin installation, and Ink UI. | 29 files. |
| `cli/shared` | Cross-cutting shared library for errors, fp-ts helpers, directory resolution, logging, events, and canonical naming. | 15 files; leaf-style support layer reused across CLI and web UI. |
| `cli/assets` | Bundled asset access for release builds, including plugin and web-ui extraction. | 4 files. |
| `cli/settings` | Settings file loading and validation for project and global rp1 configuration. | 2 files. |
| `cli/config` | Supported-tools registry defining host tool capabilities. | 4 files. |
| `cli/lib` | Utility library for cache, colors, package-manager detection, and version comparison. | 4 files. |
| `cli/migrate` | Migration system for upgrading rp1 project structures across versions. | 4 files. |
| `cli/pr-review` | PR review configuration loading and CI environment detection. | 4 files. |

## Web UI Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `web-ui/server` | Bun HTTP and WebSocket server with REST APIs, file watching, event broadcast, and annotation embedding. | 16 files; key routes include `v2-api`, artifacts, and annotations. |
| `web-ui/daemon` | Daemon lifecycle manager for the web UI server. | 4 files. |
| `web-ui/frontend` | React SPA dashboard with pages, components, hooks, providers, and motion transitions. | 175 files; major entrypoints are `main.tsx`, `App.tsx`, `V2Layout.tsx`, and `routes.tsx`. |

## Plugin Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `plugins/base` | Foundational plugin for KB generation/loading, documentation workflows and sync, Mermaid validation, deep research, strategy, security analysis, and maintenance. | 57 files; the frontier materially refined `generate-user-docs`, `write-content`, and `scribe`. |
| `plugins/dev` | Feature delivery plugin for build workflows, blueprinting, PR review, code audit, and feature lifecycle automation. | 56 files. |
| `plugins/utils` | Prompt authoring plugin for prompt writing and rewriting, tersification, eval assertion extraction, and prompt-eval helpers. | 18 files; `prompt-writer` now ships a companion reference pack. |

## Documentation & Packages

| Module | Purpose | Notes |
|--------|---------|-------|
| `docs/reference` | Human-facing reference surface for CLI commands, agent-tools, platform tags, web UI, and plugin skills. | 40 files; inferred as a standalone docs module because it has its own hub, sub-indexes, and topical pages. |
| `evals` | Prompt attestation system with content-addressable hashing, dependency graphs, and verification. | 7 files. |
| `packages/catppuccin-mermaid` | Standalone npm package providing Catppuccin-themed Mermaid rendering with contrast checks. | 3 files. |

## Highlighted Components

### `build:opencode`
Public CLI command that exposes the OpenCode artifact build pipeline. It translates Commander flags into build args and delegates the real work to `executeBuild()` in `cli/build`.

### `generate-user-docs`
Base skill that synchronizes user-facing documentation against the current KB through a `validate -> stale gate -> scan -> approval -> process` workflow, preserving `scan_results.json` and asking for approval exactly once.

### `scribe`
Dual-mode documentation worker for scan/process batches. It classifies sections as `verify`, `add`, or `fix`, applies KB-backed rewrites or review markers, and returns JSON only.

### `write-content`
Tracked content-writing workflow that turns rough notes into a grounded Markdown document, maintains `.rp1/work/content/.../brief.md`, and registers both brief and final document artifacts.

### `prompt-writer`
Prompt authoring workflow that supports new prompts and rewrites, emits workflow state, loads templates and patterns selectively, and applies rp1-specific validation rules.

### `prompt-writer companion pack`
Progressive-disclosure reference set backing `prompt-writer`. It separates reusable patterns, templates, and rp1-specific authoring rules into `PATTERNS.md`, `TEMPLATES.md`, and `RP1-AUTHORING.md`.

### `reference hub`
Top-level docs surface rooted at `docs/reference/index.md` that routes readers to CLI, base, dev, and web-ui references plus topical pages such as agent-tools and platform tags.

## Dependency Highlights

- `cli/commands` depends directly on `cli/shared`, `cli/init`, `cli/install`, `cli/config`, and now `cli/build`; it lazy-loads `cli/agent-tools` and the daemon server path.
- `cli/build` depends on `cli/shared` plus the state-machine parser used for build-time validation of workflow prompts.
- `web-ui/server` depends on `cli/shared` and on agent-tool-backed event and artifact state; `web-ui/frontend` consumes the server over REST and WebSocket.
- `plugins/base` depends on agent-tool conventions for emits, artifact registration, and path resolution; `generate-user-docs` also treats `docs/reference` as a maintained target surface.
- `plugins/utils` depends indirectly on agent-tools because `prompt-writer` and its companion guide teach `emit`, `resolve-args`, `rp1-root-dir`, and artifact-registration conventions.
- `plugins/dev` depends on `plugins/base`; base does not depend on dev.
- `evals` tracks prompt content from the base and dev plugins for attestation and verification.

## Cross-Module Patterns

| Pattern | Meaning | Status |
|---------|---------|--------|
| Skill-Agent Delegation | High-level skills orchestrate while specialized agents perform bounded execution work. | Confirmed |
| Documentation Scan/Process Orchestration | `generate-user-docs` splits doc reconciliation into discovery, scan, approval, and process phases, with `scribe` handling batched file-level work. | New |
| State-Machine + Emit Discipline | Workflow prompts declare Mermaid state machines and drive dashboard-visible progress through `rp1 agent-tools emit`. | Refined |
| Progressive Disclosure Authoring Pack | A primary skill stays focused while companion docs hold patterns, templates, and repo-specific conventions. | New |
| Thin Command Adapter | User-facing CLI commands remain small adapters that translate flags and delegate substantive work into deeper modules. | Refined |
| Multi-Platform Build | Single Markdown prompt sources are transformed into multiple host-tool artifacts through a shared build pipeline. | Confirmed |

## Reconciliation Notes

- The `cli/commands` boundary is still valid, but the dependency map had to expand to include the new `build:opencode` command path through `cli/build`.
- `plugins/base` remains the foundational plugin, but its documentation surface is now materially sharper: doc sync, content writing, and `scribe` should be treated as a cohesive documentation-production area rather than generic support utilities.
- `plugins/utils` still centers on prompt tooling, but `prompt-writer` now behaves like a tracked workflow with a reusable companion pack.
- `docs/reference` is large and maintained enough to model as its own docs module rather than a footnote under plugins or website content.

## Cross-References

- **System topology**: See [architecture.md](architecture.md)
- **Surface behavior**: See [interaction-model.md](interaction-model.md)
- **Code conventions**: See [patterns.md](patterns.md)
- **Domain terminology**: See [concept_map.md](concept_map.md)
