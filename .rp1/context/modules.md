# Module & Component Breakdown

**Project**: rp1 Plugin System
**Analysis Date**: 2025-12-24
**Total Components**: 90+ (29 commands, 32 agents, 5 skills, 24+ CLI modules)

## Plugin Modules

### plugins/base
**Purpose**: Foundation plugin for knowledge management, documentation, strategy, and security
**Components**: 9 commands, 13 agents, 5 skills

**Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| knowledge-build | Orchestrator (5 agents) | Parallel KB generation |
| knowledge-load | None (direct) | Load KB context (deprecated) |
| deep-research | research-explorer + reporter | Autonomous research with reports |
| strategize | strategic-advisor | Holistic system analysis |
| analyse-security | security-validator | Security validation |
| project-birds-eye-view | project-documenter | Project overview generation |
| write-content | None (interactive) | Technical document creation |
| fix-mermaid | mermaid-fixer | Diagram validation and repair |
| self-update | None (direct) | Update rp1 to latest version |

**Agents**:
| Agent | Purpose |
|-------|---------|
| kb-spatial-analyzer | File scanning and categorization (0-5 ranking) |
| kb-index-builder | Index.md generation (deprecated - orchestrator-owned) |
| kb-concept-extractor | Domain concept extraction |
| kb-architecture-mapper | Architecture pattern mapping |
| kb-module-analyzer | Module dependency analysis |
| kb-pattern-extractor | Implementation pattern extraction |
| research-explorer | Deep research exploration |
| research-reporter | Structured research report generation |
| strategic-advisor | Multi-dimensional trade-off analysis |
| security-validator | Comprehensive security auditing |
| project-documenter | 12-section project documentation |
| mermaid-fixer | Mermaid diagram validation and repair |

**Skills**:
| Skill | Purpose |
|-------|---------|
| maestro | Skill creation and updates |
| mermaid | Diagram creation and validation |
| markdown-preview | HTML preview generation |
| knowledge-base-templates | KB document templates |
| code-comments | Comment extraction and management |

### plugins/dev
**Purpose**: Development workflow automation for features, code quality, and PR management
**Components**: 19 commands, 18 agents
**Dependency**: Requires rp1-base >= 2.0.0

**Feature Workflow Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| blueprint | blueprint-wizard | Charter and PRD creation |
| feature-requirements | None (interactive) | Requirements gathering |
| feature-design | None (direct) | Technical design generation |
| feature-tasks | feature-tasker | Task breakdown |
| feature-build | task-builder + reviewer | Implementation from tasks |
| feature-verify | code-checker + verifier | Acceptance validation |
| feature-edit | feature-editor | Mid-stream change propagation |
| feature-archive | feature-archiver | Archive completed features |
| feature-unarchive | feature-archiver | Restore archived features |
| validate-hypothesis | hypothesis-tester | Design assumption testing |

**Code Quality Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| code-check | code-checker | Fast hygiene validation |
| code-audit | code-auditor | Pattern consistency analysis |
| code-investigate | bug-investigator | Evidence-based bug investigation |
| code-clean-comments | comment-cleaner | Comment removal |
| code-quick-build | None (direct) | Quick fixes and prototypes |

**PR Review Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| pr-review | Orchestrator (4 agents) | Map-reduce PR review |
| pr-visual | pr-visualizer | Diff visualization |
| pr-feedback-collect | pr-feedback-collector | GitHub comment collection |
| pr-feedback-fix | None (direct) | Review comment resolution |

### plugins/utils
**Purpose**: Utility plugin for prompt optimization
**Components**: 1 command, 1 agent

| Command | Agent | Purpose |
|---------|-------|---------|
| tersify-prompt | prompt-tersifier | Prompt compression |

## CLI Modules

### cli/src/commands/
**Purpose**: CLI entry point with Commander.js

| Module | Purpose |
|--------|---------|
| main.ts | CLI entry point with lazy loading for agent-tools |
| init.ts | Initialize rp1 in a project |
| install.ts | Install plugins to OpenCode/Claude Code |
| view.ts | Launch web-based documentation viewer |
| self-update.ts | Update CLI to latest version |
| check-update.ts | Check for available updates |

### cli/src/init/
**Purpose**: Project initialization with 12-step workflow

| Module | Purpose |
|--------|---------|
| index.ts | Init orchestration with TTY-aware interactivity |
| git-root.ts | Git repository detection |
| tool-detector.ts | Detect agentic tools (Claude Code, OpenCode) |
| comment-fence.ts | Fenced content injection into CLAUDE.md |
| progress.ts | Progress indication |
| templates/*.ts | Template generation for AGENTS.md, CLAUDE.md |
| steps/*.ts | Modular init steps (verification, plugin-installation, health-check) |

### cli/src/install/
**Purpose**: Plugin installation logic with fp-ts patterns

| Module | Purpose |
|--------|---------|
| index.ts | Barrel exports |
| installer.ts | Copy artifacts to target directories with backup |
| manifest.ts | Plugin manifest parsing and discovery |
| verifier.ts | Installation verification |
| config.ts | Installation configuration |
| prerequisites.ts | Runtime prerequisite checking |

### cli/src/install/claudecode/
**Purpose**: Claude Code specific installation

| Module | Purpose |
|--------|---------|
| installer.ts | Claude Code plugin installation via native commands |
| prerequisites.ts | Claude Code prerequisite checks |
| command.ts | Claude Code install command |

### cli/src/agent-tools/
**Purpose**: Framework for AI agent tools with registry

| Module | Purpose |
|--------|---------|
| index.ts | Tool registry (register, get, list) |
| command.ts | Commander.js integration |
| input.ts | Input handling (file/stdin) |
| output.ts | JSON output formatting |
| models.ts | Type definitions |
| mmd-validate/ | Mermaid validation tool |

### cli/src/agent-tools/mmd-validate/
**Purpose**: Mermaid diagram validation tool

| Module | Purpose |
|--------|---------|
| index.ts | Tool entry point |
| validator.ts | Validation orchestrator with browser-based validation |
| extractor.ts | Mermaid block extraction from markdown |
| browser.ts | Puppeteer browser management |
| models.ts | Validation result types |

### cli/web-ui/
**Purpose**: React-based documentation viewer with Mermaid support

| Component | Purpose |
|-----------|---------|
| src/main.tsx | React entry point |
| src/server.ts | Server factory with WebSocket and file watching |
| src/app/App.tsx | Main app with providers |
| src/server/http.ts | Bun HTTP server |
| src/server/websocket.ts | WebSocket hub for live reload |
| src/components/MarkdownViewer/ | Markdown rendering with Mermaid |
| src/components/FileTree/ | Directory navigation |
| src/providers/*.tsx | Theme, WebSocket, DiagramFullscreen providers |
| src/hooks/*.ts | Custom hooks (useFileTree, useFileContent) |

### cli/shared/
**Purpose**: Shared utilities including fp-ts helpers

| Module | Purpose |
|--------|---------|
| index.ts | Barrel export |
| errors.ts | CLIError types and formatters |
| fp.ts | fp-ts re-exports (Either, TaskEither, pipe) |
| logger.ts | Logger with LogLevel enum |
| prompts.ts | Interactive prompts |
| config.ts | Configuration management |

### packages/catppuccin-mermaid/
**Purpose**: Catppuccin color theme library for Mermaid diagrams

| Module | Purpose |
|--------|---------|
| src/index.ts | Theme exports |
| src/theme.ts | Theme generation |
| src/palette.ts | Color palette definitions |
| src/flavors/*.ts | Latte, frappe, macchiato, mocha flavors |
| src/utils/contrast.ts | WCAG contrast utilities |

## Module Dependencies

```mermaid
graph TD
    subgraph "Plugin Dependencies"
        Dev[rp1-dev] -->|depends on| Base[rp1-base]
        DevAgents[Dev Agents] -.->|may invoke| BaseCmds[Base Commands]
    end

    subgraph "KB Generation"
        KBBuild[knowledge-build] --> Spatial[kb-spatial-analyzer]
        KBBuild --> Concept[kb-concept-extractor]
        KBBuild --> Arch[kb-architecture-mapper]
        KBBuild --> Module[kb-module-analyzer]
        KBBuild --> Pattern[kb-pattern-extractor]
    end

    subgraph "PR Review"
        PRReview[pr-review] --> Splitter[pr-review-splitter]
        PRReview --> SubReviewer[pr-sub-reviewer]
        PRReview --> Synth[pr-review-synthesizer]
        PRReview --> Reporter[pr-review-reporter]
    end

    subgraph "Feature Build"
        FBuild[feature-build] --> Builder[task-builder]
        FBuild --> Reviewer[task-reviewer]
    end

    subgraph "CLI Modules"
        Main[main.ts] --> Init[init/]
        Main --> Install[install/]
        Main -.->|lazy| AgentTools[agent-tools/]
        AgentTools --> MmdValidate[mmd-validate/]
    end
```

## Module Metrics

| Module | Commands | Agents | Skills | Lines (est.) |
|--------|----------|--------|--------|--------------|
| plugins/base | 9 | 13 | 5 | ~5,000 |
| plugins/dev | 19 | 18 | 0 | ~7,000 |
| plugins/utils | 1 | 1 | 0 | ~300 |
| cli/src | 6 | - | - | ~3,000 |
| cli/src/init | - | - | - | ~1,500 |
| cli/src/install | - | - | - | ~1,200 |
| cli/src/agent-tools | - | - | - | ~600 |
| cli/web-ui | - | - | - | ~2,500 |
| cli/shared | - | - | - | ~500 |
| packages/catppuccin-mermaid | - | - | - | ~400 |

## Cross-Module Patterns

### Command-Agent Delegation
Commands are thin wrappers (~50-100 lines) that delegate to constitutional agents (~200-350 lines) via Task tool. Separation enables reusability, testability, and independent evolution.

### Map-Reduce Orchestration
Both KB generation and PR review use map-reduce pattern:
- KB: spatial analyzer -> 4 parallel agents -> orchestrator merge
- PR: splitter -> N sub-reviewers -> synthesizer -> reporter

### Builder-Reviewer Loop
Feature build uses paired agents:
- task-builder implements changes
- task-reviewer verifies (SUCCESS/FAILURE with feedback)
- Retry on failure with feedback (max 3 attempts)

### fp-ts Functional Error Handling
CLI modules use Either/TaskEither for type-safe error handling:
- `E.left()` for errors, `E.right()` for success
- `pipe()` for function composition
- `TE.tryCatch()` wraps async operations

### Lazy Loading
Heavy dependencies (puppeteer) are lazy-loaded:
- main.ts lazy-loads agent-tools/command.ts
- Reduces CLI startup time for non-agent-tools commands

### Progressive KB Loading
Agents load KB selectively based on task type:
- Code review -> patterns.md
- Bug investigation -> architecture.md, modules.md
- Feature implementation -> modules.md, patterns.md
- Strategic analysis -> ALL files

## Cross-References
- **Domain Concepts**: See [concept_map.md](concept_map.md)
- **Architecture**: See [architecture.md](architecture.md)
- **Implementation Patterns**: See [patterns.md](patterns.md)
