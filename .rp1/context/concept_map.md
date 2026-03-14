# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI-assisted development workflows for agentic coding platforms

## Core Concepts

### Plugin
**Definition**: A distribution unit that packages skills and agents for a capability area such as `rp1-base`, `rp1-dev`, or `rp1-utils`.
**Implementation**: `plugins/base/`, `plugins/dev/`, `plugins/utils/`
**Key Properties**:
- Namespace-prefixed for cross-platform installation and invocation.
- Carries the skills and agents that define the user-facing workflow surface.

### Skill
**Definition**: The invocable entry point defined by `SKILL.md`.
**Implementation**: `plugins/*/skills/*/SKILL.md`
**Key Properties**:
- Parses intent, parameters, and runtime context.
- Delegates substantial work to agents instead of embedding execution logic.

### Agent
**Definition**: A constitutional worker that executes a bounded workflow in one pass.
**Implementation**: `plugins/*/agents/*.md`
**Key Properties**:
- Operates under explicit execution rules and output contracts.
- Commonly runs as a specialist in a larger orchestration flow.

### Knowledge Base
**Definition**: Generated project context under `.rp1/context/` used for progressive loading by agents.
**Implementation**: `.rp1/context/index.md`, `.rp1/context/architecture.md`, `.rp1/context/modules.md`, `.rp1/context/patterns.md`
**Key Properties**:
- Starts with `index.md` and expands only as needed.
- Encodes reusable project knowledge rather than transient task state.

### State Machine
**Definition**: A Mermaid `stateDiagram-v2` model that constrains legal workflow transitions.
**Implementation**: `docs/concepts/state-machines.md`, `cli/src/agent-tools/state-machine/index.ts`
**Key Properties**:
- Validates transitions centrally.
- Keeps long-running workflows explicit and auditable.

### Run
**Definition**: A tracked execution record for a workflow, including status, steps, artifacts, and timing.
**Implementation**: `cli/web-ui/src/types/runs.ts`, `cli/src/agent-tools/work/`
**Key Properties**:
- Powers live status in the Web UI.
- Carries the operational history of agent work.

### Artifact
**Definition**: A typed output created or updated during a run, such as markdown, code, diagrams, or diffs.
**Implementation**: `cli/web-ui/src/types/runs.ts`
**Key Properties**:
- Registered by workflow tooling.
- Used to connect execution state to durable outputs.

### ToolResult
**Definition**: The standard JSON envelope returned by agent tools.
**Implementation**: `cli/src/agent-tools/models.ts`
**Key Properties**:
- Wraps success state, tool name, payload, and errors.
- Gives agents a stable contract across tool surfaces.

## Terminology Glossary

### Workflow Terms
- **Constitutional Prompting**: Agent behavior encoded as explicit markdown rules, phases, and output contracts.
- **Progressive Loading**: Load `index.md` first, then only the KB files needed for the current task.
- **Map-Reduce Workflow**: Split work into specialized parallel units and reduce the outputs into a final artifact set.
- **Anti-Loop Directive**: Prompt rule that prevents clarification loops and forces bounded autonomous execution.

### Platform Terms
- **Supported Tool**: An agent platform that can install and run rp1 artifacts, such as Claude Code, OpenCode, or Codex CLI.
- **Plugin Manifest**: Build-generated metadata describing a plugin version and the shipped skills and agents.
- **Project Context**: Initialization-time classification of a repository as greenfield or brownfield.
- **Health Report**: Setup-time verification output covering instruction files, plugin install state, KB presence, and related checks.

## Concept Relationships

- **Plugin contains Skill**: Plugins expose user-facing workflows through skill files.
- **Plugin contains Agent**: Plugins package the specialist workers those workflows rely on.
- **Skill delegates to Agent**: The skill handles routing and the agent executes.
- **Agent loads Knowledge Base**: KB files give agents shared project understanding.
- **State Machine governs Run**: Workflow transitions are validated against the declared model.
- **Run produces Artifact**: Execution records point at the files and outputs created during the workflow.
- **ToolResult wraps tool output**: Agent tooling returns predictable success and error payloads.

## Reusable Domain Patterns

- **Thin Skill Wrapper**: Keep `SKILL.md` focused on parameters, routing, and orchestration setup.
- **Single-Pass Constitutional Agent**: Encode enough rules that a specialist agent can finish without conversational loops.
- **Knowledge-Aware Execution**: Load KB context before acting so output follows project terminology and structure.
- **Validated Workflow Tracking**: Report progress through explicit statuses, step records, and state-machine enforcement.
- **Typed Tool Contracts**: Standardize agent-tool output around stable JSON envelopes instead of ad hoc text.

## Cross-References

- **Architecture**: See `architecture.md` for layers, interactions, and deployment shape.
- **Modules**: See `modules.md` for the main runtime, plugin, UI, and package boundaries.
- **Patterns**: See `patterns.md` for coding and orchestration conventions.
- **Dependencies**: See `dependencies.md` for inter-project and cross-plugin relationships.
