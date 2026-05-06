# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-05-06
**Repository Type**: Monorepo
**Modules Analyzed**: 20

## Core Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `cli/commands` | Top-level command adapters wiring Commander to init, install, update, verify, migrate, Arcade, settings, and agent-tools. | `cli/src/main.ts`, `cli/src/commands/arcade.ts`, `cli/src/commands/init.ts`, `cli/src/commands/update/index.ts` |
| `cli/agent-tools` | Runtime tools used by generated skills and agents for bootstrap, emit, task planning, arg resolution, work search, cleanup, and Socratic Duel. | `cli/src/agent-tools/workflow-bootstrap/index.ts`, `cli/src/agent-tools/emit/index.ts`, `cli/src/agent-tools/workflow-state/index.ts` |
| `cli/build` | Prompt/plugin build pipeline that parses source assets, applies platform transforms, validates contracts, and writes host outputs. | `cli/src/build/command.ts`, `cli/src/build/parser.ts`, `cli/src/build/platform-definitions.ts` |
| `cli/catalog` | Generated skill catalog and skill-awareness docs from plugin metadata. | `cli/src/catalog/index.ts`, `cli/src/catalog/registry.ts` |
| `cli/install` | Host installation and verification for supported agent platforms, bundled assets, and Copilot marketplace registration. | `cli/src/install/asset-extractor.ts`, `cli/src/install/copilot/installer.ts` |
| `cli/init` | Project initialization, deterministic `.rp1` directories, instruction files, gitignore entries, and host detection/install flows. | `cli/src/init/index.ts`, `cli/src/init/directory-model.ts` |
| `cli/migrate` | Legacy rp1 layout migration into deterministic `.rp1/context` and `.rp1/work` plus project identity backfill. | `cli/src/migrate/index.ts`, `cli/src/commands/migrate.ts` |
| `cli/shared` | Shared runtime infrastructure for events, errors, logging, directory resolution, naming, and tool result formatting. | `cli/shared/events.ts`, `cli/shared/errors.ts`, `cli/shared/logger.ts` |
| `web-ui/server` | Bun-backed Arcade server exposing REST, WebSocket, project registry, annotation, artifact, workflow, notification, and file APIs. | `cli/web-ui/src/server.ts`, `cli/web-ui/src/server/routes/v2-api.ts`, `cli/web-ui/src/server/registry.ts` |
| `web-ui/daemon` | Arcade daemon lifecycle manager, IPC/status, health polling, port-conflict handling, and restart/reuse orchestration. | `cli/web-ui/src/daemon/manager.ts` |
| `web-ui/frontend` | React/Vite Arcade frontend for projects, runs, artifacts, files, annotations, workflow state, notifications, and diagrams. | `cli/web-ui/src/app/App.tsx`, `cli/web-ui/src/app/routes.tsx` |
| `native-app` | Electrobun desktop shell that launches Arcade through the rp1 CLI and hosts the loopback web UI. | `native-app/package.json`, `native-app/src/bun/index.ts` |
| `plugins/base` | Foundation plugin for KB, docs, research, security, strategy, prompt guidance, templates, and debate workflows. | `plugins/base/skills/knowledge-build/SKILL.md`, `plugins/base/skills/artifact-templates/SKILL.md` |
| `plugins/dev` | Development plugin for feature delivery, planning, implementation, investigation, cleanup, PR review, walkthroughs, and feedback. | `plugins/dev/skills/build/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md` |
| `plugins/utils` | Internal utility plugin for prompt-build and prompt-eval authoring workflows. | `plugins/utils/skills/build-prompt/SKILL.md`, `plugins/utils/skills/prompt-eval-builder/SKILL.md` |
| `docs/reference` | Reference docs for concepts, commands, platforms, state machines, artifact contracts, and operational guidance. | `docs/concepts/skill-format.md`, `docs/concepts/state-machines.md` |
| `evals` | Prompt evaluation and attestation workspace for workflow contract regression checks. | `evals/package.json`, `evals/attestation.json` |

## Key Components

| Component | Type | Responsibility | Dependencies |
|-----------|------|----------------|--------------|
| rp1 CLI entrypoint | Command router | Registers user commands, lazy-loads expensive agent-tools, exposes private daemon server. | `cli/commands`, `cli/agent-tools`, `web-ui/server` |
| Arcade command | Command | Starts, stops, restarts, and reports Arcade daemon/browser status. | `web-ui/daemon`, `cli/shared` |
| Install command family | Command | Installs rp1 plugins into Claude Code, OpenCode, Codex, Copilot, or all detected hosts. | `cli/install`, `cli/build` |
| Update command | Command | Updates CLI and installed plugin assets while coordinating migrations and Arcade restart behavior. | `cli/install`, `cli/migrate`, `web-ui/daemon` |
| Init command | Command | Initializes `.rp1` project identity, directories, instructions, and optional host installs. | `cli/init`, `cli/install` |
| `workflow-bootstrap` | Agent tool | Creates or resumes tracked workflow runs from skill metadata, arguments, run policy, and identity args. | `cli/build`, `resolve-args`, `emit` |
| Emit pipeline | Agent tool | Persists workflow events, validates transitions, registers artifacts/annotations, derives status, notifies Arcade. | `emit/database`, `step-validation`, `web-ui/daemon` |
| Emit database | Repository | SQLite persistence for runs, events, artifacts, annotations, tasks, notifications, registry, search, and duel state. | `bun:sqlite`, `cli/shared` |
| Step validation | Validator | Enforces state-machine membership and transition order while allowing namespaced subagent steps. | `emit/database` |
| `resolve-args` | Agent tool | Resolves prompt arguments from schemas, argv, aliases, settings, env, defaults, and implied values. | `build/parser`, `settings` |
| `rp1-root-dir` | Agent tool | Returns deterministic project, KB, work, and code roots. | `cli/init`, `cli/shared` |
| `workflow-state` | Agent tool | Summarizes run state, effective steps, artifacts, recent events, task units, and contract gaps. | `emit/database` |
| `build-task-plan` | Agent tool | Validates task JSON and produces dependency-aware implementation/documentation task units. | `emit`, `cli/shared` |
| `change-manifest` | Agent tool | Creates baselines and scoped manifests for safe cleanup and build-owned changes. | `git`, `cli/shared` |
| `comment-extract` | Agent tool | Extracts comments from git scopes or manifest-owned lines while filtering protected files. | `change-manifest` |
| `work-search` | Agent tool | Indexes `.rp1/work` Markdown into an FTS sidecar and returns ranked hits. | `bun:sqlite`, `work-search/database` |
| Socratic Duel backend | Agent tool | Coordinates participants, lease locks, safe artifact edits, and terminal debate state. | `socratic-duel/database`, `emit/database` |
| Build pipeline | Builder | Compiles source prompts into host-specific plugin artifacts with validation and metadata. | `parser`, `platform-definitions`, `catalog` |
| Prompt parser | Parser | Parses skill/agent frontmatter for build, catalog, arguments, and workflow systems. | `yaml`, `cli/shared` |
| Platform definitions | Builder config | Centralizes host-specific build/install contracts for OpenCode, Codex, Claude Code, and Copilot. | `filters`, `tags` |
| Catalog registry | Registry | Generates catalog and skill-awareness content from skill discovery metadata. | `plugins/*`, `build/parser` |
| Asset extractor | Installer utility | Extracts bundled platform assets or dev dist assets for installation. | `cli/build` |
| Copilot installer | Installer | Stages marketplace assets and registers/updates native Copilot plugins. | `gh copilot`, `marketplace`, `verifier` |
| Arcade server | Service | Serves UI/API, recovers missed events, reclassifies stale runs, prunes projects, broadcasts updates. | `emit/database`, `registry`, `daemon` |
| V2 API router | Controller | Hydrates runs, artifacts, files, projects, notifications, health, shutdown, and search APIs. | `emit/database`, `annotation-service` |
| Project registry | Repository | Stores and normalizes multi-project Arcade registry data in the event database. | `emit/database`, `cli/init` |
| Annotation service | Service | Provides DB-backed annotation threads, replies, status changes, and artifact-content resolution. | `emit/database`, `web-ui/server` |
| Daemon manager | Service | Controls Arcade background process lifecycle and health. | `web-ui/server`, `cli/shared` |
| Arcade React app | Frontend app | Renders projects, workflows, artifacts, annotations, files, notifications, and diagrams. | `web-ui/server`, React |
| Native Arcade shell | Desktop app | Launches or attaches to Arcade through rp1 executable and loads native runtime URL. | Electrobun, `rp1 arcade` |
| Knowledge-build skill | Skill | Coordinates spatial analysis and parallel KB analyzers, then writes `.rp1/context`. | Base KB agents |
| Artifact-templates skill | Skill | Provides canonical artifact skeletons and routing metadata. | `plugins/base/templates` |
| Build workflow | Skill | Drives resumable feature delivery from requirements through archive. | `workflow-state`, `build-task-plan`, dev agents |
| PR review workflow | Skill | Performs evidence-grounded PR review with map-reduce subreview, synthesis, and optional posting. | `git`, `gh`, dev agents |
| Prompt eval builder | Skill | Turns prompt behavior requirements into promptfoo evaluation configs. | `evals`, promptfoo |

## Module Boundaries

| Module | Public API / Contract |
|--------|------------------------|
| `cli` | Stable user commands: `rp1 init`, `install`, `verify`, `update`, `migrate`, `arcade`, `settings`, `agent-tools`; `_daemon-server` is private. |
| `cli/agent-tools` | Structured JSON tools: `emit`, `workflow-bootstrap`, `workflow-state`, `resolve-args`, `rp1-root-dir`, `build-task-plan`, `change-manifest`, `comment-extract`, `work-search`, `socratic-duel`. |
| `cli/build` | `rp1 build` consumes `SKILL.md`, agent markdown, plugin manifests, and state diagrams; manual argument hints/tables are invalid for parameterized skills. |
| `cli/install` | Install targets: Claude Code, OpenCode, Codex, Copilot, all; installers consume generated or bundled platform assets. |
| `web-ui` | V2 REST API, WebSocket stream, static app, daemon lifecycle, and frontend routes; event DB remains source of truth. |
| `native-app` | Electrobun entrypoint delegates runtime to `rp1 arcade` and loads a `hostMode=native` loopback URL. |
| `plugins/base` | Namespace `/rp1-base:*`; base must not depend on dev commands; producer agents load templates from artifact-templates. |
| `plugins/dev` | Namespace `/rp1-dev:*`; dev may depend on base; parent workflows own phase transitions and subagents use namespaced steps. |
| `plugins/utils` | Namespace `/rp1-utils:*`; internal-facing prompt and eval utilities. |
| `docs/reference` | Behavior docs must track argument schemas, state machines, artifact routing, and platform contracts. |
| `evals` | Promptfoo assets and attestation outputs validate prompt behavior and workflow contracts. |

## Internal Dependencies

- `cli/commands` exposes `agent-tools` lazily so normal CLI startup does not import heavy tool code.
- `rp1 arcade` depends on `web-ui/daemon`, which launches `web-ui/server`.
- `workflow-bootstrap` depends on `build/parser`, `resolve-args`, `emit`, and shared directory logic.
- `emit` depends on state validation and `emit/database`, then notifies Arcade best-effort.
- `workflow-state`, `work-search`, Socratic Duel, registry, notifications, and annotation APIs all depend on SQLite-backed runtime state.
- `cli/build` parses `plugins/base`, `plugins/dev`, and optionally `plugins/utils`, then feeds `cli/catalog` and `cli/install`.
- `web-ui/frontend` consumes `web-ui/server` APIs and WebSocket events; it is a projection, not canonical state.
- `native-app` delegates to `rp1 arcade` instead of reimplementing the server.
- Dev workflows rely on base templates and conventions; utils prompt workflows rely on base prompt pipeline capabilities.

## External Dependencies

| Dependency | Purpose | Used By |
|------------|---------|---------|
| Bun | Runtime, package manager, tests, bundling, Bun server, `bun:sqlite`. | CLI, web UI, native app |
| Commander | CLI command parsing. | `cli/commands` |
| fp-ts | Either/TaskEither data flows and typed error handling. | CLI runtime |
| YAML | Frontmatter/config parsing and rendering. | build, catalog, agent-tools |
| LiquidJS | Platform prompt preprocessing and template transforms. | build |
| React / Vite | Arcade frontend runtime and dev build. | `web-ui/frontend` |
| React Router | Arcade routes. | `web-ui/frontend` |
| Radix UI | Accessible UI primitives. | `web-ui/frontend` |
| lucide-react | Icon set. | `web-ui/frontend` |
| Milkdown | Markdown editing/rendering surfaces. | `web-ui/frontend` |
| Mermaid | Diagram rendering and validation support. | CLI, web UI |
| reveal.js | Slide rendering for walkthrough artifacts. | `web-ui/frontend` |
| Shiki | Syntax highlighting. | `web-ui/frontend` |
| Electrobun | Native desktop shell. | `native-app` |
| GitHub CLI / gh copilot | Copilot plugin marketplace and PR workflows. | install, review |
| Octokit | GitHub API access. | CLI and dev workflows |
| Puppeteer | Browser automation/rendering support. | CLI tooling |
| promptfoo | Prompt behavior regression evaluation. | `evals`, prompt-eval-builder |

## Module Metrics

| Module | Files | Lines | Components |
|--------|-------|-------|------------|
| `cli/commands` | 32 | 6,777 | 7 |
| `cli/agent-tools` | 76 | 20,606 | 10 |
| `cli/build` | 73 | 8,534 | 7 |
| `cli/catalog` | 3 | 851 | 1 |
| `cli/install` | 28 | 8,792 | 4 |
| `cli/init` | 30 | 8,007 | 3 |
| `cli/migrate` | 5 | 2,048 | 1 |
| `cli/shared` | 14 | 1,575 | 4 |
| `web-ui/server` | 19 | 8,615 | 5 |
| `web-ui/daemon` | 7 | 1,776 | 3 |
| `web-ui/frontend` | 156 | 30,786 | 7 |
| `native-app` | 4 | 1,160 | 2 |
| `plugins/base` | 105 | 19,802 | 11 |
| `plugins/dev` | 57 | 13,188 | 12 |
| `plugins/utils` | 10 | 1,393 | 3 |
| `docs/reference` | 41 | 7,234 | 1 |
| `evals` | 54 | 42,859 | 2 |

## Cross-Module Patterns

- **Plugin Build and Install Pipeline**: Source plugins are authored once, parsed by `cli/build`, transformed through platform definitions, cataloged, then installed through `cli/install`.
- **Tracked Workflow Runtime**: Workflow skills bootstrap runs, emit state-machine events, register artifacts, and expose state through workflow-state and Arcade.
- **State-Machine Step Discipline**: Skills and agents define Mermaid state machines; subagents use colon-namespaced steps.
- **Artifact Template Routing**: Producers load canonical templates and register artifacts with explicit storage roots.
- **Project-Local Directory Model**: Tools resolve `projectRoot`, `kbRoot`, `workRoot`, and `codeRoot` from project identity instead of mutable env vars.
- **Arcade Projection Over Event DB**: Emit writes canonical state; server APIs and frontend routes project that state into dashboards, file views, notifications, and diagrams.
- **Manifest-Gated Cleanup**: Build and cleanup workflows create baselines and change manifests before agents modify comments or generated code.
- **Work Search as Rebuildable Projection**: `.rp1/work` remains canonical while `.rp1/search.db` provides fast discovery.
- **Native Shell Delegation**: Desktop app launches the existing CLI/daemon path and hosts the loopback UI.
- **Evidence-Grounded PR Workflows**: PR review and walkthrough gather git/GitHub/CI evidence, synthesize reports, and register markdown artifacts.

## Analysis Notes

- `plugins/utils/skills/build-prompt-evals/SKILL.md` appeared in an assigned analyzer input but is not present in the current tree; `plugins/utils/skills/prompt-eval-builder/SKILL.md` is the current corresponding prompt-eval utility.
- The FULL-mode refresh reconciled prior `modules.md`, the spatial evidence set, and a bounded novelty scan; unassigned files were not exhaustively analyzed one by one.
