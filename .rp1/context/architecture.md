# System Architecture

**Project**: rp1 Plugin System
**Architecture Pattern**: Plugin Architecture with Map-Reduce Orchestration
**Last Updated**: 2025-12-27

## High-Level Architecture

```mermaid
graph TB
    subgraph "User Interfaces"
        CC[Claude Code CLI]
        OC[OpenCode]
        CLI[rp1 CLI]
    end

    subgraph "Plugin System"
        Base[rp1-base]
        Dev[rp1-dev]
        Utils[rp1-utils]
        Dev -->|depends on| Base
    end

    subgraph "Base Plugin"
        BaseCmd[Commands]
        BaseAgents[Agents]
        Skills[Skills]
        BaseCmd --> BaseAgents
        BaseAgents --> Skills
    end

    subgraph "Dev Plugin"
        DevCmd[Commands]
        DevAgents[Agents]
        DevCmd --> DevAgents
        DevAgents -.->|cross-plugin| BaseCmd
    end

    subgraph "CLI"
        CLIMain[main.ts]
        ToolRegistry[Tool Registry]
        WebUI[web-ui React/Vite]
        AgentTools[agent-tools]
    end

    subgraph "Knowledge Base"
        KB[.rp1/context/]
        State[state.json]
    end

    subgraph "Build Pipeline"
        GHActions[GitHub Actions]
        RP[release-please]
        GR[GoReleaser]
        Bun[Bun Compiler]
        GHActions --> RP
        RP -->|tag| GR
        GR --> Bun
    end

    subgraph "Distribution"
        Marketplace[Plugin Marketplace]
        Tarball[OpenCode Tarball]
        Homebrew[Homebrew Cask]
        Scoop[Scoop Bucket]
        Curl[curl install.sh]
    end

    CC --> Base
    CC --> Dev
    OC --> Tarball
    CLI --> CLIMain

    BaseAgents --> KB
    DevAgents --> KB

    Bun --> Homebrew
    Bun --> Scoop
    Bun --> Curl
    Base --> Marketplace
    Dev --> Marketplace
    RP --> Tarball
```

## Architectural Patterns

### Plugin Architecture
**Evidence**: `plugins/base/.claude-plugin/plugin.json`, `plugins/dev/.claude-plugin/plugin.json`
**Description**: Three independent plugins (base, dev, utils) with explicit dependencies. Dev depends on base for shared capabilities. Each plugin has commands and agents; base owns all skills.

### Constitutional Agent Pattern
**Evidence**: `plugins/*/agents/*.md` structure with YAML frontmatter, parameter tables, anti-loop directives
**Description**: Agents follow structured format: parameter tables, numbered workflow sections, JSON output contracts. Single-pass execution without iteration.

### Command-Agent Delegation
**Evidence**: `plugins/*/commands/*.md` spawn agents via Task tool
**Description**: Commands are thin wrappers (50-100 lines) that parse parameters and spawn constitutional agents (200-350 lines) for workflow execution.

### Map-Reduce Orchestration
**Evidence**: `knowledge-build` spawns parallel agents, `pr-review` uses splitter/sub-reviewers/synthesizer
**Description**: Complex workflows split into units, processed in parallel by specialized agents, then merged by orchestrator. Enables scalability for large codebases.

### Multi-Platform Distribution
**Evidence**: `.goreleaser.yml` (darwin-arm64/x64, linux-arm64/x64, windows-x64), homebrew_casks, scoops config
**Description**: Targets Claude Code (native plugins), OpenCode (tarballs), and standalone CLI via GoReleaser binaries with Homebrew/Scoop distribution.

### Embedded Asset Bundling
**Evidence**: `cli/src/assets/embedded.ts`, goreleaser.yml verification of IS_BUNDLED flag
**Description**: Plugin assets embedded at build time into single executable binary via Bun compiler with compile-time verification.

### Monorepo with Synchronized Versioning
**Evidence**: `release-please-config.json` updates plugins/base, plugins/dev, cli/package.json simultaneously
**Description**: Single repository containing CLI, plugins, and docs with synchronized semantic versioning via release-please.

## Layer Architecture

| Layer | Purpose | Components |
|-------|---------|------------|
| **Interface** | User-facing entry points for AI assistants | `plugins/*/commands/*.md` |
| **Agent** | Autonomous workflow execution | `plugins/*/agents/*.md` |
| **Skill** | Reusable shared capabilities | `plugins/base/skills/*.md` |
| **CLI** | Cross-platform tooling | `cli/src/main.ts`, `cli/web-ui/*` |
| **Config** | Tool registry and configuration | `cli/src/config/supported-tools.*` |
| **Knowledge** | Persistent codebase knowledge | `.rp1/context/*.md` |
| **Build/Release** | CI/CD automation | `.github/workflows/*`, `.goreleaser.yml` |

## Key Workflows

### KB Generation Flow
```mermaid
sequenceDiagram
    participant User
    participant Command as /knowledge-build
    participant Spatial as kb-spatial-analyzer
    participant Agents as 4 Analysis Agents
    participant KB as .rp1/context/

    User->>Command: Invoke
    Command->>Command: Check state.json vs git commit
    Command->>Spatial: Categorize files
    Spatial-->>Command: File lists by category
    Command->>Agents: Spawn in parallel
    Agents-->>Command: JSON results
    Command->>KB: Merge and write files
    Command-->>User: Success report
```

### Feature Build Flow
```mermaid
sequenceDiagram
    participant User
    participant Command as /feature-build
    participant Builder as task-builder
    participant Reviewer as task-reviewer
    participant Files as Source Files

    User->>Command: Invoke with feature-id
    Command->>Command: Parse tasks.md
    loop For each task group
        Command->>Builder: Implement task
        Builder->>Files: Write code
        Builder-->>Command: Implementation summary
        Command->>Reviewer: Verify work
        Reviewer-->>Command: SUCCESS or FAILURE
        alt FAILURE
            Command->>Builder: Retry with feedback
        end
    end
    Command-->>User: Build complete
```

### PR Review Flow
```mermaid
sequenceDiagram
    participant User
    participant PR as /pr-review
    participant Splitter as pr-review-splitter
    participant SubReviewer as pr-sub-reviewer
    participant Synth as pr-review-synthesizer
    participant Reporter as pr-review-reporter

    User->>PR: invoke with PR/branch
    PR->>Splitter: segment diff
    Splitter-->>PR: review units

    par Parallel Review
        PR->>SubReviewer: analyze unit 1
        PR->>SubReviewer: analyze unit 2
        PR->>SubReviewer: analyze unit N
    end

    SubReviewer-->>PR: findings with confidence
    PR->>Synth: synthesize cross-file issues
    Synth-->>PR: fitness judgment
    PR->>Reporter: format report
    Reporter-->>User: markdown review
```

## Integration Points

### GitHub Actions
**Purpose**: CI/CD automation for testing, releases, and binary distribution
- `ci.yml`: lint, typecheck, tests via Bun and `just` task runner
- `release-please.yml`: versioning + OpenCode artifact builds
- `goreleaser.yml`: binary builds triggered by tag

### GoReleaser
**Purpose**: Cross-platform binary builds using Bun compiler
**Targets**: darwin-arm64/x64, linux-arm64/x64, windows-x64
**Distribution**: Homebrew cask (rp1-run/homebrew-tap), Scoop bucket (rp1-run/scoop-bucket)

### Release-Please
**Purpose**: Automated semantic versioning from conventional commits
**Configuration**: Syncs versions across plugins/base, plugins/dev, cli/package.json

### MkDocs Material
**Purpose**: Documentation site at rp1.run
**Features**: Material theme, Mermaid diagrams, search, tabs, code copy

### Claude Code Plugin Marketplace
**Purpose**: Native plugin distribution
**Usage**: `/plugin install rp1-base`, `/plugin install rp1-dev`

### OpenCode
**Purpose**: Alternative AI coding assistant support
**Distribution**: Tarball in GitHub releases with AGENTS.md instruction file

## Deployment Architecture

### Distribution Channels
| Channel | Target | Method |
|---------|--------|--------|
| Claude Code | Plugin marketplace | `/plugin install` |
| OpenCode | GitHub releases | Tarball download |
| macOS | Homebrew | `brew install --cask rp1-run/tap/rp1` |
| Windows | Scoop | `scoop install rp1` |
| Linux | curl script | `curl -fsSL https://rp1.run/install.sh \| bash` |

### Build Pipeline
1. Release-please creates version tag from conventional commits
2. GoReleaser workflow triggers on tag
3. Bun compiles embedded assets with IS_BUNDLED=true
4. GoReleaser builds cross-platform binaries
5. Artifacts uploaded to GitHub Releases
6. Homebrew/Scoop formulas updated automatically

### Versioning Strategy
- Semantic versioning via release-please
- All components synchronized (plugins, CLI share version)
- Conventional commits drive version bumps

## Performance Considerations

### Lazy Loading
- Agent-tools (puppeteer) lazy-loaded to reduce CLI startup time
- Heavy dependencies only loaded when needed

### Parallel Execution
- KB generation uses 4 parallel agents
- PR review uses parallel sub-reviewers
- mmd-validate uses shared browser instance for batch validation

### Incremental Updates
- KB tracks git commit in state.json
- Only changed files analyzed on subsequent runs
- 2-5 min incremental vs 10-15 min full build

## Cross-References
- **Domain Concepts**: See [concept_map.md](concept_map.md)
- **Module Breakdown**: See [modules.md](modules.md)
- **Implementation Patterns**: See [patterns.md](patterns.md)
