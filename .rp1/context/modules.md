# Modules

**Repository**: rp1
**Primary Language**: TypeScript
**Last Updated**: 2026-03-15

## Top-Level Modules

| Module | Path | Purpose | Depends On |
|--------|------|---------|------------|
| CLI Entry and Commands | `cli/src/` | Hosts the `rp1` executable, top-level command wiring, lazy loading, and daemon startup. | Installation and Distribution, Agent Tools and Workflow Runtime, Web UI Backend |
| Installation and Distribution | `cli/src/install/` | Installs plugins and artifacts into supported host tools with backup and rollback behavior. | Base Knowledge Workflows, Dev Workflow Orchestration, Utils Prompt Workflows |
| Agent Tools and Workflow Runtime | `cli/src/agent-tools/` | Exposes workflow status, artifact, task, GitHub, and state-machine services. | Web UI Backend |
| Web UI Backend | `cli/web-ui/src/server/` | Runs the Bun daemon, HTTP routes, WebSocket hub, replay, and project/run APIs. | Agent Tools and Workflow Runtime |
| Web UI Frontend | `cli/web-ui/src/app/` | Renders the live dashboard with icon-rail navigation, vertical step lists, artifact viewer, and activity feed. | Web UI Backend |
| Base Knowledge Workflows | `plugins/base/` | Defines KB, docs, Mermaid, strategy, and supporting prompt workflows. | - |
| Dev Workflow Orchestration | `plugins/dev/` | Defines feature delivery, review, archive, audit, and build workflows. | Base Knowledge Workflows, Agent Tools and Workflow Runtime |
| Utils Prompt Workflows | `plugins/utils/` | Provides prompt-writing, tersification, and eval-helper workflows. | - |
| Evaluation and Attestation | `evals/src/attestation/` | Verifies prompt changes through dependency graphs, hashes, and attestations. | Base Knowledge Workflows, Dev Workflow Orchestration, Utils Prompt Workflows |
| Mermaid Theme Package | `packages/catppuccin-mermaid/` | Publishes reusable Mermaid theme configuration and palette helpers. | - |

## Key Components

| Component | Module | Role |
|-----------|--------|------|
| `main.ts` bootstrap | CLI Entry and Commands | Builds the Commander program and routes special lazy-loaded entrypoints. |
| `handleAgentToolsCommand` | CLI Entry and Commands | Defers loading of agent-tools code until needed. |
| `handleDaemonServerCommand` | CLI Entry and Commands | Starts the bundled Web UI daemon path. |
| `installRp1` | Installation and Distribution | Orchestrates backup, cleanup, install, and rollback for tool installs. |
| `copyToStaging` | Installation and Distribution | Builds staging trees for safer multi-plugin installation. |
| `agentToolsCommand` | Agent Tools and Workflow Runtime | Exposes the agent-tools CLI surface. |
| `executeUpdate` | Agent Tools and Workflow Runtime | Records workflow updates and daemon notifications. |
| `executeArtifact` | Agent Tools and Workflow Runtime | Registers artifacts and aligns them with workflow steps. |
| `getEmitDatabase` | Agent Tools and Workflow Runtime | Owns the shared SQLite event store. |
| `loadStateMachine` | Agent Tools and Workflow Runtime | Loads and validates Mermaid workflow graphs. |
| `createServer` | Web UI Backend | Assembles the daemon server, replay provider, and live broadcast pipeline. |
| `WebSocketHub` | Web UI Backend | Manages subscriptions, heartbeats, replay, and live fan-out. |
| `handleV2RunsListRequest` | Web UI Backend | Serves paginated run listings enriched with registry context. |
| `App` | Web UI Frontend | Composes the provider stack and routing shell with AppLayout (icon rail + mobile tab bar). |
| `IconRail` | Web UI Frontend | Persistent 48px navigation rail replacing the collapsible sidebar. |
| `MobileTabBar` | Web UI Frontend | Bottom tab navigation for small viewports. |
| `VerticalStepList` | Web UI Frontend | Pure CSS vertical step list replacing the React Flow canvas and dagre graph layout. |
| `ArtifactViewerPanel` | Web UI Frontend | Slide-over panel for viewing run artifacts. |
| `knowledge-build` | Base Knowledge Workflows | Regenerates KB files through a spatial + parallel analysis flow. |
| `build` | Dev Workflow Orchestration | Coordinates end-to-end feature delivery across requirements to archive. |
| `prompt-writer` | Utils Prompt Workflows | Defines terse prompt-authoring conventions. |
| `build-prompt-evals` | Utils Prompt Workflows | Extracts eval assertions and minimal prompt tests. |
| `attestCommand` | Evaluation and Attestation | Updates attestation manifests when suites pass. |
| `buildDependencyGraph` | Evaluation and Attestation | Computes transitive prompt dependencies for attestation. |
| `createTheme` | Mermaid Theme Package | Builds Mermaid theme objects from warm stone palette colors. |

## Responsibility Matrix

| Module | Owns |
|--------|------|
| CLI Entry and Commands | executable startup, command registration, lazy loading boundaries, daemon launch |
| Installation and Distribution | plugin install, backups, restore, staging, verification |
| Agent Tools and Workflow Runtime | run events, artifacts, tasks, state-machine validation, shared runtime utilities |
| Web UI Backend | HTTP API, WebSocket broadcasting, replay, startup recovery, registry integration |
| Web UI Frontend | dashboard UI (icon rail, vertical step lists, artifact viewer, activity feed), route composition, live client state |
| Base Knowledge Workflows | KB generation, KB loading rules, docs helpers, Mermaid support |
| Dev Workflow Orchestration | feature lifecycle, review flows, archive flows, delivery orchestration |
| Utils Prompt Workflows | prompt authoring helpers, tersification, eval generation |
| Evaluation and Attestation | dependency graphs, prompt hashing, attestation manifests, verification |
| Mermaid Theme Package | Mermaid theme config, warm stone palette exports, contrast helpers |

## Module Notes

- `plugins/dev` depends on `plugins/base`; base remains the foundational layer for shared knowledge and prompt conventions.
- `cli/src/agent-tools/` is the operational backbone because both workflows and the Web UI depend on its contracts.
- The Web UI is split cleanly between a Bun backend daemon and a React frontend, with event replay bridging the two.
- Prompt assets are first-class modules even though they are authored as markdown rather than standalone packages.
