# Modules

## CLI Entry and Commands
**Path**: `cli/src/`
**Purpose**: Hosts the rp1 executable, Commander.js program wiring, lazy-loaded entrypoints for agent-tools and daemon server, and user-facing commands (install, uninstall, init, verify, update, settings, arcade, fake).

**Key Files**:
- `cli/src/main.ts`
- `cli/src/commands/fake.ts`
- `cli/src/commands/install/index.ts`
- `cli/src/commands/init.ts`
- `cli/src/commands/settings.ts`

## Agent Tools and Workflow Runtime
**Path**: `cli/src/agent-tools/`
**Purpose**: Exposes the agent-tools CLI surface with subcommands for workflow event emission, task queue management, GitHub PR operations, comment extraction, Mermaid validation, RP1 root resolution, and state-machine loading and validation.

**Key Files**:
- `cli/src/agent-tools/command.ts`
- `cli/src/agent-tools/emit/database.ts`
- `cli/src/agent-tools/emit/index.ts`
- `cli/src/agent-tools/state-machine/loader.ts`
- `cli/src/agent-tools/task/index.ts`

## Build System
**Path**: `cli/src/build/`
**Purpose**: Multi-platform artifact build pipeline that transforms Claude Code source plugins into OpenCode, Claude Code, and Codex format using LiquidJS templates, platform registries, conditional preprocessing, linting, and bundle manifest generation.

**Key Files**:
- `cli/src/build/command.ts`
- `cli/src/build/models.ts`
- `cli/src/build/parser.ts`
- `cli/src/build/template-engine.ts`
- `cli/src/build/codex/registry.ts`

## Installation and Distribution
**Path**: `cli/src/install/`
**Purpose**: Installs built plugin artifacts into supported host tools (OpenCode, Claude Code, Codex) with backup, rollback, staging, prerequisite checks, manifest discovery, and post-install verification.

**Key Files**:
- `cli/src/install/installer.ts`
- `cli/src/install/manifest.ts`
- `cli/src/install/command.ts`
- `cli/src/install/prerequisites.ts`
- `cli/src/install/verifier.ts`

## Uninstall
**Path**: `cli/src/uninstall/`
**Purpose**: Removes previously installed plugin artifacts from host tool directories.

**Key Files**:
- `cli/src/uninstall/index.ts`
- `cli/src/uninstall/models.ts`

## Config
**Path**: `cli/src/config/`
**Purpose**: Manages the supported tools registry (OpenCode, Claude Code, Codex) with types, loader, and lookup functions. Source of truth is a YAML file embedded at build time.

**Key Files**:
- `cli/src/config/supported-tools.ts`
- `cli/src/config/supported-tools.yaml`

## Web UI Backend
**Path**: `cli/web-ui/src/server/`
**Purpose**: Bun HTTP server and WebSocket hub providing REST APIs (runs, artifacts, annotations, projects, settings), live event broadcast, file watching, startup recovery from missed events, downsampling, markdown embedding, and static asset serving.

**Key Files**:
- `cli/web-ui/src/server.ts`
- `cli/web-ui/src/server/http.ts`
- `cli/web-ui/src/server/websocket.ts`
- `cli/web-ui/src/server/annotation-service.ts`
- `cli/web-ui/src/server/routes/v2-api.ts`

## Web UI Daemon
**Path**: `cli/web-ui/src/daemon/`
**Purpose**: Daemon lifecycle manager that spawns, monitors, and communicates with the background Web UI server process via IPC and config-dir state files.

**Key Files**:
- `cli/web-ui/src/daemon/manager.ts`
- `cli/web-ui/src/daemon/ipc.ts`
- `cli/web-ui/src/daemon/config-dir.ts`

## Web UI Frontend
**Path**: `cli/web-ui/src/`
**Purpose**: React SPA dashboard with icon-rail navigation, vertical step lists, artifact viewer panel, inline Milkdown markdown editor, annotation system (indicators, popovers, sidebar), command palette, keyboard navigation, Mermaid diagram rendering, and Shiki syntax highlighting.

**Key Files**:
- `cli/web-ui/src/app/V2Layout.tsx`
- `cli/web-ui/src/components/v2/VerticalStepList.tsx`
- `cli/web-ui/src/components/v2/ArtifactViewerPanel.tsx`
- `cli/web-ui/src/components/MilkdownEditor/MilkdownEditor.tsx`
- `cli/web-ui/src/providers/AnnotationProvider.tsx`

## Base Knowledge Workflows
**Path**: `plugins/base/`
**Purpose**: Foundational plugin providing KB generation and loading, documentation generation, Mermaid diagram support, strategy workflows, deep research, content writing, task management, and security analysis skills, plus specialized KB builder and research agents.

**Key Files**:
- `plugins/base/skills/knowledge-build/SKILL.md`
- `plugins/base/skills/knowledge-load/SKILL.md`
- `plugins/base/skills/strategize/SKILL.md`
- `plugins/base/agents/kb-spatial-analyzer.md`
- `plugins/base/agents/research-reporter.md`

## Dev Workflow Orchestration
**Path**: `plugins/dev/`
**Purpose**: Feature delivery plugin with build (full, fast, express), blueprint, PR review, code audit, feature archive/edit/unarchive, and code investigation skills, plus 30+ specialized agents for requirements, design, tasks, building, verification, and review.

**Key Files**:
- `plugins/dev/skills/build/SKILL.md`
- `plugins/dev/skills/build-fast/SKILL.md`
- `plugins/dev/skills/pr-review/SKILL.md`
- `plugins/dev/agents/task-builder.md`
- `plugins/dev/agents/feature-verifier.md`

## Utils Prompt Workflows
**Path**: `plugins/utils/`
**Purpose**: Utility plugin providing prompt authoring (prompt-writer), prompt tersification, eval assertion extraction (build-prompt-evals), eval builder, and tester skills.

**Key Files**:
- `plugins/utils/skills/prompt-writer/SKILL.md`
- `plugins/utils/skills/build-prompt-evals/SKILL.md`
- `plugins/utils/skills/tersify-prompt/SKILL.md`

## Evaluation and Attestation
**Path**: `evals/src/attestation/`
**Purpose**: Prompt attestation system that computes dependency graphs between skills and agents, hashes prompt content, tracks attestation manifests, and verifies that prompt changes have passing eval suites.

**Key Files**:
- `evals/src/index.ts`
- `evals/src/attestation/commands.ts`
- `evals/src/attestation/deps-graph.ts`
- `evals/src/attestation/prompt-hash.ts`
- `evals/src/attestation/manifest.ts`

## Mermaid Theme Package
**Path**: `packages/catppuccin-mermaid/`
**Purpose**: Standalone npm package exporting Catppuccin-flavored Mermaid theme configuration with four flavors (latte, frappe, macchiato, mocha), palette helpers, contrast utilities, and WCAG accessibility checks.

**Key Files**:
- `packages/catppuccin-mermaid/src/index.ts`
- `packages/catppuccin-mermaid/src/theme.ts`
- `packages/catppuccin-mermaid/src/palette.ts`
- `packages/catppuccin-mermaid/src/types.ts`
