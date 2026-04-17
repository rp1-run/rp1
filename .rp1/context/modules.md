# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-04-12
**Modules Analyzed**: 22

## Module Map

| Module | Purpose | Files |
|--------|---------|-------|
| cli/commands | User-facing CLI commands including build, migrate, and arcade | 27 |
| cli/agent-tools | Agent-tools CLI with emit, workflow-bootstrap, resolve-args, state-machine, task, feedback | 59 |
| cli/build | Multi-platform artifact build pipeline for Claude Code, OpenCode, Codex | 50 |
| cli/catalog | Skill/agent catalog registry with distribution scoping and arcade tracking | 3 |
| cli/install | Install plugin artifacts into host tools with staging, backup/rollback, verification | 22 |
| cli/init | Project initialization with context detection, fence markers, and Ink UI | 23 |
| cli/shared | Cross-cutting library: errors, fp-ts helpers, events, logging, directory resolution | 15 |
| cli/lib | Utility: cache, colors, package-manager detection, fence version tracking | 6 |
| cli/settings | Settings file loading and validation | 2 |
| cli/migrate | Migration system for project structure upgrades | 5 |
| cli/pr-review | PR review config and CI environment detection | 4 |
| web-ui/server | Bun HTTP/WS server with REST APIs, file watching, event broadcast, notifications | 16 |
| web-ui/daemon | Daemon lifecycle manager with diagnostic logging and IPC | 4 |
| web-ui/frontend | React SPA dashboard: pages, components, hooks, providers, motion | 190 |
| plugins/base | KB, docs sync, writing, research, strategy, security, prompt authoring pipeline, guide meta-skill | 98 |
| plugins/dev | Build workflows, blueprinting, PR review, feature delivery | 53 |
| plugins/utils | Prompt tersification, eval helpers | 14 |
| docs/reference | User-facing reference docs for CLI, plugins, web UI, platform tags | 36 |
| evals | Prompt attestation with content-addressable hashing and dockerized execution | 26 |

## Key Components

| Component | Module | Purpose |
|-----------|--------|---------|
| workflow-bootstrap | agent-tools | Deterministic run creation/resumption with run_policy, identity_args, and 5-layer argument merge |
| emit pipeline | agent-tools/emit | Records all 6 event types with status derivation, step validation, skipped-step detection, and notification generation |
| notification system | agent-tools/emit | Auto-generates notifications for terminal run states and waiting_for_user events with deduplication |
| state-machine | agent-tools | Parses Mermaid stateDiagram-v2, validates step transitions, provides graph queries |
| resolve-args | agent-tools | 5-layer argument merge (user > project settings > user settings > ENV > schema default) with directory resolution |
| build parser | build | Frontmatter parsing for skills/agents including arcadeTracked extraction and workflow metadata |
| build validator | build | L1 (syntax) + L2 (schema) validation including arcade_tracked field |
| catalog registry | catalog | Centralized skill catalog with distribution scoping, category ordering, and arcadeTracked propagation |
| server registry | web-ui/server | Multi-project registry with async mutex (`withRegistryLock`), atomic file persistence, worktree normalization |
| daemon diagnostics | web-ui/daemon | Structured NDJSON logging for daemon lifecycle events to daemon.log |
| arcade command | commands | CLI entry point with start/stop/status/restart, --daemon-only, --format hook-json modes |
| install verifier | install | Cross-platform installation health check and skill discovery with arcade_tracked metadata |
| create-prompt orchestrator | plugins/base | Workflow skill that walks the six-stage prompt-writer pipeline via prompt-pipeline-runner agent |
| prompt-pipeline-runner | plugins/base | Agent executing constitutional-checklist, fallibilist-overlay, epistemic-stance, popper-patterns, confidence-schema, prompt-validation stages |

## Dependency Highlights

```text
cli/commands --> cli/shared, cli/init, cli/install, cli/build, web-ui/daemon (lazy)
cli/build --> cli/shared, cli/agent-tools/state-machine, cli/catalog
cli/agent-tools/emit --> cli/agent-tools/state-machine, web-ui/daemon (lazy)
cli/agent-tools/resolve-args --> cli/settings, cli/shared
cli/catalog --> cli/build/parser, cli/shared/canonical-name
cli/install/verifier --> cli/build/parser, cli/assets
web-ui/server/registry --> web-ui/daemon/config-dir
web-ui/daemon --> web-ui/daemon/diagnostics
web-ui/frontend --> web-ui/server (REST + WebSocket)
plugins/dev --> plugins/base (runtime)
plugins/* --> cli/agent-tools (runtime conventions)
```

## Cross-Module Patterns

| Pattern | Modules | Benefit |
|---------|---------|---------|
| Skill-Agent Delegation | plugins/*, cli/agent-tools | Separation: skills orchestrate, agents do bounded work |
| Tracked Workflow Bootstrap | workflow-bootstrap, emit, resolve-args | Atomic run creation with identity-based deduplication |
| State-Machine + Emit Discipline | state-machine, emit, plugins/* | Dashboard-visible progress through validated step emissions |
| Arcade Tracked Visibility | parser, validator, catalog, verifier | Skills opt out of Activity feed via arcadeTracked without losing workflow mechanics |
| Async Mutex Registry | web-ui/server/registry | Serializes concurrent registry mutations preventing race conditions |
| Notification Auto-Generation | emit, daemon, frontend | Terminal events auto-create deduplicated notifications relayed via WebSocket |
| Catalog Registry | catalog, build, base/guide | Single-source catalog drives CATALOG.md, init blocks, and /guide |
| Versioned Fence Markers | init, lib, migrate | Instruction stanzas carry version stamps for staleness detection and auto-upgrade |
| Thin Command Adapter | commands, build, install, init | CLI commands translate flags and delegate to deeper modules |
| Multi-Platform Build | build | Single markdown sources transform into 3 platform artifacts via shared pipeline |

## External Dependencies

| Package | Purpose |
|---------|---------|
| fp-ts | Functional programming: Either, TaskEither, Option |
| liquidjs | Template engine for multi-platform build pipeline |
| commander | CLI command framework |
| yaml | YAML parsing for frontmatter and settings |
| bun:sqlite | SQLite for emit events, notifications, tasks |
