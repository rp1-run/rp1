# System Architecture

**Project**: rp1 Plugin System
**Architecture Pattern**: Two-Plugin Monorepo with Constitutional Agents
**Last Updated**: 2025-12-21
**Version**: 0.2.3

## High-Level Architecture

```mermaid
graph TB
    subgraph "User Interfaces"
        CC[Claude Code CLI]
        OC[OpenCode]
        CLI[rp1 CLI]
        Web[rp1.run Docs]
    end

    subgraph "Plugin System"
        Base[rp1-base v0.2.3]
        Dev[rp1-dev v0.2.3]
        Dev -->|depends on| Base
    end

    subgraph "Base Components"
        BaseCmd[9 Commands]
        BaseAgents[13 Agents]
        Skills[5 Skills]
        BaseCmd --> BaseAgents
        BaseAgents --> Skills
    end

    subgraph "Dev Components"
        DevCmd[19 Commands]
        DevAgents[18 Agents]
        DevCmd --> DevAgents
    end

    subgraph "CLI Components"
        CLIMain[cli/src/main.ts]
        WebUI[cli/web-ui React App]
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
        Tarball[OpenCode .tar.gz]
        Binaries[Platform Binaries]
        Homebrew[Homebrew/Scoop]
    end

    subgraph "Knowledge Base"
        KB[.rp1/context/]
        State[state.json]
    end

    CC --> Base
    CC --> Dev
    OC --> Tarball
    CLI --> CLIMain

    BaseAgents --> KB
    DevAgents --> KB
    DevAgents -.->|cross-plugin| BaseCmd

    GR --> Binaries
    GR --> Homebrew
    Base --> Marketplace
    Dev --> Marketplace
    RP --> Tarball
```

## Architectural Patterns

### Two-Plugin Monorepo
**Evidence**: `plugins/base/.claude-plugin/plugin.json`, `plugins/dev/.claude-plugin/plugin.json`
**Description**: Modular plugin architecture with rp1-base (foundation: knowledge, docs, strategy, security) and rp1-dev (workflows: features, code quality, PR management). Dev depends on base for shared capabilities.

### Constitutional Agent Pattern
**Evidence**: `plugins/*/agents/*.md` (31 agents: 13 base, 18 dev)
**Description**: Agents follow structured format: YAML frontmatter, parameter tables, numbered workflow sections, JSON output contracts, anti-loop directives. Single-pass execution without iteration.

### Command-Agent Delegation
**Evidence**: All command files delegate to agents via Task tool
**Description**: Commands are thin wrappers (50-100 lines) that parse parameters and spawn constitutional agents (200-350 lines) for workflow execution.

### Map-Reduce Orchestration
**Evidence**: `knowledge-build`, `pr-review` commands
**Description**: Complex workflows split into units, processed in parallel by specialized agents, then merged. Enables scalability for large codebases and PRs.

### Multi-Platform Distribution
**Evidence**: `.goreleaser.yml`, release-please workflows
**Description**: Claude Code (native plugins via marketplace), OpenCode (tarballs), CLI (binaries via GoReleaser with Homebrew/Scoop).

### Release-Please Automation
**Evidence**: `.github/workflows/release-please.yml`, `.release-please-manifest.json`
**Description**: Automated semantic versioning from conventional commits. Creates release PRs, builds artifacts on tag.

## Layer Architecture

| Layer | Purpose | Components |
|-------|---------|------------|
| Interface | User entry points | 9 base + 19 dev commands |
| Agent | Workflow execution | 13 base + 18 dev agents |
| Skill | Reusable capabilities | 5 skills (all in base) |
| CLI | Cross-platform tooling | build, install, init, view, self-update |
| Build/Release | CI/CD automation | GitHub Actions, GoReleaser, release-please |
| Documentation | Public docs | MkDocs Material at rp1.run |

## Data Flow

### KB Generation Flow
```mermaid
sequenceDiagram
    participant User
    participant KBBuild as knowledge-build
    participant Spatial as kb-spatial-analyzer
    participant Agents as 4 Parallel Agents
    participant KB as .rp1/context/

    User->>KBBuild: /knowledge-build
    KBBuild->>KBBuild: Check state.json vs git commit
    KBBuild->>Spatial: Spawn spatial analyzer
    Spatial-->>KBBuild: Categorized file lists
    KBBuild->>Agents: Spawn 4 agents in parallel
    Agents-->>KBBuild: JSON analysis results
    KBBuild->>KBBuild: Generate index.md
    KBBuild->>KB: Write KB files
    KBBuild-->>User: Success report
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

    User->>Blueprint: Create charter + PRD
    User->>Reqs: Gather requirements
    User->>Design: Technical design
    User->>Tasks: Task breakdown
    User->>Build: Implementation
    User->>Verify: Acceptance verification
```

### PR Review Flow
```mermaid
sequenceDiagram
    participant User
    participant PRReview as pr-review
    participant Splitter as pr-review-splitter
    participant SubReviewers as N pr-sub-reviewers
    participant Synth as pr-review-synthesizer
    participant Reporter as pr-review-reporter

    User->>PRReview: /pr-review
    PRReview->>Splitter: Split diff into units
    Splitter-->>PRReview: Review units JSON
    PRReview->>SubReviewers: Spawn N reviewers in parallel
    SubReviewers-->>PRReview: Unit findings
    PRReview->>Synth: Holistic synthesis
    Synth-->>PRReview: Fitness judgment
    PRReview->>Reporter: Format report
    Reporter-->>User: Review markdown
```

## Integration Points

### External Services
- **GitHub Actions**: CI/CD for releases, testing, docs quality
- **GoReleaser**: Cross-platform binary distribution (darwin, linux, windows)
- **Release-Please**: Automated semantic versioning from conventional commits
- **Homebrew/Scoop**: Package manager distribution
- **MkDocs Material**: Documentation site at rp1.run

### Internal Communication
- **Command → Agent**: Task tool invocation with subagent_type
- **Agent → KB**: Direct file read via Read tool
- **Cross-Plugin**: Dev agents can invoke base commands with error handling

## Deployment Architecture

### Distribution Channels
| Channel | Target | Mechanism |
|---------|--------|-----------|
| Plugin Marketplace | Claude Code | Native plugin install |
| GitHub Releases | OpenCode | .tar.gz artifacts |
| Homebrew | macOS | rp1-run/homebrew-tap |
| Scoop | Windows | rp1-run/scoop-bucket |
| curl | All | install.sh script |

### Build Targets
- darwin-arm64, darwin-x64
- linux-arm64, linux-x64
- windows-x64

### Versioning
- **Strategy**: Semantic versioning via release-please
- **Current**: v0.2.3
- **Synchronized**: All components share same version (plugins, CLI)
