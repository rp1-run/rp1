# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI Agent Orchestration & Plugin Ecosystem

## Core Business Concepts

### Plugin
**Definition**: Capability package (rp1-base, rp1-dev, rp1-utils) grouping skills and agents under a namespace prefix
**Implementation**: `plugins/*/`, `cli/src/install/models.ts`
**Key Properties**:
- namespace: Prefix for skills/agents (e.g., `rp1-base:`, `rp1-dev:`)
- skills: User-facing workflow entry points
- agents: Focused autonomous workers

**Business Rules**:
- Dev agents may depend on base; base must not call dev commands
- Each plugin has `.claude-plugin/plugin.json` manifest

### Skill
**Definition**: User-facing workflow entry point defined by SKILL.md with frontmatter, parameters, agent delegation, and optional state machine
**Implementation**: `plugins/*/skills/*/SKILL.md`, `cli/src/build/models.ts`
**Relationships**:
- Contains state machine (optional): Governs workflow transitions
- Delegates to agents: Skills route, agents execute

### Agent
**Definition**: Focused autonomous worker executing workflow body in a single pass with numbered sections and anti-loop directives
**Implementation**: `plugins/*/agents/*.md`, `docs/concepts/command-agent-pattern.md`
**Relationships**:
- Spawned by skills via Task tool
- May spawn sub-agents with namespaced step emissions (`{agent-name}:{step}`)

### Run
**Definition**: Tracked workflow execution with UUID run-id, status, steps, events, artifacts, and optional subflows
**Implementation**: `cli/shared/events.ts`, `cli/web-ui/src/types/runs.ts`
**Key Properties**:
- run-id: UUID for isolation
- StatusValue: what (running/waiting/completed/failed)
- WorkflowState: where (step from state diagram)

### Event
**Definition**: Typed record emitted against a run: status_change, artifact_registered, annotation_updated, waiting_for_user, btw_update, subflow_registered
**Implementation**: `cli/shared/events.ts`, `cli/src/agent-tools/emit/models.ts`

### Artifact
**Definition**: Typed output file (markdown, code, diagram, diff, report, other) registered against a run with docId and step association
**Implementation**: `cli/shared/events.ts`, `cli/web-ui/src/types/runs.ts`

### Annotation
**Definition**: Threaded inline comment anchored to artifact via text-selection, hidden-anchor, or line; supports replies, resolution, and orphan detection
**Implementation**: `cli/web-ui/src/types/annotations.ts`

### State Machine
**Definition**: Mermaid stateDiagram-v2 parsed into typed graph model (SMState, SMTransition) with transition validation and ordered steps
**Implementation**: `cli/src/agent-tools/state-machine/models.ts`, `docs/concepts/state-machines.md`

### Attestation
**Definition**: Content-addressable record linking prompt SHA-256 hash + dependency hash to eval pass/fail result for release gating
**Implementation**: `evals/src/attestation/types.ts`, `docs/concepts/eval-system.md`

### Knowledge Base
**Definition**: Structured codebase documentation in .rp1/context/ generated via map-reduce spatial analysis and parallel specialist agents
**Implementation**: `docs/concepts/knowledge-aware-agents.md`

### Task Queue
**Definition**: Persistent task records with lifecycle states (pending/in_progress/completed/failed/cancelled) for cross-agent work coordination
**Implementation**: `cli/src/agent-tools/task/models.ts`

### Project
**Definition**: Registered workspace with path, availability flag, run statistics, and last-activity timestamp
**Implementation**: `cli/web-ui/src/types/projects.ts`

## Technical Concepts

### Two-Layer State Model
**Purpose**: Orthogonal workflow tracking dimensions
**Implementation**: `docs/concepts/state-machines.md`, `cli/shared/events.ts`
- StatusValue (what): not_started, running, waiting, completed, failed, skipped
- WorkflowState (where): step IDs from state diagram (e.g., plan, build, review)

### Platform Tags
**Purpose**: Semantic Liquid tags abstracting platform-varying behavior at build time
**Implementation**: `docs/concepts/platform-tags.md`, `cli/src/build/tags/`
- dispatch_agent, ask_user, edit_model, plan_tool, web_access, permissions

### ToolResult Envelope
**Purpose**: Standard JSON response `{success, tool, data, errors}` returned by all agent tools
**Implementation**: `cli/src/agent-tools/models.ts`

### Predecessor Auto-Completion
**Purpose**: When a step emits running (without --unit), direct graph predecessors still in running/waiting are auto-completed
**Implementation**: `docs/concepts/state-machines.md`

### CLIError
**Purpose**: Tagged union error type with `_tag` discriminant, factory functions, and exit code mapping
**Implementation**: `cli/shared/errors.ts`
- Types: UsageError, NotFoundError, ConfigError, RuntimeError, ParseError, TransformError, ValidationError, GenerationError, PrerequisiteError, InstallError, StrictModeError

## Terminology Glossary

### Business Terms
- **SKILL.md**: Canonical file format for an invocable rp1 skill with YAML frontmatter
- **RP1_ROOT**: Resolved .rp1/ workspace root via env variable, git-common-dir, or cwd traversal
- **run-id**: UUID identifier for an individual workflow execution
- **emit**: Agent-tools command recording workflow events against a run
- **Arcade**: Web UI dashboard entry point (port 7710 default)
- **Brownfield / Greenfield**: Init wizard classification by existing source files
- **Verdict**: PR review submission mode: approve, request_changes, comment, or auto
- **BTW Update**: Informal progress message emitted by agents without state transition
- **Scratch Pad**: Visible file section used by stateless agents to persist interview state
- **Attention grouping**: Dashboard partitioning runs into waiting, failed, and running groups

### Technical Terms
- **--unit**: Emit flag enabling per-task tracking within an agent; disables predecessor auto-completion
- **Namespaced step**: Sub-agent step prefixed with `{agent-name}:` to bypass parent state machine validation
- **AnchorType**: How an annotation attaches: text-selection, hidden-anchor, or line
- **allowed-tools**: Comma-separated string in SKILL.md frontmatter specifying permitted tool calls
- **Confidence Gating**: PR review finding filter: 65%+ included, 40-64% investigated, below 40% excluded
- **Constitutional Prompting**: Encoding expert knowledge and anti-loop directives into agent prompts for single-pass execution
- **Spatial Analyzer**: KB generation agent that scans files, ranks by importance (0-5), and categorizes by KB section
- **ArtifactType**: Classification of run output: markdown, code, diagram, diff, report, or other
- **EvalPlatform**: Target platform for attestation: claude-code, opencode, or codex
- **Subflow**: Nested workflow within a parent run, registered via subflow_registered event

## Concept Relationships

### Workflow Architecture
- Plugin **contains** Skills and Agents
- Skill **delegates** execution to Agents via Task tool
- Agent **spawns** Sub-Agents with namespaced steps
- State Machine **governs** Run transitions
- Run **contains** Events, **produces** Artifacts, **contains** Subflows
- Artifact **anchors** Annotations

### Build & Distribution
- Build Pipeline **transforms** SKILL.md into platform artifacts
- Supported Tool (Claude Code, OpenCode, Codex) **targets** Build Pipeline
- Attestation **validates** Skill content for release gating

### Knowledge & Observation
- Knowledge Base **informs** Agents via progressive loading
- Project **contains** Runs with statistics
- Event **broadcasts** via WebSocket to Arcade dashboard

## Bounded Contexts

| Context | Scope | Key Concepts |
|---------|-------|--------------|
| Knowledge Management | rp1-base | KB Generation, Spatial Analysis, Progressive Loading |
| Feature Delivery | rp1-dev | Build Workflow, Builder-Reviewer, Blueprint, PR Review |
| Prompt Tooling | rp1-utils | Eval Extraction, Prompt Writing, Dependency Analysis |
| Runtime Services | cli/src | Build Pipeline, Install, Init, Agent Tools, State Machine |
| Dashboard | cli/web-ui | Arcade, Run Visualization, Annotations, WebSocket |
| Quality Assurance | evals/ | Attestation, Content-Addressable Hashing |

## Cross-References
- **State Machine Details**: See [architecture.md](architecture.md)
- **Module Breakdown**: See [modules.md](modules.md)
- **Implementation Patterns**: See [patterns.md](patterns.md)
