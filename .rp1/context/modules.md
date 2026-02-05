# Module & Component Breakdown

**Project**: rp1 Plugin System
**Analysis Date**: 2026-02-05
**Total Components**: 100+ (32 commands, 36 agents, 6 skills, 27+ CLI modules)

## Plugin Modules

### plugins/base
**Purpose**: Foundation plugin for knowledge management, documentation, strategy, and security
**Components**: 9 commands, 12 agents, 6 skills

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

**Skills**:
| Skill | Purpose |
|-------|---------|
| maestro | Skill creation and updates |
| mermaid | Diagram creation and validation |
| markdown-preview | HTML preview generation |
| knowledge-base-templates | KB document templates |
| code-comments | Comment extraction and management |
| work-status | Workflow progress reporting |

### plugins/dev
**Purpose**: Development workflow automation for features, code quality, and PR management
**Components**: 15 commands, 24 agents, 1 skill
**Dependency**: Requires rp1-base >= 2.0.0

**Feature Workflow Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| build | Orchestrator (10+ agents) | End-to-end 6-step workflow |
| build-fast | build-fast-planner + executor | Quick iteration development |
| blueprint | blueprint-wizard | Charter and PRD creation |
| bootstrap | bootstrap-scaffolder | Greenfield project scaffolding |
| feature-edit | feature-editor | Mid-stream change propagation |
| feature-archive | feature-archiver | Archive completed features |

**Code Quality Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| code-check | code-checker | Fast hygiene validation |
| code-audit | code-auditor | Pattern consistency analysis |
| code-investigate | bug-investigator | Evidence-based bug investigation |
| code-clean-comments | comment-cleaner | Comment removal |

**PR Review Commands**:
| Command | Agent | Purpose |
|---------|-------|---------|
| pr-review | Orchestrator (4 agents) | Map-reduce PR review |
| pr-visual | pr-visualizer | Diff visualization |
| address-pr-feedback | pr-feedback-collector | Unified collect, triage, fix |

### plugins/utils
**Purpose**: Utility plugin for prompt optimization and eval generation
**Components**: 2 commands, 3 agents, 2 skills

| Command | Agent | Purpose |
|---------|-------|---------|
| tersify-prompt | prompt-tersifier | Prompt compression |
| build-prompt-evals | prompt-eval-extractor | Eval assertion generation |

## CLI Modules

### cli/src/commands/
**Purpose**: CLI entry point with Commander.js

| Module | Purpose |
|--------|---------|
| main.ts | CLI entry point with lazy loading |
| init.ts | Initialize rp1 in a project |
| install/index.ts | Install plugins to OpenCode/Claude Code |
| view.ts | Launch web-based documentation viewer |
| self-update.ts | Update CLI to latest version |

### cli/src/init/
**Purpose**: Project initialization with 11-step workflow

| Module | Purpose |
|--------|---------|
| index.ts | Init orchestration with TTY-aware interactivity |
| git-root.ts | Git repository detection |
| tool-detector.ts | Detect agentic tools (Claude Code, OpenCode) |
| context-detector.ts | Classify project as greenfield or brownfield |
| ui/*.tsx | React/Ink UI components for wizard |

### cli/src/install/
**Purpose**: Plugin installation logic with fp-ts patterns

| Module | Purpose |
|--------|---------|
| installer.ts | Copy artifacts to target directories |
| manifest.ts | Plugin manifest parsing |
| claudecode/index.ts | Claude Code specific installation |

### cli/src/agent-tools/
**Purpose**: Framework for AI agent tools with registry

| Module | Purpose |
|--------|---------|
| index.ts | Tool registry (register, get, list) |
| git.ts | Shared git utilities with GitContext pattern |
| worktree/ | Git worktree management |
| github-pr/ | GitHub PR operations |
| mmd-validate/ | Mermaid validation tool |
| work/ | Workflow status tracking |
| comment-extract/ | Comment extraction from source files |
| transform-args/ | Argument transformation for commands |

### cli/web-ui/
**Purpose**: React-based documentation viewer with V2 status dashboard

| Component | Purpose |
|-----------|---------|
| src/server.ts | Server factory with WebSocket |
| src/server/websocket.ts | WebSocket hub for live reload |
| src/server/routes/v2-api.ts | V2 API endpoints for runs |
| src/pages/v2/*.tsx | V2 dashboard pages |
| src/components/MarkdownViewer/ | Markdown rendering with Mermaid |

## Evaluation Modules

### evals/
**Purpose**: Promptfoo-based evaluation system

| Component | Purpose |
|-----------|---------|
| providers/claude-with-tools.ts | Custom provider with tool call capture |
| src/attestation/ | Content-addressable tracking system |
| suites/shared/assertions/ | Reusable test assertions |

## Module Dependencies

```mermaid
graph TD
    subgraph "Plugin Dependencies"
        Dev[rp1-dev] -->|depends on| Base[rp1-base]
    end

    subgraph "KB Generation"
        KBBuild[knowledge-build] --> Spatial[kb-spatial-analyzer]
        KBBuild --> Concept[kb-concept-extractor]
        KBBuild --> Arch[kb-architecture-mapper]
        KBBuild --> Module[kb-module-analyzer]
        KBBuild --> Pattern[kb-pattern-extractor]
    end

    subgraph "Build Workflow"
        Build[/build] --> Builder[task-builder]
        Build --> Reviewer[task-reviewer]
        Build --> Verifier[feature-verifier]
    end

    subgraph "CLI Modules"
        Main[main.ts] --> Init[init/]
        Main --> Install[install/]
        Main -.->|lazy| AgentTools[agent-tools/]
        AgentTools --> Worktree[worktree/]
        AgentTools --> Git[git.ts]
    end
```

## Module Metrics

| Module | Commands | Agents | Skills | Lines (est.) |
|--------|----------|--------|--------|--------------|
| plugins/base | 9 | 12 | 6 | ~5,500 |
| plugins/dev | 15 | 24 | 1 | ~9,200 |
| plugins/utils | 2 | 3 | 2 | ~1,200 |
| cli/src | 8 | - | - | ~3,000 |
| cli/src/init | - | - | - | ~2,500 |
| cli/src/install | - | - | - | ~1,200 |
| cli/src/agent-tools | - | - | - | ~1,800 |
| cli/web-ui | - | - | - | ~2,800 |
| evals | - | - | - | ~1,500 |

## Cross-Module Patterns

### Command-Agent Delegation
Commands are thin wrappers (~50-100 lines) that delegate to constitutional agents (~200-350 lines) via Task tool.

### Map-Reduce Orchestration
- KB: spatial analyzer -> 4 parallel agents -> orchestrator merge
- PR: splitter -> N sub-reviewers -> synthesizer -> reporter

### Builder-Reviewer Loop
Feature build uses paired agents: task-builder implements, task-reviewer verifies with retry on failure.

### GitContext Safety Pattern
All git mutations use GitContext.repoRoot to ensure operations target main repo, not worktree.

### fp-ts Functional Error Handling
CLI modules use Either/TaskEither for type-safe error handling with pipe() composition.

### Progressive KB Loading
Agents load KB selectively: code review -> patterns.md, bug -> architecture.md + modules.md.

## Cross-References
- **Domain Concepts**: See [concept_map.md](concept_map.md)
- **Architecture**: See [architecture.md](architecture.md)
- **Implementation Patterns**: See [patterns.md](patterns.md)
