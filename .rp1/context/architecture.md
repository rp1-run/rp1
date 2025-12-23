# System Architecture

**Project**: rp1 Plugin System
**Architecture Pattern**: Plugin Architecture with Map-Reduce Workflows
**Last Updated**: 2025-12-23

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
        BaseCmd[9 Commands]
        BaseAgents[13 Agents]
        Skills[5 Skills]
        BaseCmd --> BaseAgents
        BaseAgents --> Skills
    end

    subgraph "Dev Plugin"
        DevCmd[19 Commands]
        DevAgents[18 Agents]
        DevCmd --> DevAgents
        DevAgents -.->|cross-plugin| BaseCmd
    end

    subgraph "CLI"
        CLIMain[main.ts]
        Commands[init, install, view]
        WebUI[web-ui React]
    end

    subgraph "Knowledge Base"
        KB[.rp1/context/]
        State[state.json]
        KB --- State
    end

    subgraph "Build Pipeline"
        GH[GitHub Actions]
        RP[release-please]
        GR[GoReleaser]
        GH --> RP
        RP -->|tag| GR
    end

    subgraph "Distribution"
        Marketplace[Plugin Marketplace]
        Tarball[OpenCode Tarball]
        Binaries[Platform Binaries]
    end

    CC --> Base
    CC --> Dev
    OC --> Tarball
    CLI --> CLIMain

    BaseAgents --> KB
    DevAgents --> KB

    GR --> Binaries
    Base --> Marketplace
    Dev --> Marketplace
    RP --> Tarball
```

## Architectural Patterns

### Plugin Architecture
**Evidence**: `plugins/base/.claude-plugin/plugin.json`, `plugins/dev/.claude-plugin/plugin.json`, `plugins/utils/.claude-plugin/plugin.json`
**Description**: Three independent plugins (base, dev, utils) with explicit dependencies. Dev depends on base for shared capabilities. Each plugin has commands and agents; base owns all skills.

### Constitutional Agent Pattern
**Evidence**: `plugins/*/agents/*.md` (32 agents total)
**Description**: Agents follow structured format: YAML frontmatter, parameter tables, numbered workflow sections, JSON output contracts, anti-loop directives. Single-pass execution without iteration.

### Command-Agent Delegation
**Evidence**: `plugins/*/commands/*.md` (29 commands)
**Description**: Commands are thin wrappers (50-100 lines) that parse parameters and spawn constitutional agents (200-350 lines) via Task tool for workflow execution.

### Map-Reduce Orchestration
**Evidence**: `knowledge-build.md` spawns 4 parallel agents, `pr-review` uses splitter/sub-reviewers/synthesizer
**Description**: Complex workflows split into units, processed in parallel by specialized agents, then merged by orchestrator. Enables scalability for large codebases and PRs.

### Multi-Platform Distribution
**Evidence**: `.goreleaser.yml` (darwin-arm64/x64, linux-arm64/x64, windows-x64)
**Description**: Targets Claude Code (native plugins), OpenCode (tarballs), and standalone CLI (GoReleaser binaries via Homebrew/Scoop).

### Monorepo with Synchronized Versioning
**Evidence**: `.release-please-manifest.json`, all `plugin.json` files share version
**Description**: Single repository containing CLI, plugins, docs, and web-ui with synchronized semantic versioning via release-please.

## Layer Architecture

| Layer | Purpose | Components |
|-------|---------|------------|
| **Interface** | User-facing entry points | 29 commands across 3 plugins |
| **Agent** | Autonomous workflow execution | 32 agents across 3 plugins |
| **Skill** | Reusable shared capabilities | 5 skills (all in base) |
| **CLI** | Cross-platform tooling | main.ts, commands/*, web-ui |
| **Knowledge** | Persistent codebase knowledge | .rp1/context/*.md, state.json |
| **Build/Release** | CI/CD automation | GitHub Actions, GoReleaser |

## Key Workflows

### KB Generation Flow
```mermaid
sequenceDiagram
    participant User
    participant KBCommand as /knowledge-build
    participant Spatial as kb-spatial-analyzer
    participant Concept as kb-concept-extractor
    participant Arch as kb-architecture-mapper
    participant Module as kb-module-analyzer
    participant Pattern as kb-pattern-extractor
    participant KB as .rp1/context/

    User->>KBCommand: invoke
    KBCommand->>KBCommand: check state.json vs git commit
    KBCommand->>Spatial: spawn (categorize files)
    Spatial-->>KBCommand: categorized file lists

    par Parallel Analysis
        KBCommand->>Concept: spawn
        KBCommand->>Arch: spawn
        KBCommand->>Module: spawn
        KBCommand->>Pattern: spawn
    end

    Concept-->>KBCommand: concepts JSON
    Arch-->>KBCommand: architecture JSON
    Module-->>KBCommand: modules JSON
    Pattern-->>KBCommand: patterns JSON

    KBCommand->>KBCommand: merge results, generate index.md
    KBCommand->>KB: write KB files
    KBCommand-->>User: success report
```

### Feature Development Flow
```mermaid
sequenceDiagram
    participant User
    participant Blueprint as /blueprint
    participant Reqs as /feature-requirements
    participant Design as /feature-design
    participant Tasks as /feature-tasks
    participant Build as /feature-build
    participant Verify as /feature-verify

    User->>Blueprint: create charter + PRD
    User->>Reqs: gather requirements
    Reqs-->>User: requirements.md
    User->>Design: create design
    Design->>Tasks: auto-spawn
    Tasks-->>User: tasks.md
    User->>Build: implement
    Build->>Build: builder-reviewer loop
    Build-->>User: implementation complete
    User->>Verify: validate
    Verify-->>User: verification report
```

### PR Review Flow
```mermaid
sequenceDiagram
    participant User
    participant PR as /pr-review
    participant Splitter as pr-review-splitter
    participant SubReviewer as pr-sub-reviewer (N)
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
**Purpose**: CI/CD automation for testing, releases, and docs quality
**Workflows**:
- `ci.yml`: lint, typecheck, tests
- `release-please.yml`: versioning + changelog
- `goreleaser.yml`: binary distribution
- `lighthouse.yml`: docs performance
- `pr-title.yml`: conventional commit validation

### GoReleaser
**Purpose**: Cross-platform binary builds using Bun compiler
**Targets**: darwin-arm64/x64, linux-arm64/x64, windows-x64
**Distribution**: Homebrew cask (rp1-run/homebrew-tap), Scoop bucket (rp1-run/scoop-bucket)

### Release-Please
**Purpose**: Automated semantic versioning from conventional commits
**Features**: Creates release PRs with changelogs, tags releases to trigger GoReleaser, builds OpenCode artifacts

### Cloudflare Pages
**Purpose**: Documentation hosting for rp1.run
**Stack**: MkDocs Material, Lighthouse CI validation

### Plugin Marketplace
**Purpose**: Native plugin distribution for Claude Code users
**Install**: `/plugin install rp1-base`, `/plugin install rp1-dev`

### OpenCode
**Purpose**: Alternative AI coding assistant support
**Artifacts**: Tarball in GitHub releases, AGENTS.md instruction file

## Deployment Architecture

### Distribution Channels
| Channel | Target | Method |
|---------|--------|--------|
| Plugin Marketplace | Claude Code users | `/plugin install` |
| GitHub Releases | OpenCode users | Tarball download |
| Homebrew | macOS CLI users | `brew install rp1-run/tap/rp1` |
| Scoop | Windows CLI users | `scoop install rp1` |
| curl script | Linux CLI users | Direct binary download |

### Versioning Strategy
- Semantic versioning via release-please
- All components synchronized (plugins, CLI share version)
- Conventional commits drive version bumps

## Cross-References
- **Domain Concepts**: See [concept_map.md](concept_map.md)
- **Module Breakdown**: See [modules.md](modules.md)
- **Implementation Patterns**: See [patterns.md](patterns.md)
