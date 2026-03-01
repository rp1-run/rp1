# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI-Powered Development Tooling

## Core Concepts

### Plugin
Self-contained unit providing skills, agents, and commands for Claude Code/OpenCode platforms. Three plugins: rp1-base (foundation), rp1-dev (development workflows), rp1-utils (prompt utilities). Each plugin has `.claude-plugin/plugin.json` manifest, `skills/` directory, and `agents/` directory.

### Skill
Primary invocable unit in SKILL.md canonical format. Minimal wrapper that parses parameters via model-driven extraction and delegates to agents via Task tool. Replaces legacy commands. Located at `plugins/{plugin}/skills/{name}/SKILL.md`.

### Agent
Autonomous worker (200-350 lines) with constitutional structure executing complete workflows in single-pass with anti-loop directives and JSON output contracts. Located at `plugins/{plugin}/agents/{name}.md`.

### Knowledge Base (KB)
Auto-generated codebase documentation in `.rp1/context/` containing index.md, concept_map.md, architecture.md, modules.md, patterns.md, state.json, meta.json. Built via map-reduce with 5 parallel agents. Supports progressive loading.

### Feature Workflow
Six-step development process: blueprint → requirements → design → tasks → build → verify. Artifacts stored in `{RP1_ROOT}/work/features/{FEATURE_ID}/`.

### ToolResult
Standard JSON envelope for all agent tools with `success`, `tool`, `data`, and optional `errors` fields. Ensures consistent parsing by AI agents.

### PluginManifest
Build-generated metadata listing a plugin's name, version, and artifact arrays (commands, agents, skills). Consumed by install/verification pipelines.

### RP1_ROOT
Root directory for rp1 artifacts. Resolution-aware: from env override, git common-dir (linked worktree), or cwd. Contains `context/` (KB) and `work/` (features, worktrees).

### Worktree
Isolated git workspace for parallel agent work. Created via CLI tool with branch name and basedOn commit SHA. Hooks disabled for agent safety.

### Run
Agent execution instance tracked by Status Dashboard with status (queued/running/waiting-input/completed/failed/needs-review), steps, artifacts, and events.

### StatusUpdate
Work status record tracked in SQLite with project path, feature, task, status value, and metadata. Powers the Status Dashboard.

### CLIError
Tagged union error type covering 13 variants: usage, not-found, config, runtime, parse, transform, validation (L1/L2), generation, prerequisite, install, backup, verification, strict-mode.

### AttestationManifest
Content-addressable tracking of skill attestations, file hashes, and schema version. Ensures prompt changes are validated by evals before merge.

## Terminology Glossary

### Core Terms
- **Constitutional Prompting**: Agent behavior defined through structured markdown with rules, constraints upfront, enabling consistent single-pass execution
- **Single-Pass Execution**: Agent completes workflow in one run without iteration or feedback loops
- **Anti-Loop Directive**: Explicit instruction preventing iteration loops, forcing autonomous completion
- **Thin Wrapper**: Skill design pattern with no business logic, only parameter parsing and agent routing
- **Progressive KB Loading**: Load index.md first, then selectively load additional files based on task type (reduces context 50-70%)
- **SKILL.md Format**: Canonical format based on Agent Skills open standard with standardized frontmatter (name, description, allowed-tools, metadata)

### Review Terms
- **Confidence Gating**: PR review filtering: 65%+ include, 40-64% investigate critical only, below 40% exclude
- **Fitness Judgment**: PR review verdict: approve, request_changes, or block
- **Review Unit**: Segmented piece of PR diff for focused sub-reviewer analysis

### Workflow Terms
- **basedOn Commit**: SHA from which worktree branch was created; used for commit ownership validation before push
- **Scratch Pad**: File-based state storage for stateless agents; visible markdown persisted across sessions
- **Content-Addressable Attestation**: SHA-256 hashes detect prompt changes requiring re-evaluation
- **Prompt Hash**: SHA-256 of skill content (excluding frontmatter), prefixed with `sha256:`
- **Deps Hash**: Combined hash of all transitive dependencies (agents + skills) for attestation

### Platform Terms
- **Allowed-Tools**: SKILL.md frontmatter field pre-authorizing Bash commands to avoid permission prompts
- **Model-Driven Parameter Parsing**: AI model infers parameters from natural language using parameter table
- **Attention Status**: Work status values (waiting-input, needs-review) signaling human attention needed

## Relationships

| From | To | Type | Description |
|------|-----|------|-------------|
| Skill | Agent | invokes | Skills delegate work via Task tool |
| Agent | KB | reads | Agents load KB files via progressive loading |
| Plugin | Skill/Agent | contains | Plugins contain skills and agents |
| rp1-dev | rp1-base | depends-on | One-way dependency for KB and shared capabilities |
| Builder Agent | Reviewer Agent | adversarial-cooperation | Builder implements, reviewer critiques with retry |
| Run | Step/Artifact | contains/produces | Runs contain steps and produce artifacts |
| StatusUpdate | Feature Workflow | tracks | Status updates record feature/task progress |

## Bounded Contexts

| Context | Scope | Key Concepts |
|---------|-------|-------------|
| Base Plugin | Foundation/utilities | KB management, documentation, strategy, security |
| Dev Plugin | Development workflows | Feature lifecycle, code quality, PR review, testing |
| Utils Plugin | Prompt utilities | Eval generation, prompt optimization, attestation |
| CLI Tools | Agent-facing utilities | Worktree, mermaid validation, comment extraction, work status |
| Installation System | Plugin lifecycle | Manifests, prerequisites, staging, backup/restore |
| Web UI | Real-time monitoring | Projects, runs, artifacts, annotations, WebSocket |

## Cross-References
- **Architecture**: See [architecture.md](architecture.md) for system design and deployment
- **Modules**: See [modules.md](modules.md) for component breakdown
- **Patterns**: See [patterns.md](patterns.md) for implementation conventions
