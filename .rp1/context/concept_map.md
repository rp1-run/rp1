# Concept Map

## Core Concepts

### Plugin
**Type**: entity
Capability package (rp1-base, rp1-dev, rp1-utils) grouping skills and agents
**Source**: cli/src/install/models.ts, cli/src/init/models.ts

### Skill
**Type**: entity
User-facing workflow entry point defined by SKILL.md with frontmatter, parameters, and delegation
**Source**: cli/src/build/models.ts, docs/concepts/skill-format.md

### Agent
**Type**: entity
Focused autonomous worker executing workflow body in a single pass
**Source**: cli/src/build/models.ts

### Sub-Agent
**Type**: entity
Agent spawned by skill/agent; emits namespaced steps ({agent-name}:{step}) to avoid parent state collision
**Source**: docs/concepts/state-machines.md

### Run
**Type**: entity
Tracked workflow execution with UUID run-id, status, steps, events, and artifacts
**Source**: cli/shared/events.ts, cli/web-ui/src/types/runs.ts

### Event
**Type**: entity
Typed record (status_change, artifact_registered, annotation_updated, waiting_for_user, btw_update, subflow_registered) emitted against a run
**Source**: cli/shared/events.ts, cli/src/agent-tools/emit/models.ts

### Artifact
**Type**: entity
Typed output file (markdown, code, diagram, diff, report, other) registered against a run
**Source**: cli/shared/events.ts, cli/web-ui/src/types/runs.ts

### Annotation
**Type**: entity
Threaded inline comment anchored to artifact via text-selection, hidden-anchor, line, or edit-diff; supports replies and resolution
**Source**: cli/web-ui/src/types/annotations.ts, cli/web-ui/src/providers/AnnotationProvider.tsx

### State Machine
**Type**: entity
Mermaid stateDiagram-v2 parsed into typed graph model with states, transitions, initial/terminal markers
**Source**: cli/src/agent-tools/state-machine/models.ts, cli/src/agent-tools/state-machine/adapter.ts, cli/src/agent-tools/state-machine/transform.ts

### Two-Layer State Model
**Type**: pattern
Orthogonal dimensions: StatusValue (what: running/waiting/completed) and WorkflowState (where: step from state diagram)
**Source**: docs/concepts/state-machines.md, cli/shared/events.ts

### Task Queue
**Type**: entity
Persistent task records with lifecycle states for cross-agent work coordination
**Source**: cli/src/agent-tools/task/models.ts

### Project
**Type**: entity
Registered workspace with path, run statistics, and last-activity timestamp
**Source**: cli/web-ui/src/types/projects.ts, cli/web-ui/src/providers/ProjectProvider.tsx

### Supported Tool
**Type**: entity
Agentic host tool (Claude Code, OpenCode, Codex) registered in supported-tools.yaml with binary, version, and capabilities
**Source**: cli/src/config/supported-tools.ts

### ToolResult Envelope
**Type**: pattern
Standard JSON response {success, tool, data, errors} returned by all agent tools
**Source**: cli/src/agent-tools/models.ts

### Build Pipeline
**Type**: workflow
Transforms SKILL.md into platform-specific artifacts with frontmatter parsing, L1/L2 validation, and manifest generation
**Source**: cli/src/build/models.ts

### PR Review
**Type**: workflow
CI-integrated PR review with multi-platform context extraction, verdict modes, and GitHub API operations
**Source**: cli/src/pr-review/models.ts, cli/src/agent-tools/github-pr/models.ts

### Init Wizard
**Type**: workflow
Interactive project setup: git detection, brownfield/greenfield classification, tool detection, plugin install, health check
**Source**: cli/src/init/models.ts

### Platform Tags
**Type**: pattern
Semantic Liquid tags (dispatch_agent, ask_user, edit_model) abstracting platform-varying behavior
**Source**: docs/concepts/skill-format.md

### WebSocket
**Type**: technical
Real-time layer delivering event notifications, file/tree changes, state snapshots, event replays, and annotation updates
**Source**: cli/web-ui/src/types/websocket.ts, cli/web-ui/src/providers/WebSocketProvider.tsx

### CLIError
**Type**: pattern
Tagged union error type with _tag discriminant, factory functions, and exit code mapping
**Source**: cli/shared/errors.ts

### Predecessor Auto-Completion
**Type**: pattern
When a step emits running, direct graph predecessors still in running/waiting are auto-completed
**Source**: cli/src/agent-tools/state-machine/adapter.ts, docs/concepts/state-machines.md

## Relationships

- **Plugin** contains **Skill**: Plugins group skills in plugins/{name}/skills/
- **Plugin** contains **Agent**: Plugins group agents in plugins/{name}/agents/
- **Skill** delegates **Agent**: Skills delegate execution to agents via the Skill-Agent pattern
- **Agent** spawns **Sub-Agent**: Agents can spawn sub-agents with namespaced step emissions
- **State Machine** governs **Run**: State machines validate transitions and derive step timelines for runs
- **Run** contains **Event**: Runs collect events emitted via agent-tools emit
- **Run** produces **Artifact**: Runs register typed output files as artifacts
- **Artifact** anchors **Annotation**: Annotations attach to artifacts via anchor types
- **Event** broadcasts **WebSocket**: Events are broadcast to the dashboard via WebSocket notifications
- **WebSocket** delivers **Web UI Dashboard**: WebSocket delivers real-time updates including state snapshots and event replays
- **Build Pipeline** transforms **SKILL.md Format**: Build pipeline parses SKILL.md and generates platform-specific artifacts
- **Supported Tool** targets **Install**: Each supported tool has platform-specific installation logic
- **PR Review** uses **GitHub API**: PR review submits reviews, reactions, and comments via GitHub API tools
- **Init Wizard** installs **Plugin**: Init wizard detects tools and installs appropriate plugins
- **State Machine** enables **Predecessor Auto-Completion**: Graph predecessors are auto-completed when a new step starts running

## Terminology

- **SKILL.md**: Canonical file format for an invocable rp1 skill following the Agent Skills open standard
- **RP1_ROOT**: Resolved .rp1/ workspace root via env, git-common-dir, or cwd strategies with worktree awareness
- **run-id**: UUID identifier for an individual workflow execution
- **emit**: Agent-tools command recording workflow events against a run
- **--unit**: Emit flag enabling per-task tracking within an agent (e.g., T1, T2, T3)
- **Namespaced step**: Sub-agent step prefixed with {agent-name}: to bypass parent state machine validation
- **StatusValue**: Activity category: not_started, running, waiting, completed, failed, skipped
- **WorkflowState**: Workflow phase defined by state diagram step IDs
- **AnchorType**: How an annotation attaches to content: text-selection, hidden-anchor, line, or edit-diff
- **Optimistic update**: UI pattern applying mutations locally before server confirmation with rollback on failure
- **CLIError**: Tagged union error type with _tag discriminant mapping to exit codes
- **Verdict**: PR review submission mode: approve, request_changes, comment, or auto
- **allowed-tools**: Comma-separated string in SKILL.md frontmatter specifying permitted tool calls
- **Brownfield / Greenfield**: Init wizard classification of projects with/without existing source files
