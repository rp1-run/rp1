# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI-Assisted Development Tooling (Plugin System for Agentic Coding Platforms)

## Core Business Concepts

### Plugin
**Definition**: Self-contained unit providing skills, agents, and commands for Claude Code/OpenCode/Codex platforms.
**Implementation**: `plugins/base/`, `plugins/dev/`, `plugins/utils/`
**Key Properties**:
- base: Foundation (KB management, documentation, strategy, security)
- dev: Development workflows (feature lifecycle, code quality, PRs, testing; depends on base)
- utils: Prompt utilities (eval generation, prompt optimization)

### Skill
**Definition**: Primary invocable unit in SKILL.md canonical format (Agent Skills open standard). Minimal wrapper parsing parameters via model-driven extraction, delegating to agents via Task tool.
**Implementation**: `plugins/*/skills/*/SKILL.md`
**Business Rules**:
- Thin wrapper with no business logic
- Parameters inferred by AI model from `## Parameters` table
- Invoked via `/rp1-{plugin}:{skill-name}`

### Agent
**Definition**: Autonomous worker (200-350 lines) with constitutional structure. Executes complete workflows in single-pass with anti-loop directives and JSON output contracts.
**Implementation**: `plugins/*/agents/*.md`
**Business Rules**:
- Single-pass execution (no iteration)
- Cannot spawn other agents (subagent limitation)
- Structured markdown with parameter tables, anti-loop directives, output contracts

### Knowledge Base (KB)
**Definition**: Auto-generated codebase documentation in `.rp1/context/` built via map-reduce with parallel agents. Supports progressive loading.
**Implementation**: `.rp1/context/*.md`
**Key Properties**:
- index.md: Entry point (always load first)
- Progressive disclosure reduces context 50-70%
- Tracks git commit for staleness detection

### Feature Workflow
**Definition**: Six-step development process: requirements -> design -> tasks -> build -> verify -> archive.
**Implementation**: `/rp1-dev:build` skill orchestrates all steps

### ToolResult
**Definition**: Standard JSON envelope for all agent tools: `{ success, tool, data, errors? }`.
**Implementation**: `cli/src/agent-tools/models.ts`

### StatusUpdate
**Definition**: Work status record in SQLite (`~/.rp1/status.db`) with project path, feature, step, workflow, agent, task, run-id, status value, and metadata.
**Implementation**: `cli/src/agent-tools/work/models.ts`

### StateMachine
**Definition**: Declarative workflow state management via embedded Mermaid stateDiagram-v2 blocks in skill/agent markdown. CLI validates transitions at runtime.
**Implementation**: `cli/src/agent-tools/state-machine/`

### Run
**Definition**: Agent execution instance tracked by Status Dashboard with status (queued/running/waiting-input/completed/failed/needs-review), steps, artifacts, and events.
**Implementation**: `cli/web-ui/src/types/runs.ts`

### Artifact
**Definition**: Output file produced by a run (markdown, code, diagram, diff, report, other). Registered via CLI and stored in artifacts table.
**Implementation**: `cli/src/agent-tools/work/models.ts`

### Worktree
**Definition**: Isolated git workspace for parallel agent work. Created via CLI tool with branch name and basedOn commit SHA. Hooks disabled for agent safety.
**Implementation**: `cli/src/agent-tools/worktree/`

### SupportedTool
**Definition**: Agentic platform that can host rp1 plugins (Claude Code, OpenCode, Codex). Defined in supported-tools.yaml with binary, min version, instruction file, and capabilities.
**Implementation**: `cli/src/config/supported-tools.yaml`

### CLIError
**Definition**: Tagged union error type with 14 variants (usage, not-found, config, runtime, port-in-use, parse, transform, validation, generation, prerequisite, install, backup, verification, strict-mode). Each maps to an exit code.
**Implementation**: `cli/shared/errors.ts`

### Annotation
**Definition**: Inline comment on an artifact with anchor (text-selection, hidden-anchor, or line), threaded replies, and resolution status.
**Implementation**: `cli/web-ui/src/types/annotations.ts`

### PRReviewConfig
**Definition**: Configuration for automated PR review from `.rp1/config/pr-review.yaml`. Controls AI harness, verdict mode, inline comments, CI platform, and confidence gating thresholds.
**Implementation**: `cli/src/pr-review/models.ts`

### AttestationManifest
**Definition**: Content-addressable tracking of skill attestations (prompt_hash, deps_hash, version, last_eval). SHA-256 hashes detect prompt changes requiring re-evaluation.
**Implementation**: `evals/src/attestation/types.ts`

## Technical Concepts

### Constitutional Prompting
**Purpose**: Agent behavior defined through structured markdown with rules and constraints, enabling consistent single-pass execution.
**Aliases**: constitutional pattern

### Model-Driven Parameter Parsing
**Purpose**: AI model infers parameters from natural language using `## Parameters` table instead of CLI round-trip.

### Map-Reduce Workflows
**Purpose**: Split work into independent units, process N agents in parallel, merge results.
**Usage**: KB generation (4 parallel analyzers), PR review (N sub-reviewers)

### Builder-Reviewer (Adversarial Cooperation)
**Purpose**: Two agents work together: builder implements, reviewer critiques with one retry before escalation.
**Usage**: Feature implementation via `/rp1-dev:build`

### Stateless Agent Pattern
**Purpose**: Resumable workflow where agent reads state from file-based scratch pad, not conversation memory.
**Usage**: Multi-session interviews (blueprint/charter)

### Progressive KB Loading
**Purpose**: Load index.md first, then selectively load additional KB files based on task type (reduces context 50-70%).

### Confidence Gating
**Purpose**: PR review filtering: 65%+ include, 40-64% investigate critical only, below 40% exclude.

### Content Fencing
**Purpose**: Idempotent content injection using `<!-- rp1:start -->` / `<!-- rp1:end -->` markers in markdown and `# rp1:start` / `# rp1:end` in shell configs.

### Two-Layer State Model
**Purpose**: Orthogonal state dimensions: StatusValue (what activity) x WorkflowState (where in workflow).

### Content-Addressable Attestation
**Purpose**: SHA-256 hashes create cryptographic links between prompt content and test results for release gates.

## Terminology Glossary

### Business Terms
- **RP1_ROOT**: Root directory for rp1 artifacts. Resolution-aware: env override, git-common-dir (linked worktree), or cwd
- **Run Isolation**: Each `--run-id` UUID creates an independent workflow invocation tracked separately
- **Attention Status**: Work status values (waiting-input, needs-review) signaling human attention needed
- **Review Unit**: Segmented piece of PR diff for focused sub-reviewer analysis
- **Spatial Analysis**: KB phase that scans repository and categorizes files with importance scores (0-5)

### Technical Terms
- **SKILL.md Format**: Canonical format based on Agent Skills open standard replacing legacy command format
- **Anti-Loop Directive**: Explicit instruction preventing iteration loops, forcing autonomous completion
- **Thin Wrapper**: Skill pattern with no business logic, only parameter parsing and agent routing via Task tool
- **Allowed-Tools**: SKILL.md frontmatter field pre-authorizing Bash commands to avoid permission prompts
- **Scratch Pad**: File-based state storage for stateless agents; visible markdown persisted across sessions
- **basedOn Commit**: SHA from which worktree branch was created; used for commit ownership validation
- **Sub-Agent Inventory**: metadata.sub_agents field in SKILL.md declaring agent references for build-time validation

## Concept Relationships

| From | To | Relationship |
|------|----|-------------|
| Plugin | Skill | contains (plugins/{plugin}/skills/{name}/SKILL.md) |
| Plugin | Agent | contains (plugins/{plugin}/agents/{name}.md) |
| Skill | Agent | delegates via Task tool |
| Agent | KB | reads for codebase context |
| Agent | StatusUpdate | reports workflow progress |
| StatusUpdate | StateMachine | validated by (transition legality) |
| Run | Artifact | produces (typed outputs) |
| Annotation | Artifact | anchored to (text-selection, hidden-anchor, line) |
| SupportedTool | Plugin | hosts (Claude Code, OpenCode, Codex) |
| AttestationManifest | Skill | attests (hash-verified eval results) |
| Worktree | Run | isolates (parallel agent workspaces) |

## Bounded Contexts

- **Base Plugin**: KB management, documentation, strategy, security, content writing
- **Dev Plugin**: Feature lifecycle, code quality, PR review, builder-reviewer, worktree workflows
- **Utils Plugin**: Eval generation, prompt optimization, attestation
- **CLI Agent-Tools**: Worktree, mermaid validation, comment extraction, work status, state machine, GitHub PR, RP1_ROOT
- **Installation System**: Manifests, prerequisites, staging, backup/restore, verification, supported tools registry
- **Web UI**: Projects, runs, steps, artifacts, annotations, WebSocket events, attention grouping
- **Status Database**: Status updates, artifacts table, migrations, WAL mode, TTL expiry, run isolation
- **Eval System**: Content-addressable attestation, dependency-aware extraction, assertion generation

## Cross-References
- **Architecture patterns**: See [architecture.md](architecture.md)
- **Module breakdown**: See [modules.md](modules.md)
- **Implementation patterns**: See [patterns.md](patterns.md)
