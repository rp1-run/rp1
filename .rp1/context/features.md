# Repository Capabilities

**Repository**: rp1
**Last Updated**: 2026-07-25
**Surfaces**: 10 detected
**Scope**: Capabilities inventoried across all projects in this repository.

## CLI Core

- **Project Initialization** `T1` -- Interactive setup of `.rp1/` directory structure, context detection, gitignore configuration, and global stanza injection
  <!-- id: cli-core.init | tier: T1 | audience: developer | evidence: cli/src/commands/init.ts, cli/src/init/index.ts, docs/reference/cli/init.md -->
- **Multi-Platform Installation** `T1` -- Installs rp1 skills and agents into Claude Code, OpenCode, Codex, Copilot, and Antigravity with per-platform adapters
  <!-- id: cli-core.install | tier: T1 | audience: developer | evidence: cli/src/commands/install/index.ts, cli/src/install/installer.ts, docs/reference/cli/install.md -->
  - Claude Code Installer `T1` -- Writes CLAUDE.md stanzas and registers marketplace plugin
    <!-- id: cli-core.install.claude-code | tier: T1 | audience: developer | evidence: cli/src/install/claudecode/installer.ts, cli/src/commands/install/claude-code.ts -->
  - OpenCode Installer `T1` -- Generates OpenCode-compatible agent configuration
    <!-- id: cli-core.install.opencode | tier: T1 | audience: developer | evidence: cli/src/commands/install/opencode.ts -->
  - Codex Installer `T1` -- Produces Codex agent AGENTS.md and sub-agent configs
    <!-- id: cli-core.install.codex | tier: T1 | audience: developer | evidence: cli/src/install/codex/installer.ts, cli/src/commands/install/codex.ts -->
  - Copilot Installer `T1` -- Writes GitHub Copilot instructions and marketplace extensions
    <!-- id: cli-core.install.copilot | tier: T1 | audience: developer | evidence: cli/src/install/copilot/installer.ts, cli/src/commands/install/copilot.ts -->
  - Antigravity Installer `T1` -- Bundles assets and lifecycle hooks for the Antigravity platform
    <!-- id: cli-core.install.antigravity | tier: T1 | audience: developer | evidence: cli/src/install/antigravity/index.ts, cli/src/commands/install/antigravity.ts -->
  - Install All `T2` -- Auto-detects installed platforms and installs to all in one pass
    <!-- id: cli-core.install.all | tier: T2 | audience: developer | evidence: cli/src/commands/install/all.ts -->
- **Installation Verification** `T1` -- Validates that rp1 is correctly installed on each platform with platform-specific health checks
  <!-- id: cli-core.verify | tier: T1 | audience: developer | evidence: cli/src/commands/verify/index.ts, docs/reference/cli/verify.md -->
- **Self-Update** `T1` -- Checks for and applies CLI binary updates from GitHub releases
  <!-- id: cli-core.self-update | tier: T1 | audience: developer | evidence: cli/src/commands/check-update.ts, cli/src/commands/self-update.ts -->
- **Update and Plugin Sync** `T1` -- Updates installed platform artifacts and manages plugin versions
  <!-- id: cli-core.update | tier: T1 | audience: developer | evidence: cli/src/commands/update/index.ts, cli/src/commands/update/plugins.ts, docs/reference/cli/update.md -->
- **Uninstall** `T1` -- Removes rp1 artifacts from all platforms including Antigravity, Codex, and Copilot-specific cleanup
  <!-- id: cli-core.uninstall | tier: T1 | audience: developer | evidence: cli/src/commands/uninstall.ts, cli/src/commands/uninstall-antigravity.ts, cli/src/commands/uninstall-codex.ts, cli/src/commands/uninstall-copilot.ts, docs/reference/cli/uninstall.md -->
- **List Installed Plugins** `T2` -- Shows which plugins are installed and their versions
  <!-- id: cli-core.list | tier: T2 | audience: developer | evidence: cli/src/commands/install.ts -->
- **Migration** `T1` -- Upgrades `.rp1/` directory from older layout versions with database backfill, central store migration, stanza upgrades, and legacy work directory conversion
  <!-- id: cli-core.migrate | tier: T1 | audience: developer | evidence: cli/src/commands/migrate.ts, cli/src/migrate/index.ts, cli/src/migrate/db-backfill.ts, cli/src/migrate/central-store.ts, docs/reference/cli/rp1-migrate.md -->
- **Settings Management** `T1` -- Validates, applies, and manages settings.toml presets including arcade and harness configuration
  <!-- id: cli-core.settings | tier: T1 | audience: developer | evidence: cli/src/commands/settings.ts, cli/src/settings/loader.ts, cli/src/settings/rewriter.ts, docs/reference/cli/settings.md -->
- **Deprecated Command Shims** `T3` -- Hidden compatibility shims for renamed or removed commands
  <!-- id: cli-core.deprecated | tier: T3 | audience: developer | evidence: cli/src/commands/deprecated/index.ts -->
- **Fake Data Generator** `T3` -- Generates synthetic emit events and workflow artifacts for testing the Arcade UI
  <!-- id: cli-core.fake | tier: T3 | audience: contributor | evidence: cli/src/commands/fake.ts -->

## Build Pipeline

- **Prompt Compiler** `T1` -- Parses skill and agent markdown, resolves arguments, applies preprocessor transforms, validates structure, and emits platform-specific output
  <!-- id: build-pipeline.compiler | tier: T1 | audience: contributor | evidence: cli/src/build/parser.ts, cli/src/build/preprocessor.ts, cli/src/build/validator.ts, cli/src/build/command.ts -->
  - Template Engine `T1` -- Interpolates `{variables}` and processes conditional sections in prompt files
    <!-- id: build-pipeline.compiler.template-engine | tier: T1 | audience: contributor | evidence: cli/src/build/template-engine.ts, cli/src/build/template-context.ts -->
  - Argument Resolution `T1` -- Parses structured `arguments` arrays from frontmatter into runtime parameter blocks
    <!-- id: build-pipeline.compiler.arguments | tier: T1 | audience: contributor | evidence: cli/src/build/arguments.ts -->
  - Tag Processing `T1` -- Expands custom XML tags during build (e.g. inline includes, platform conditionals)
    <!-- id: build-pipeline.compiler.tags | tier: T1 | audience: contributor | evidence: cli/src/build/tags/ -->
- **Platform Definitions** `T1` -- Declares per-platform build targets with feature flags and output format specifications
  <!-- id: build-pipeline.platform-defs | tier: T1 | audience: contributor | evidence: cli/src/build/platform-definitions.ts -->
  - Claude Code Target `T1` -- Emits CLAUDE.md-compatible skill stanzas
    <!-- id: build-pipeline.platform-defs.claude-code | tier: T1 | audience: contributor | evidence: cli/src/build/claude-code/registry.ts -->
  - Codex Target `T1` -- Emits AGENTS.md with sub-agent delegation and role mapping
    <!-- id: build-pipeline.platform-defs.codex | tier: T1 | audience: contributor | evidence: cli/src/build/codex/index.ts, cli/src/build/codex/role-mapper.ts, cli/src/build/codex/sub-agent-validator.ts -->
  - Antigravity Target `T1` -- Produces Gemini-compatible bundles with lifecycle hooks
    <!-- id: build-pipeline.platform-defs.antigravity | tier: T1 | audience: contributor | evidence: cli/src/build/antigravity/hooks.ts, cli/src/build/antigravity/registry.ts -->
  - Copilot Target `T2` -- Generates GitHub Copilot instruction files
    <!-- id: build-pipeline.platform-defs.copilot | tier: T2 | audience: contributor | evidence: cli/src/build/copilot/registry.ts -->
- **Model Tier Resolution** `T1` -- Resolves per-agent model and reasoning-effort overrides from settings.toml tiering configuration
  <!-- id: build-pipeline.tier-resolution | tier: T1 | audience: contributor | evidence: cli/src/build/tier-resolution.ts -->
- **Build Lint Rules** `T2` -- Static analysis rules that validate prompt file structure, naming conventions, and cross-references
  <!-- id: build-pipeline.lint | tier: T2 | audience: contributor | evidence: cli/src/build/lint/index.ts, cli/src/build/lint/rules/ -->
- **Catalog Generator** `T1` -- Produces `catalog/agents.yaml` manifest from all agent and skill definitions for discovery and registry use
  <!-- id: build-pipeline.catalog | tier: T1 | audience: contributor | evidence: cli/src/build/catalog-generator.ts, cli/src/catalog/, catalog/agents.yaml -->
- **Build-Time Filters** `T2` -- Configurable filter chain for content transformation during build (e.g. stripping comments, minifying)
  <!-- id: build-pipeline.filters | tier: T2 | audience: contributor | evidence: cli/src/build/filters/ -->
- **Parse Cache** `T2` -- Caches parsed prompt ASTs to accelerate incremental builds
  <!-- id: build-pipeline.parse-cache | tier: T2 | audience: contributor | evidence: cli/src/build/parse-cache.ts -->

## Agent Tools Runtime

- **Workflow Event Emitter** `T1` -- Records agent workflow events (artifact_registered, step transitions, run lifecycle) into a local SQLite database with state machine validation
  <!-- id: agent-tools.emit | tier: T1 | audience: agent | evidence: cli/src/agent-tools/emit/, cli/src/agent-tools/command.ts:1199 -->
  - State Machine Enforcement `T1` -- Validates step transitions against declared state diagrams in skill frontmatter
    <!-- id: agent-tools.emit.state-machine | tier: T1 | audience: agent | evidence: cli/src/agent-tools/state-machine/ -->
  - Resume Run `T1` -- Continues a previously paused workflow run with preserved state
    <!-- id: agent-tools.emit.resume-run | tier: T1 | audience: agent | evidence: cli/src/agent-tools/command.ts:1436 -->
  - End Run `T1` -- Closes a workflow run and finalizes its state
    <!-- id: agent-tools.emit.end-run | tier: T1 | audience: agent | evidence: cli/src/agent-tools/command.ts:1542 -->
- **Mermaid Diagram Validator** `T1` -- Validates mermaid diagram syntax from files or stdin with auto-repair suggestions
  <!-- id: agent-tools.mmd-validate | tier: T1 | audience: agent | evidence: cli/src/agent-tools/mmd-validate/, cli/src/agent-tools/command.ts:172 -->
- **Project Root Resolver** `T1` -- Returns projectRoot, kbRoot, and workRoot paths respecting active storage mode
  <!-- id: agent-tools.rp1-root-dir | tier: T1 | audience: agent | evidence: cli/src/agent-tools/rp1-root-dir/, cli/src/agent-tools/command.ts:270 -->
- **Argument Resolver** `T1` -- Resolves skill arguments from user input and environment variables into structured JSON
  <!-- id: agent-tools.resolve-args | tier: T1 | audience: agent | evidence: cli/src/agent-tools/resolve-args/, cli/src/agent-tools/command.ts:335 -->
- **Workflow Bootstrap** `T1` -- Initializes a new workflow run directory with required metadata
  <!-- id: agent-tools.workflow-bootstrap | tier: T1 | audience: agent | evidence: cli/src/agent-tools/workflow-bootstrap/, cli/src/agent-tools/command.ts:465 -->
- **Workflow State Query** `T1` -- Reports current state of a running workflow including completed steps and pending transitions
  <!-- id: agent-tools.workflow-state | tier: T1 | audience: agent | evidence: cli/src/agent-tools/workflow-state/, cli/src/agent-tools/command.ts:602 -->
- **Build Task Plan** `T1` -- Generates structured task execution plans for the build workflow
  <!-- id: agent-tools.build-task-plan | tier: T1 | audience: agent | evidence: cli/src/agent-tools/build-task-plan/, cli/src/agent-tools/command.ts:753 -->
- **Work Search** `T1` -- Searches across rp1 work artifacts (features, tasks, reports) by query with structured results
  <!-- id: agent-tools.work-search | tier: T1 | audience: agent | evidence: cli/src/agent-tools/work-search/, cli/src/agent-tools/command.ts:877 -->
- **Change Manifest** `T1` -- Resolves a user-specified code scope into a durable list of files for batch operations
  <!-- id: agent-tools.change-manifest | tier: T1 | audience: agent | evidence: cli/src/agent-tools/change-manifest/, cli/src/agent-tools/command.ts:975 -->
- **Comment Extractor** `T1` -- Extracts code comment locations from files for analysis and cleanup workflows
  <!-- id: agent-tools.comment-extract | tier: T1 | audience: agent | evidence: cli/src/agent-tools/comment-extract/, cli/src/agent-tools/command.ts:1113 -->
- **Annotation Feedback System** `T1` -- Manages user annotations on artifacts including read, resolve, reply, and accept-edit operations
  <!-- id: agent-tools.feedback | tier: T1 | audience: agent | evidence: cli/src/agent-tools/feedback/, cli/src/agent-tools/command.ts:1627 -->
- **Socratic Duel Coordinator** `T1` -- Manages lock-based turn coordination for multi-agent debate workflows
  <!-- id: agent-tools.socratic-duel | tier: T1 | audience: agent | evidence: cli/src/agent-tools/socratic-duel/, cli/src/agent-tools/command.ts:1933 -->
- **Task Queue** `T1` -- Agent-facing task CRUD for creating, listing, picking up, completing, failing, and cancelling queued tasks
  <!-- id: agent-tools.task | tier: T1 | audience: agent | evidence: cli/src/agent-tools/task/, cli/src/agent-tools/command.ts:2189 -->
- **GitHub PR Integration** `T1` -- Submit reviews, add reactions, reply to comments, fetch comments, and publish comments on GitHub PRs
  <!-- id: agent-tools.github-pr | tier: T1 | audience: agent | evidence: cli/src/agent-tools/github-pr/, cli/src/agent-tools/command.ts:2671 -->
- **Git Utilities** `T2` -- Helper functions for git operations used by agent workflows
  <!-- id: agent-tools.git | tier: T2 | audience: agent | evidence: cli/src/agent-tools/git.ts -->

## Arcade (Web UI)

- **Dashboard** `T1` -- Real-time web dashboard showing workflow runs, artifacts, and project status across multiple workspaces
  <!-- id: arcade.dashboard | tier: T1 | audience: developer | evidence: cli/web-ui/src/pages/v2/HomePage.tsx, docs/arcade/dashboard.md -->
  - Workspace Tab Strip `T1` -- Multi-workspace tabbed interface with pinned projects and live status indicators
    <!-- id: arcade.dashboard.workspace-tabs | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/WorkspaceTabStrip.tsx, cli/web-ui/src/hooks/useWorkspaceTabs.tsx -->
  - Run Cards `T1` -- Real-time workflow run cards with status badges, step progress, and event streams
    <!-- id: arcade.dashboard.run-cards | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/RunCard.tsx, cli/web-ui/src/hooks/useRuns.ts -->
  - Notification System `T1` -- Toast and sidebar notifications for workflow events with configurable attention levels
    <!-- id: arcade.dashboard.notifications | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/NotificationsSidebar.tsx, cli/web-ui/src/components/v2/NotificationToast.tsx, cli/web-ui/src/hooks/useNotifications.ts -->
  - Command Palette `T1` -- Keyboard-driven command palette for navigation and actions
    <!-- id: arcade.dashboard.command-palette | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/CommandPalette.tsx -->
- **Artifact Browser** `T1` -- File-tree browser for viewing and navigating rp1 work artifacts with markdown rendering
  <!-- id: arcade.artifact-browser | tier: T1 | audience: developer | evidence: cli/web-ui/src/pages/v2/FileBrowserPage.tsx, cli/web-ui/src/components/FileTree/, docs/arcade/artifact-viewer.md -->
  - Markdown Viewer `T1` -- Rich markdown renderer with syntax highlighting, mermaid diagrams, and table of contents
    <!-- id: arcade.artifact-browser.markdown-viewer | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/MarkdownViewer/, cli/web-ui/src/components/v2/UnifiedContentRenderer.tsx -->
  - Sandboxed HTML Artifacts `T1` -- Renders HTML artifacts in secure sandboxed iframes
    <!-- id: arcade.artifact-browser.sandboxed-html | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/SandboxedHtmlArtifact.tsx -->
  - Artifact Grouping `T2` -- Groups related artifacts by workflow and type for organized browsing
    <!-- id: arcade.artifact-browser.grouping | tier: T2 | audience: developer | evidence: cli/web-ui/src/lib/artifact-groups.ts -->
- **Annotation System** `T1` -- User feedback annotations on artifacts with popover and sidebar interfaces for review collaboration
  <!-- id: arcade.annotations | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/AnnotationPopover.tsx, cli/web-ui/src/components/v2/AnnotationSidebar.tsx, cli/web-ui/src/hooks/useAnnotations.ts, docs/arcade/annotations.md -->
  - Text Selection Annotations `T1` -- Select text in artifacts to create inline annotations
    <!-- id: arcade.annotations.text-selection | tier: T1 | audience: developer | evidence: cli/web-ui/src/hooks/useTextSelection.ts, cli/web-ui/src/components/v2/SelectionPopover.tsx -->
  - Milkdown Editor `T2` -- WYSIWYG markdown editor for annotation content
    <!-- id: arcade.annotations.milkdown | tier: T2 | audience: developer | evidence: cli/web-ui/src/components/MilkdownEditor/ -->
- **Run Detail View** `T1` -- Detailed view of a single workflow run showing step-by-step progress, artifacts, and event timeline
  <!-- id: arcade.run-detail | tier: T1 | audience: developer | evidence: cli/web-ui/src/pages/v2/RunDetailPage.tsx, cli/web-ui/src/components/v2/RunDetailSurface.tsx, cli/web-ui/src/hooks/useRunDetail.ts -->
  - Vertical Step List `T1` -- Displays workflow steps as a vertical timeline with completion status
    <!-- id: arcade.run-detail.step-list | tier: T1 | audience: developer | evidence: cli/web-ui/src/components/v2/VerticalStepList.tsx, cli/web-ui/src/hooks/useWorkflowSteps.ts -->
  - Walkthrough Reveal Reader `T2` -- Slide-by-slide reveal presentation of PR walkthrough artifacts
    <!-- id: arcade.run-detail.walkthrough | tier: T2 | audience: developer | evidence: cli/web-ui/src/components/v2/WalkthroughRevealReader.tsx, cli/web-ui/src/lib/walkthrough-slide-source.ts -->
- **Project Overview** `T1` -- Project-level dashboard with run history, artifact counts, and workspace descriptor
  <!-- id: arcade.project-overview | tier: T1 | audience: developer | evidence: cli/web-ui/src/pages/v2/ProjectOverviewPage.tsx, cli/web-ui/src/pages/v2/ProjectsPage.tsx -->
- **Daemon Manager** `T1` -- Background daemon process that serves the Arcade web UI with lifecycle locking and IPC communication
  <!-- id: arcade.daemon | tier: T1 | audience: developer | evidence: cli/web-ui/src/daemon/manager.ts, cli/web-ui/src/daemon/lifecycle-lock.ts, cli/web-ui/src/daemon/ipc.ts -->
- **Keyboard Shortcuts** `T1` -- Comprehensive keyboard shortcut system with global and contextual bindings and a help overlay
  <!-- id: arcade.keyboard | tier: T1 | audience: developer | evidence: cli/web-ui/src/hooks/useGlobalShortcuts.ts, cli/web-ui/src/hooks/useContextualShortcuts.ts, cli/web-ui/src/components/v2/ShortcutHelpOverlay.tsx, docs/arcade/keyboard-shortcuts.md -->
- **Arcade Settings Bridge** `T2` -- Syncs settings between the CLI and the Arcade web UI
  <!-- id: arcade.settings-bridge | tier: T2 | audience: developer | evidence: cli/web-ui/src/server/arcade-settings-bridge.ts, docs/arcade/settings.md -->
- **Server-Side Services** `T1` -- Hono-based HTTP and WebSocket server with activity search, markdown projection, file watching, and project registry
  <!-- id: arcade.server | tier: T1 | audience: contributor | evidence: cli/web-ui/src/server.ts, cli/web-ui/src/server/http.ts, cli/web-ui/src/server/websocket.ts, cli/web-ui/src/server/registry.ts -->
  - Activity Search `T1` -- Full-text search across workflow activities and events
    <!-- id: arcade.server.activity-search | tier: T1 | audience: developer | evidence: cli/web-ui/src/server/activity-search.ts -->
  - Markdown Projection `T1` -- Server-side markdown processing with embedding resolution for artifact display
    <!-- id: arcade.server.markdown-projection | tier: T1 | audience: contributor | evidence: cli/web-ui/src/server/markdown-projection.ts, cli/web-ui/src/server/markdown-embedder.ts -->
  - Annotations API `T1` -- REST API for annotation CRUD with server-side service layer
    <!-- id: arcade.server.annotations-api | tier: T1 | audience: contributor | evidence: cli/web-ui/src/server/routes/annotations-api.ts, cli/web-ui/src/server/annotation-service.ts -->

## Plugin System: Base

- **Knowledge Build** `T1` -- Orchestrates parallel KB generation using spatial analysis and map-reduce architecture with incremental and feature-learning modes
  <!-- id: plugin-base.knowledge-build | tier: T1 | audience: developer | evidence: plugins/base/skills/knowledge-build/SKILL.md, docs/reference/base/knowledge-build.md -->
  - KB Index Builder `T1` -- Produces the top-level index.md from aggregated analysis results
    <!-- id: plugin-base.knowledge-build.index-builder | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-index-builder.md -->
  - KB Feature Extractor `T1` -- Discovers and inventories project capabilities into features.md
    <!-- id: plugin-base.knowledge-build.feature-extractor | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-feature-extractor.md -->
  - KB Architecture Mapper `T1` -- Maps system topology into architecture.md
    <!-- id: plugin-base.knowledge-build.architecture-mapper | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-architecture-mapper.md -->
  - KB Module Analyzer `T1` -- Analyzes module boundaries and responsibilities into modules.md
    <!-- id: plugin-base.knowledge-build.module-analyzer | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-module-analyzer.md -->
  - KB Pattern Extractor `T1` -- Identifies recurring implementation patterns into patterns.md
    <!-- id: plugin-base.knowledge-build.pattern-extractor | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-pattern-extractor.md -->
  - KB Concept Extractor `T1` -- Builds domain terminology map into concept_map.md
    <!-- id: plugin-base.knowledge-build.concept-extractor | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-concept-extractor.md -->
  - KB Interaction Mapper `T1` -- Maps component interaction semantics into interaction-model.md
    <!-- id: plugin-base.knowledge-build.interaction-mapper | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-interaction-mapper.md -->
  - KB Spatial Analyzer `T1` -- Performs directory-level spatial analysis as input to other KB agents
    <!-- id: plugin-base.knowledge-build.spatial-analyzer | tier: T1 | audience: agent | evidence: plugins/base/agents/kb-spatial-analyzer.md -->
- **Deep Research** `T1` -- Autonomous map-reduce research on codebases and technical topics with structured report output
  <!-- id: plugin-base.deep-research | tier: T1 | audience: developer | evidence: plugins/base/skills/deep-research/SKILL.md, plugins/base/agents/research-explorer.md, plugins/base/agents/research-reporter.md, docs/reference/base/deep-research.md -->
- **Security Analysis** `T1` -- Evidence-bounded security posture assessment with standards mapping and registered report output
  <!-- id: plugin-base.analyse-security | tier: T1 | audience: developer | evidence: plugins/base/skills/analyse-security/SKILL.md, plugins/base/agents/security-validator.md, docs/reference/base/analyse-security.md -->
- **Socratic Duel** `T1` -- Bounded two-agent debate with lock-based turn coordination and structured artifact output
  <!-- id: plugin-base.socratic-duel | tier: T1 | audience: developer | evidence: plugins/base/skills/socratic-duel/SKILL.md, plugins/base/skills/socratic-duel-run/SKILL.md, plugins/base/agents/socratic-duel-participant.md, docs/reference/base/socratic-duel.md -->
- **Strategic Advisor** `T1` -- Holistic systems analysis with quantified trade-offs across cost, quality, performance, and complexity
  <!-- id: plugin-base.strategize | tier: T1 | audience: developer | evidence: plugins/base/skills/strategize/SKILL.md, plugins/base/agents/strategic-advisor.md, docs/reference/base/strategize.md -->
- **Project Overview Generator** `T1` -- Produces three-tier arc42/C4-aligned project overview with provenance metadata
  <!-- id: plugin-base.project-birds-eye-view | tier: T1 | audience: developer | evidence: plugins/base/skills/project-birds-eye-view/SKILL.md, plugins/base/agents/project-documenter.md, docs/reference/base/project-birds-eye-view.md -->
- **Mermaid Diagram Tools** `T1` -- Creates, validates, and repairs Mermaid.js diagrams with auto-fix for common syntax errors
  <!-- id: plugin-base.mermaid | tier: T1 | audience: developer | evidence: plugins/base/skills/mermaid/SKILL.md, plugins/base/skills/fix-mermaid/SKILL.md, plugins/base/agents/mermaid-fixer.md, docs/reference/base/fix-mermaid.md -->
- **Artifact Templates** `T1` -- Canonical output templates for 20+ agent producers ensuring format consistency and routing metadata
  <!-- id: plugin-base.artifact-templates | tier: T1 | audience: agent | evidence: plugins/base/skills/artifact-templates/SKILL.md, plugins/base/skills/artifact-templates/templates/ -->
- **Guide** `T1` -- Interactive skill discovery and workflow guidance for rp1 capabilities
  <!-- id: plugin-base.guide | tier: T1 | audience: developer | evidence: plugins/base/skills/guide/SKILL.md, docs/reference/base/guide.md -->
- **Self-Update** `T1` -- Updates rp1 and runs the full post-update lifecycle
  <!-- id: plugin-base.self-update | tier: T1 | audience: developer | evidence: plugins/base/skills/self-update/SKILL.md, docs/reference/base/self-update.md -->
- **Note Capture** `T2` -- Captures session context as structured markdown notes with auto-maintained index
  <!-- id: plugin-base.note | tier: T2 | audience: developer | evidence: plugins/base/skills/note/SKILL.md -->
- **Content Writer** `T2` -- Interactive prompt for creating polished technical documents through structured writing workflows
  <!-- id: plugin-base.write-content | tier: T2 | audience: developer | evidence: plugins/base/skills/write-content/SKILL.md, docs/reference/base/write-content.md -->
- **User Docs Generator** `T2` -- Synchronizes user-facing documentation with current KB through validate-stale-scan-approval orchestration
  <!-- id: plugin-base.generate-user-docs | tier: T2 | audience: developer | evidence: plugins/base/skills/generate-user-docs/SKILL.md -->
- **Markdown Preview** `T2` -- Generates browser-viewable HTML previews from markdown with auto-validation and Mermaid rendering
  <!-- id: plugin-base.markdown-preview | tier: T2 | audience: developer | evidence: plugins/base/skills/markdown-preview/SKILL.md -->
- **Code Comments Extractor** `T2` -- Extracts comment locations from code files for analysis
  <!-- id: plugin-base.code-comments | tier: T2 | audience: developer | evidence: plugins/base/skills/code-comments/SKILL.md -->
- **Task Manager** `T2` -- Discovers and manages queued tasks for agent execution
  <!-- id: plugin-base.task | tier: T2 | audience: developer | evidence: plugins/base/skills/task/SKILL.md -->
- **Prompt Writer** `T1` -- Writes maximally terse agent prompts with constitutional governance through a six-stage pipeline
  <!-- id: plugin-base.prompt-writer | tier: T1 | audience: contributor | evidence: plugins/base/skills/prompt-writer/SKILL.md -->
- **Scribe Agent** `T2` -- Note-taking agent for structured session capture
  <!-- id: plugin-base.scribe | tier: T2 | audience: agent | evidence: plugins/base/agents/scribe.md -->

## Plugin System: Dev

- **Build Workflow** `T1` -- End-to-end feature development workflow from requirements through planning, implementation, verification, and release
  <!-- id: plugin-dev.build | tier: T1 | audience: developer | evidence: plugins/dev/skills/build/SKILL.md, docs/reference/dev/build.md -->
  - Feature Requirement Gatherer `T1` -- Interviews user and generates structured requirements document
    <!-- id: plugin-dev.build.requirement-gatherer | tier: T1 | audience: agent | evidence: plugins/dev/agents/feature-requirement-gatherer.md -->
  - Feature Architect `T1` -- Produces design.md with component diagrams and technical approach from requirements
    <!-- id: plugin-dev.build.feature-architect | tier: T1 | audience: agent | evidence: plugins/dev/agents/feature-architect.md -->
  - Feature Tasker `T1` -- Decomposes design into ordered implementation tasks with test-first discipline
    <!-- id: plugin-dev.build.feature-tasker | tier: T1 | audience: agent | evidence: plugins/dev/agents/feature-tasker.md -->
  - Task Builder `T1` -- Implements individual tasks with code changes and test writing
    <!-- id: plugin-dev.build.task-builder | tier: T1 | audience: agent | evidence: plugins/dev/agents/task-builder.md -->
  - Task Reviewer `T1` -- Reviews implemented tasks against requirements and design specs
    <!-- id: plugin-dev.build.task-reviewer | tier: T1 | audience: agent | evidence: plugins/dev/agents/task-reviewer.md -->
  - Feature Verifier `T1` -- End-to-end verification that implementation satisfies original requirements
    <!-- id: plugin-dev.build.feature-verifier | tier: T1 | audience: agent | evidence: plugins/dev/agents/feature-verifier.md -->
  - Build Artifact Detector `T1` -- Detects generated artifacts that need cleanup or gitignore entries
    <!-- id: plugin-dev.build.artifact-detector | tier: T1 | audience: agent | evidence: plugins/dev/agents/build-artifact-detector.md -->
  - Build Task Grouper `T2` -- Groups related tasks for parallelized execution
    <!-- id: plugin-dev.build.task-grouper | tier: T2 | audience: agent | evidence: plugins/dev/agents/build-task-grouper.md -->
  - Build Task Parser `T2` -- Parses task list documents into structured task objects
    <!-- id: plugin-dev.build.task-parser | tier: T2 | audience: agent | evidence: plugins/dev/agents/build-task-parser.md -->
  - Build Verify Aggregator `T1` -- Aggregates verification results across multiple tasks into a summary
    <!-- id: plugin-dev.build.verify-aggregator | tier: T1 | audience: agent | evidence: plugins/dev/agents/build-verify-aggregator.md -->
  - Test Runner `T1` -- Executes test suites and reports results with coverage
    <!-- id: plugin-dev.build.test-runner | tier: T1 | audience: agent | evidence: plugins/dev/agents/test-runner.md -->
- **Build Fast** `T1` -- Quick-iteration development for small/medium scope changes with persistent plan artifact and optional review
  <!-- id: plugin-dev.build-fast | tier: T1 | audience: developer | evidence: plugins/dev/skills/build-fast/SKILL.md, plugins/dev/agents/build-fast-planner.md, docs/reference/dev/build-fast.md -->
- **Speedrun** `T1` -- Interactive loop for small low-risk changes delegated to a general sub-agent
  <!-- id: plugin-dev.speedrun | tier: T1 | audience: developer | evidence: plugins/dev/skills/speedrun/SKILL.md, plugins/dev/agents/speedrun-builder.md -->
- **Blueprint** `T1` -- Guided project charter and PRD creation through parent-owned interviews with durable artifact resume
  <!-- id: plugin-dev.blueprint | tier: T1 | audience: developer | evidence: plugins/dev/skills/blueprint/SKILL.md, plugins/dev/agents/blueprint-wizard.md, plugins/dev/agents/charter-interviewer.md, docs/reference/dev/blueprint.md -->
  - Blueprint Audit `T1` -- Audits PRD against implementation status and guides lifecycle decisions
    <!-- id: plugin-dev.blueprint.audit | tier: T1 | audience: developer | evidence: plugins/dev/skills/blueprint-audit/SKILL.md, plugins/dev/agents/blueprint-auditor.md, docs/reference/dev/blueprint-audit.md -->
  - Blueprint Archive `T1` -- Archives completed PRD with associated features and closure summary
    <!-- id: plugin-dev.blueprint.archive | tier: T1 | audience: developer | evidence: plugins/dev/skills/blueprint-archive/SKILL.md, docs/reference/dev/blueprint-archive.md -->
- **Phase Plan** `T1` -- Decomposes completed PRD or oversized requirements into durable delivery phases
  <!-- id: plugin-dev.phase-plan | tier: T1 | audience: developer | evidence: plugins/dev/skills/phase-plan/SKILL.md, plugins/dev/agents/phase-planner.md, docs/reference/dev/phase-plan.md -->
- **Bootstrap** `T1` -- Scaffolds a greenfield project with parent-owned interviews and bounded plan-revise-apply actions
  <!-- id: plugin-dev.bootstrap | tier: T1 | audience: developer | evidence: plugins/dev/skills/bootstrap/SKILL.md, plugins/dev/agents/bootstrap-scaffolder.md -->
- **PR Review** `T1` -- Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication
  <!-- id: plugin-dev.pr-review | tier: T1 | audience: developer | evidence: plugins/dev/skills/pr-review/SKILL.md, docs/reference/dev/pr-review.md -->
  - PR Sub-Reviewer `T1` -- Reviews individual file segments for issues
    <!-- id: plugin-dev.pr-review.sub-reviewer | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-sub-reviewer.md -->
  - PR Review Splitter `T1` -- Splits large diffs into reviewable segments for parallel sub-review
    <!-- id: plugin-dev.pr-review.splitter | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-review-splitter.md -->
  - PR Review Synthesizer `T1` -- Synthesizes sub-review findings into cohesive review
    <!-- id: plugin-dev.pr-review.synthesizer | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-review-synthesizer.md -->
  - PR Review Reporter `T1` -- Formats and posts final review to GitHub
    <!-- id: plugin-dev.pr-review.reporter | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-review-reporter.md -->
  - PR Comment Deduplicator `T1` -- Removes duplicate findings across sub-reviews
    <!-- id: plugin-dev.pr-review.deduplicator | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-comment-deduplicator.md -->
  - PR Comment Poster `T1` -- Posts individual review comments to GitHub PRs
    <!-- id: plugin-dev.pr-review.poster | tier: T1 | audience: agent | evidence: plugins/dev/agents/pr-comment-poster.md -->
- **PR Visual** `T1` -- Transforms PR diffs into Mermaid diagrams for visual code review
  <!-- id: plugin-dev.pr-visual | tier: T1 | audience: developer | evidence: plugins/dev/skills/pr-visual/SKILL.md, plugins/dev/agents/pr-visualizer.md, docs/reference/dev/pr-visual.md -->
- **PR Walkthrough** `T1` -- Generates evidence-grounded markdown walkthrough for a pull request
  <!-- id: plugin-dev.pr-walkthrough | tier: T1 | audience: developer | evidence: plugins/dev/skills/pr-walkthrough/SKILL.md, plugins/dev/agents/pr-walkthrough-reporter.md, docs/reference/dev/pr-walkthrough.md -->
- **PR Stack** `T1` -- Plans and executes splitting a large PR into a reviewable stacked PR sequence
  <!-- id: plugin-dev.pr-stack | tier: T1 | audience: developer | evidence: plugins/dev/skills/pr-stack/SKILL.md, docs/reference/dev/pr-stack.md -->
- **Address PR Feedback** `T1` -- Unified workflow to collect, triage, and fix review comments in a single command
  <!-- id: plugin-dev.address-pr-feedback | tier: T1 | audience: developer | evidence: plugins/dev/skills/address-pr-feedback/SKILL.md, plugins/dev/agents/pr-feedback-collector.md, docs/reference/dev/address-pr-feedback.md -->
- **Publish Artifact** `T1` -- Publishes rp1 artifacts as idempotent PR or issue comments that update in place
  <!-- id: plugin-dev.publish-artifact | tier: T1 | audience: developer | evidence: plugins/dev/skills/publish-artifact/SKILL.md, docs/reference/dev/publish-artifact.md -->
- **Code Investigate** `T1` -- Systematic bug investigation through evidence-based analysis and hypothesis testing without permanent code changes
  <!-- id: plugin-dev.code-investigate | tier: T1 | audience: developer | evidence: plugins/dev/skills/code-investigate/SKILL.md, plugins/dev/agents/bug-investigator.md, docs/reference/dev/code-investigate.md -->
- **Validate Hypothesis** `T1` -- Validates design hypotheses via code experiments, codebase analysis, and external research with support for ad-hoc test scenarios
  <!-- id: plugin-dev.validate-hypothesis | tier: T1 | audience: developer | evidence: plugins/dev/skills/validate-hypothesis/SKILL.md, plugins/dev/agents/hypothesis-tester.md, docs/reference/dev/validate-hypothesis.md -->
- **Tech Debt Collector** `T1` -- Evidence-gated tech debt and bloat detection with materiality ranking and refutation validation
  <!-- id: plugin-dev.tech-debt-collector | tier: T1 | audience: developer | evidence: plugins/dev/skills/tech-debt-collector/SKILL.md, plugins/dev/agents/bloat-scout.md, docs/reference/dev/tech-debt-collector.md -->
- **Code Audit** `T1` -- Analyzes code for pattern consistency, maintainability, duplication, comment quality, and documentation drift
  <!-- id: plugin-dev.code-audit | tier: T1 | audience: developer | evidence: plugins/dev/skills/code-audit/SKILL.md, plugins/dev/agents/code-auditor.md, docs/reference/dev/code-audit.md -->
- **Code Check** `T1` -- Fast code hygiene validation running lints, formatters, tests, and coverage in a quick feedback loop
  <!-- id: plugin-dev.code-check | tier: T1 | audience: developer | evidence: plugins/dev/skills/code-check/SKILL.md, plugins/dev/agents/code-checker.md, docs/reference/dev/code-check.md -->
- **Code Clean Comments** `T1` -- Systematically removes unnecessary comments by first resolving scope into a durable change manifest
  <!-- id: plugin-dev.code-clean-comments | tier: T1 | audience: developer | evidence: plugins/dev/skills/code-clean-comments/SKILL.md, plugins/dev/agents/comment-cleaner.md, docs/reference/dev/code-clean-comments.md -->
- **Feature Lifecycle** `T1` -- Archive, edit, and unarchive feature documentation with validation and propagation
  <!-- id: plugin-dev.feature-lifecycle | tier: T1 | audience: developer | evidence: plugins/dev/skills/feature-archive/SKILL.md, plugins/dev/skills/feature-edit/SKILL.md, plugins/dev/skills/feature-unarchive/SKILL.md, plugins/dev/agents/feature-archiver.md, plugins/dev/agents/feature-editor.md -->
- **Arcade Collab** `T2` -- Structured guidance for agents to read, classify, and act on user feedback from the Arcade
  <!-- id: plugin-dev.arcade-collab | tier: T2 | audience: agent | evidence: plugins/dev/skills/arcade-collab/SKILL.md -->

## Plugin System: Utils

- **Build Prompt** `T1` -- Builds governed prompts through the six-stage prompt-writer pipeline with budgeted governance
  <!-- id: plugin-utils.build-prompt | tier: T1 | audience: contributor | evidence: plugins/utils/skills/build-prompt/SKILL.md -->
- **Tersify Prompt** `T1` -- Rewrites agent-instruction prompts to be maximally terse while preserving full intent
  <!-- id: plugin-utils.tersify-prompt | tier: T1 | audience: contributor | evidence: plugins/utils/skills/tersify-prompt/SKILL.md, plugins/utils/agents/prompt-tersifier.md -->
- **Prompt Eval Builder** `T2` -- Extracts eval assertions and generates test invocation prompts from command/agent specs
  <!-- id: plugin-utils.prompt-eval-builder | tier: T2 | audience: contributor | evidence: plugins/utils/skills/prompt-eval-builder/SKILL.md -->
- **Tester** `T3` -- Test command template for verifying argument passing and skill invocation
  <!-- id: plugin-utils.tester | tier: T3 | audience: contributor | evidence: plugins/utils/skills/tester/SKILL.md -->

## Plugin System: Shared

- **Anti-Loop Guard** `T2` -- Detects and breaks agent loops that repeat failed actions
  <!-- id: plugin-shared.anti-loop | tier: T2 | audience: agent | evidence: plugins/shared/anti-loop.md -->
- **Engineering Discipline** `T2` -- Shared engineering discipline rules applied across all agents
  <!-- id: plugin-shared.engineering-discipline | tier: T2 | audience: agent | evidence: plugins/shared/engineering-discipline.md -->
- **KB Progressive Loading** `T2` -- Shared instructions for progressive KB file loading based on task type
  <!-- id: plugin-shared.kb-progressive-loading | tier: T2 | audience: agent | evidence: plugins/shared/kb-progressive-loading.md -->
- **Output Discipline** `T2` -- Output formatting rules shared across agents
  <!-- id: plugin-shared.output-discipline | tier: T2 | audience: agent | evidence: plugins/shared/output-discipline.md -->
- **Parent-Owned Interview** `T1` -- Shared pattern for parent-agent-owned user interviews ensuring control stays with the orchestrator
  <!-- id: plugin-shared.parent-owned-interview | tier: T1 | audience: agent | evidence: plugins/shared/parent-owned-interview.md -->

## Teach-Me

- **Lesson Renderer** `T1` -- Assembles lesson data models into self-contained interactive HTML lessons with Mermaid diagram pre-rendering
  <!-- id: teach-me.renderer | tier: T1 | audience: developer | evidence: cli/src/teach-me/assemble.ts, cli/src/teach-me/inline.ts, cli/src/teach-me/prerender/, cli/src/commands/teach-me/ -->
  - Lesson Schema `T1` -- JSON schema for structured lesson data models with sections, quizzes, and code examples
    <!-- id: teach-me.renderer.schema | tier: T1 | audience: developer | evidence: cli/src/teach-me/schema/ -->
  - Widget System `T2` -- Embeddable interactive widgets within lessons
    <!-- id: teach-me.renderer.widgets | tier: T2 | audience: developer | evidence: cli/src/teach-me/widgets/ -->
  - Quality Gate `T2` -- Validates lesson content meets quality thresholds before rendering
    <!-- id: teach-me.renderer.gate | tier: T2 | audience: developer | evidence: cli/src/teach-me/gate/ -->
- **Teach-Me Skill** `T1` -- Turns a "teach me X" request into an interactive HTML lesson rendered Arcade-first
  <!-- id: teach-me.skill | tier: T1 | audience: developer | evidence: plugins/base/skills/teach-me/SKILL.md -->

## Native App

- **Electrobun Desktop App** `T3` -- Cross-platform desktop wrapper for the Arcade web UI using Electrobun
  <!-- id: native-app.electrobun | tier: T3 | audience: developer | evidence: native-app/electrobun.config.ts, native-app/package.json, native-app/src/ -->

## Eval Framework

- **Promptfoo Integration** `T1` -- Behavioral evaluation suites for agent skills using promptfoo with custom assertions and model usage tracking
  <!-- id: eval-framework.promptfoo | tier: T1 | audience: contributor | evidence: evals/package.json, evals/src/index.ts, evals/src/model-usage.ts -->
  - Build Eval Suite `T1` -- Evaluates the /build workflow agent chain
    <!-- id: eval-framework.promptfoo.build | tier: T1 | audience: contributor | evidence: evals/suites/rp1-dev/build/ -->
  - Build-Fast Eval Suite `T1` -- Evaluates the /build-fast workflow
    <!-- id: eval-framework.promptfoo.build-fast | tier: T1 | audience: contributor | evidence: evals/suites/rp1-dev/build-fast/ -->
  - Speedrun Eval Suite `T1` -- Evaluates the /speedrun workflow
    <!-- id: eval-framework.promptfoo.speedrun | tier: T1 | audience: contributor | evidence: evals/suites/rp1-dev/speedrun/ -->
  - Create-Prompt Eval Suite `T1` -- Evaluates the prompt creation pipeline
    <!-- id: eval-framework.promptfoo.create-prompt | tier: T1 | audience: contributor | evidence: evals/suites/rp1-base/create-prompt/ -->
  - Shared Assertions `T1` -- Reusable assertion library for eval suites
    <!-- id: eval-framework.promptfoo.shared-assertions | tier: T1 | audience: contributor | evidence: evals/suites/shared/assertions/, evals/suites/shared/extension.ts -->
  - Attestation Verification `T1` -- Verifies eval suite attestation hashes match built artifacts
    <!-- id: eval-framework.promptfoo.attestation | tier: T1 | audience: contributor | evidence: evals/src/attestation/, evals/attestation.json -->
- **Docker Eval Runner** `T2` -- Containerized eval execution environment with certificate management
  <!-- id: eval-framework.docker | tier: T2 | audience: contributor | evidence: docker/Dockerfile, docker/eval-run.sh -->

## CI/CD and Release

- **GitHub Actions CI** `T1` -- Multi-job CI pipeline with lint, typecheck, tests, docs link check, catalog verification, plugin build, and attestation checks
  <!-- id: cicd.github-actions | tier: T1 | audience: contributor | evidence: .github/workflows/ci.yml -->
  - Test Isolation Boundary `T1` -- Docker-based disposable filesystem boundary for safe test execution
    <!-- id: cicd.github-actions.test-isolation | tier: T1 | audience: contributor | evidence: .github/test-isolation.Dockerfile -->
- **Release Please** `T1` -- Automated semantic versioning and changelog generation with post-release artifact upload and Cloudflare Pages deployment
  <!-- id: cicd.release-please | tier: T1 | audience: contributor | evidence: .github/workflows/release-please.yml, release-please-config.json, .release-please-manifest.json -->
- **GoReleaser** `T1` -- Cross-platform binary builds (darwin-arm64/x64, linux-arm64/x64, windows-x64) via Bun compile with GitHub Release publishing
  <!-- id: cicd.goreleaser | tier: T1 | audience: contributor | evidence: .goreleaser.yml, .github/workflows/goreleaser.yml -->
- **PR Title Validation** `T2` -- Enforces Conventional Commits format on PR titles
  <!-- id: cicd.pr-title | tier: T2 | audience: contributor | evidence: .github/workflows/pr-title.yml -->
- **Lighthouse CI** `T2` -- Post-release performance auditing of the documentation site
  <!-- id: cicd.lighthouse | tier: T2 | audience: contributor | evidence: lighthouserc.json, .github/workflows/release-please.yml -->
- **Pre-Commit Hooks** `T2` -- Lefthook-based pre-commit checks for catalog freshness and commit conventions
  <!-- id: cicd.lefthook | tier: T2 | audience: contributor | evidence: lefthook.yml, .lefthook/ -->
- **Docker Dev Environment** `T2` -- Development container setup for consistent build environments
  <!-- id: cicd.docker-dev | tier: T2 | audience: contributor | evidence: docker/setup-dev.sh, docker/test-install.sh -->
- **Beta Release Pipeline** `T2` -- Separate release channel for pre-release builds
  <!-- id: cicd.beta-release | tier: T2 | audience: contributor | evidence: scripts/beta-release.sh, .goreleaser-beta.yml -->

## Documentation Site

- **MkDocs Material Site** `T1` -- Public documentation site built with MkDocs Material and deployed to Cloudflare Pages
  <!-- id: docs-site.mkdocs | tier: T1 | audience: developer | evidence: mkdocs.yml, docs/index.md, site/ -->
  - Getting Started Guides `T1` -- Installation, first workflow, and directory structure documentation
    <!-- id: docs-site.mkdocs.getting-started | tier: T1 | audience: developer | evidence: docs/getting-started/ -->
  - Workflow Guides `T1` -- In-depth guides for feature development, bug investigation, PR review, CI/CD integration, and team scaling
    <!-- id: docs-site.mkdocs.guides | tier: T1 | audience: developer | evidence: docs/guides/ -->
  - CLI Reference `T1` -- Command reference for init, install, update, verify, migrate, settings, and uninstall
    <!-- id: docs-site.mkdocs.cli-reference | tier: T1 | audience: developer | evidence: docs/reference/cli/ -->
  - Base Plugin Reference `T1` -- Reference docs for all base plugin skills
    <!-- id: docs-site.mkdocs.base-reference | tier: T1 | audience: developer | evidence: docs/reference/base/ -->
  - Dev Plugin Reference `T1` -- Reference docs for all dev plugin skills
    <!-- id: docs-site.mkdocs.dev-reference | tier: T1 | audience: developer | evidence: docs/reference/dev/ -->
  - Platform Guides `T1` -- Platform-specific documentation for Antigravity, Codex, and Copilot
    <!-- id: docs-site.mkdocs.platforms | tier: T1 | audience: developer | evidence: docs/reference/platforms/ -->
  - Arcade Documentation `T1` -- Dashboard, artifact viewer, annotations, keyboard shortcuts, and settings docs
    <!-- id: docs-site.mkdocs.arcade | tier: T1 | audience: developer | evidence: docs/arcade/ -->
  - Configuration Reference `T1` -- settings.toml schema and configuration options
    <!-- id: docs-site.mkdocs.configuration | tier: T1 | audience: developer | evidence: docs/reference/configuration.md -->
  - Concepts `T2` -- Conceptual guides on constitutional prompting and knowledge-aware agents
    <!-- id: docs-site.mkdocs.concepts | tier: T2 | audience: developer | evidence: docs/concepts/ -->
  - Readiness Assessment `T2` -- Framework for evaluating team readiness to adopt rp1
    <!-- id: docs-site.mkdocs.readiness | tier: T2 | audience: developer | evidence: docs/readiness/ -->

## Surfaces Not Analyzed

None. All anchor classes were detected: CLI command registrations, build pipeline targets, agent-tools subcommands, web UI routes and components, plugin skill/agent manifests, eval suites, CI/CD workflows, documentation sections, and native app configuration.

## Coverage Summary

| Tier | Count | Meaning |
|------|-------|---------|
| T1 | 131 | Documented and tested |
| T2 | 31 | Documented or tested |
| T3 | 4 | Referenced but undocumented/untested |
| T4 | 0 | Investigation candidates |

## Related KB Links

- **System topology**: See [architecture.md](architecture.md)
- **Modules and projects**: See [modules.md](modules.md)
- **Implementation details**: See [patterns.md](patterns.md)
- **Terminology**: See [concept_map.md](concept_map.md)
