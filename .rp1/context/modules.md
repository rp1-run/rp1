# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-04-12
**Modules Analyzed**: 22

## Core Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `cli/commands` | User-facing CLI commands via Commander.js, including thin adapters into install, init, update, verify, arcade, and build workflows. | 27 files; wires `build:opencode` through `cli/src/main.ts` and `cli/src/commands/build.ts`. |
| `cli/agent-tools` | Agent-tools CLI surface with tool registry and workflow-oriented subcommands for AI agent infrastructure. | 59 files; includes `emit`, `state-machine`, `resolve-args`, `task`, `feedback`, `github-pr`, `comment-extract`, `mmd-validate`, `rp1-root-dir`, and `workflow-bootstrap`. |
| `cli/build` | Multi-platform artifact build pipeline for Claude Code, OpenCode, and Codex outputs. | 50 files; owns parsing, linting (7 rules), template transforms, preprocessor conditionals, catalog generation, platform definitions, and platform-specific emitters via LiquidJS. |
| `cli/catalog` | Skill and agent catalog registry with distribution scoping, category ordering, and maintenance artifact generation. | 3 files; powers `CATALOG.md` generation, init skill-awareness blocks, and `catalog/agents.yaml` + `catalog/skills.yaml` maintenance. |
| `cli/install` | Install plugin artifacts into host tools with staging, backup/rollback, and verification. | 22 files. |
| `cli/init` | Project initialization with context detection, tool detection, plugin installation, versioned comment/shell fence markers, and generated instruction templates. | 23 files; supports `comment-fence` and `shell-fence` with version-stamped markers. |
| `cli/shared` | Cross-cutting shared library for errors, fp-ts helpers, directory resolution, logging, events, canonical naming, logical-step collapsing, project-id, and prompts. | 15 files; leaf-style support layer reused across CLI and web UI. |
| `cli/assets` | Bundled asset access for release builds, including plugin and web-ui extraction. | 5 files. |
| `cli/settings` | Settings file loading and validation for project and global rp1 configuration. | 2 files. |
| `cli/config` | Supported-tools registry defining host tool capabilities. | 3 files. |
| `cli/lib` | Utility library for cache, colors, package-manager detection, version comparison, fence staleness checking, and fence version tracking. | 6 files; includes `fence-check.ts` and `fence-version.ts`. |
| `cli/migrate` | Migration system for upgrading rp1 project structures across versions, including stanza upgrades and DB backfill. | 5 files; `stanza-upgrade.ts` replaces fenced content in CLAUDE.md, AGENTS.md, and .gitignore with latest templates. |
| `cli/uninstall` | Removes rp1 injections from instruction files and gitignore, uninstalls Claude Code plugins, preserves `.rp1` directory. | 2 files. |
| `cli/pr-review` | PR review configuration loading and CI environment detection. | 4 files. |

## Web UI Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `web-ui/server` | Bun HTTP and WebSocket server with REST APIs, file watching, event broadcast, annotation embedding, and notification endpoints. | 16 files; key routes include `v2-api` (runs, events, artifacts, annotations, notifications, projects), content serving, and project lookup. |
| `web-ui/daemon` | Daemon lifecycle manager for the web UI server; relays notification events over WebSocket. | 4 files. |
| `web-ui/frontend` | React SPA dashboard with pages, components, hooks, providers, motion transitions, and a dedicated notifications sidebar. | 190 files; major entrypoints are `main.tsx`, `App.tsx`, `V2Layout.tsx`, and `routes.tsx`. |

## Plugin Modules

| Module | Purpose | Notes |
|--------|---------|-------|
| `plugins/base` | Foundational plugin for KB generation/loading, documentation workflows and sync, Mermaid validation, deep research, strategy, security analysis, maintenance, and the `/guide` meta-skill. | 53 files; `/guide` uses `CATALOG.md` for skill discovery and routing. |
| `plugins/dev` | Feature delivery plugin for build workflows, blueprinting, PR review, code audit, feature lifecycle automation, and dockerized eval execution. | 53 files. |
| `plugins/utils` | Prompt authoring plugin for prompt writing and rewriting, tersification, eval assertion extraction, and prompt-eval helpers. | 15 files; `prompt-writer` ships a companion reference pack. |

## Documentation & Packages

| Module | Purpose | Notes |
|--------|---------|-------|
| `docs/reference` | Human-facing reference surface for CLI commands, agent-tools, platform tags, web UI, and plugin skills. | 36 files; has its own hub, sub-indexes, and topical pages. |
| `evals` | Prompt attestation system with content-addressable hashing, dependency graphs, workspace isolation for parallel test execution, dockerized eval execution, and shared assertion library. | 26 files; suites cover `rp1-dev` skills (`build`, `build-fast`, `speedrun`) with shared assertions and fixtures. |

## Highlighted Components

### `workflow-bootstrap`
Agent-tool subcommand that deterministically creates or resumes a tracked workflow run. It resolves canonical skill schemas, validates `run_policy` (`fresh`/`resumable`), derives work identity from `identity_args`, resolves arguments via the 5-layer merge, and initializes the backing run in the emit database. This is the entry point for tracked-workflow lifecycle management.

### `notification system`
Emit-pipeline extension spanning `notification-generator.ts` and `notification-database.ts` within `cli/agent-tools/emit`. Auto-generates notifications for completed/failed runs and `waiting_for_user` events, with deduplication, truncation, and daemon relay for WebSocket broadcast to the Arcade sidebar.

### `catalog registry`
`cli/catalog` module that provides a unified skill/agent catalog with distribution scoping (`distributable`/`internal`), category ordering and trigger descriptions, renderable markdown generation, init skill-awareness block generation, and YAML maintenance artifacts.

### `fence version system`
Versioning system for injected instruction stanzas spanning `cli/init/comment-fence.ts`, `cli/init/shell-fence.ts`, `cli/lib/fence-check.ts`, `cli/lib/fence-version.ts`, and `cli/migrate/stanza-upgrade.ts`. Stamps version markers into CLAUDE.md, AGENTS.md, and .gitignore, then detects staleness and auto-upgrades during `rp1 migrate`.

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

### `guide`
Base meta-skill that routes users to available rp1 skills using the generated `CATALOG.md` from the catalog registry.

### `reference hub`
Top-level docs surface rooted at `docs/reference/index.md` that routes readers to CLI, base, dev, and web-ui references plus topical pages such as agent-tools and platform tags.

## Dependency Highlights

- `cli/commands` depends directly on `cli/shared`, `cli/init`, `cli/install`, `cli/config`, and `cli/build`; it lazy-loads `cli/agent-tools` and the daemon server path.
- `cli/build` depends on `cli/shared`, the state-machine parser for build-time validation of workflow prompts, and `cli/catalog` for `CATALOG.md` generation.
- `cli/agent-tools/workflow-bootstrap` depends on `cli/agent-tools/emit/database`, `cli/agent-tools/resolve-args/resolver`, `cli/build/parser` (for schema parsing), and `cli/shared/directory-resolution`.
- `cli/agent-tools/emit` depends on `cli/agent-tools/emit/notification-database` and `cli/agent-tools/emit/notification-generator` for auto-notification creation, plus the daemon connector for WebSocket relay.
- `cli/catalog` depends on `cli/build/parser` for skill schema parsing and `cli/shared/canonical-name` for naming; `cli/catalog/maintenance` depends on `cli/init/templates/generator` for init template co-generation.
- `cli/init` depends on `cli/shared`, `cli/config`, and uses versioned fence markers from `cli/lib/fence-version`.
- `cli/migrate` depends on `cli/init/comment-fence`, `cli/init/shell-fence`, and `cli/lib/fence-version` for stanza upgrades.
- `web-ui/server` depends on `cli/shared` and on agent-tool-backed event, artifact, and notification state; `web-ui/frontend` consumes the server over REST and WebSocket.
- `plugins/base` depends on agent-tool conventions for emits, artifact registration, and path resolution; `generate-user-docs` also treats `docs/reference` as a maintained target surface; `/guide` consumes `CATALOG.md` from `cli/catalog`.
- `plugins/utils` depends indirectly on agent-tools because `prompt-writer` and its companion guide teach `emit`, `resolve-args`, `rp1-root-dir`, and artifact-registration conventions.
- `plugins/dev` depends on `plugins/base`; base does not depend on dev.
- `evals` tracks prompt content from the base and dev plugins for attestation and verification; supports dockerized eval execution with workspace isolation.

## Cross-Module Patterns

| Pattern | Meaning | Status |
|---------|---------|--------|
| Skill-Agent Delegation | High-level skills orchestrate while specialized agents perform bounded execution work. | Confirmed |
| Tracked Workflow Bootstrap | `workflow-bootstrap` deterministically creates or resumes runs based on `run_policy` and `identity_args`, giving skills a single atomic entry point for lifecycle management. | New |
| Documentation Scan/Process Orchestration | `generate-user-docs` splits doc reconciliation into discovery, scan, approval, and process phases, with `scribe` handling batched file-level work. | Confirmed |
| Notification Auto-Generation | The emit pipeline automatically creates notifications for terminal run states and agent prompts, relayed through daemon WebSocket to the Arcade sidebar. | New |
| Catalog Registry | A centralized skill/agent catalog with distribution scoping, category ordering, and renderable output drives `CATALOG.md`, init skill-awareness blocks, and the `/guide` meta-skill. | New |
| Versioned Fence Markers | Injected instruction stanzas carry version stamps that enable staleness detection and automated in-place upgrades during migration. | New |
| State-Machine + Emit Discipline | Workflow prompts declare Mermaid state machines and drive dashboard-visible progress through `rp1 agent-tools emit`. | Confirmed |
| Progressive Disclosure Authoring Pack | A primary skill stays focused while companion docs hold patterns, templates, and repo-specific conventions. | Confirmed |
| Thin Command Adapter | User-facing CLI commands remain small adapters that translate flags and delegate substantive work into deeper modules. | Confirmed |
| Multi-Platform Build | Single Markdown prompt sources are transformed into multiple host-tool artifacts through a shared build pipeline. | Confirmed |

## Cross-References

- **System topology**: See [architecture.md](architecture.md)
- **Surface behavior**: See [interaction-model.md](interaction-model.md)
- **Code conventions**: See [patterns.md](patterns.md)
- **Domain terminology**: See [concept_map.md](concept_map.md)
