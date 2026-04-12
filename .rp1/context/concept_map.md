# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI agent orchestration, tracked workflow authoring, and developer tooling

## Core Concepts

| Concept | Type | Description |
|---------|------|-------------|
| Plugin | entity | Capability pack (`rp1-base`, `rp1-dev`, `rp1-utils`) grouping skills and agents under a namespace with enforced dependency direction |
| Skill | entity | User-facing workflow entry point defined by `SKILL.md` with typed arguments, optional state machine, event emission, and platform-tagged behavior. Declares `metadata.category` and `metadata.is_workflow` for discovery registry enrollment |
| Agent | entity | Focused worker receiving pre-resolved parameters from a parent skill for bounded single-pass execution |
| Run | entity | Tracked workflow execution identified by `run-id`, governed by `run_policy` (fresh/resumable), advanced through explicit step and status events. Resumable runs carry `workIdentity` for identity-based matching |
| Event | entity | Typed record emitted against a run: `status_change`, `artifact_registered`, `annotation_updated`, `waiting_for_user`, `btw_update`, `subflow_registered` |
| Artifact | artifact | Registered output file with explicit `storageRoot` routing (project, work_dir, absolute). Types: markdown, code, diagram, diff, report, other |
| Annotation | entity | Threaded inline feedback on an artifact for review, reply, and resolution. Anchored by text-selection, hidden-anchor, or line-based positions |
| State Machine | entity | Mermaid `stateDiagram-v2` workflow graph whose state IDs must align with emitted step names. Parsed for validation |
| Knowledge Base | resource | Structured project docs under `.rp1/context/`, loaded progressively as the repo knowledge source for KB-aware workflows |
| Platform Tag | entity | Semantic Liquid tag (`dispatch_agent`, `ask_user`, `edit_model`, `plan_tool`) rendered per host by the build pipeline |
| CanonicalName | entity | Normalized `plugin:artifact` identity translating namespaces across Claude Code, OpenCode, and Codex |
| Project | entity | Registered workspace identified by `project_id`, resolved via directory walk-up or git worktree common-dir |
| Task Queue | entity | Persistent work queue for cross-agent coordination with pending, in-progress, completed, failed, and cancelled states |
| Notification | entity | System-generated message surfaced in Arcade, triggered by run status changes (completed/failed) or `waiting_for_user` events. Deduplicated per source |
| Workflow Bootstrap | entity | Auto-injected initialization step resolving arguments, directories, and run identity in one atomic call |
| Discovery Registry | entity | Canonical skill catalog built from frontmatter at build time. Drives CATALOG.md, init awareness blocks, `rp1 list --json`, and ambient suggestions |
| Arcade Tracked | mechanism | Optional `metadata.arcade_tracked` boolean controlling Activity feed visibility without disabling workflow mechanics |
| Platform Definition | entity | Data-driven build configuration capturing platform-varying behavior: registry, templates, naming, lifecycle hooks |
| Subflow | entity | Nested workflow registered within a parent run via `subflow_registered` event type |

## Key Terminology

| Term | Definition |
|------|------------|
| run-id | UUID identifying a workflow execution across status changes, gates, artifacts, and dashboard views |
| storageRoot | Artifact root selector: `work_dir`, `project`, or `absolute` |
| Namespaced Step | Sub-agent step name prefixed with `agent-name:` to avoid collisions with parent workflow states |
| run_policy | Workflow lifecycle selector: `fresh` always creates a new run; `resumable` matches existing non-terminal run by `identity_args` |
| identity_args | Subset of declared skill arguments whose values form the `workIdentity` key for resumable run matching |
| workIdentity | Composite key from `identity_args` values, stored on the run record for subsequent invocation matching |
| Skill Category | Nine-value enum (`development`, `investigation`, `quality`, `review`, `documentation`, `knowledge`, `strategy`, `planning`, `prompt`) for catalog grouping |
| is_workflow | Boolean frontmatter flag distinguishing workflow-orchestrating skills from single-purpose skills |
| arcade_tracked | Optional boolean metadata field controlling Arcade Activity feed visibility. Defaults to true |
| Resolve Args | Auto-injected argument-resolution step merging user input, settings, env fallbacks, and schema defaults |
| Progressive Disclosure | Load `index.md` first, then only the KB files needed for the current task |
| Bayesian Reconciliation | KB update method treating existing docs as prior hypotheses, revising only where new evidence justifies it |
| Fence Marker | Versioned delimiter bracketing rp1-managed content in instruction files for staleness detection and upgrade |
| Distribution Scope | Catalog classification: `distributable` (base, dev) or `internal` (utils) |
| ToolResult Envelope | Standard `{ success, tool, data, errors? }` JSON structure wrapping all agent-tool outputs |
| Confidence Gating | PR review threshold: 65%+ includes; 40-64% investigates critical/high; below 40% excludes |
| Anchor | Position binding for an annotation: `text-selection`, `hidden-anchor`, or `line` |
| Document Kind | Requested or inferred document shape selecting default structure (auto, blog-post, technical-proposal, feedback) |
| Section Scenario | Doc-sync classification for a section: `verify`, `add`, or `fix` |
| Logical Step Key | Collapsed step identifier for dashboard grouping: non-namespaced steps keep their ID; namespaced lifecycle steps collapse to namespace prefix |

## Relationships

```text
Plugin ──contains──> Skill, Agent
Skill ──delegates to──> Agent
Skill ──embeds──> State Machine
Skill ──enrolls in──> Discovery Registry
Skill ──declares──> Arcade Tracked
State Machine ──governs──> Run
Run ──contains──> Event
Run ──produces──> Artifact
Run ──triggers──> Notification
Artifact ──anchors──> Annotation
Knowledge Base ──grounds──> Documentation Synchronization
Knowledge Base ──informs──> Content Workflow
Workflow Bootstrap ──initializes──> Run
Platform Definition ──configures──> Build Template Context
Discovery Registry ──generates──> Guide, Init Wizard
Arcade Tracked ──filters──> Run (Activity feed visibility)
Attestation ──validates──> Skill
```

## Agent Patterns

| Pattern | Context | Application |
|---------|---------|-------------|
| Constitutional Prompting | All agent execution | Expert knowledge, codebase context, anti-loop directives, and output contracts in structured markdown |
| Map-Reduce | KB generation, PR review | Spatial analyzer maps work to parallel units; orchestrator reduces results |
| Skill-Agent Delegation | All workflow entry points | Skill interprets request, loads context, delegates bounded work to agents |
| Builder-Reviewer | Feature implementation | Builder implements, reviewer verifies; one retry cycle with user escalation |
| Stateless Agent | Blueprint charter creation | State persisted in visible file-based scratch pad for session-independent resumability |
| Data-Driven Platform Build | Multi-platform artifacts | PlatformDefinition entries capture all platform-varying behavior |
| Notification Auto-Generation | Emit pipeline | Status changes and waiting_for_user events auto-generate deduplicated notifications |

## Bounded Contexts

| Context | Scope | Key Concepts |
|---------|-------|-------------|
| Knowledge Management | rp1-base | Knowledge Base, Spatial Analyzer, Progressive Disclosure |
| Documentation Production | rp1-base | Content Workflow, Documentation Synchronization, Scribe |
| Prompt Tooling | rp1-utils | Prompt Authoring Workflow, Shell-Safe Formatting |
| Feature Delivery | rp1-dev | PR Review, Task Queue, Builder-Reviewer |
| Runtime Services | cli/src | Project, Run, Event, Workflow Bootstrap, Notification |
| Dashboard | cli/web-ui | Arcade, Artifact, Annotation, Run Invocation Context |
| Platform Abstraction | build pipeline | Platform Tag, CanonicalName, Platform Definition |
| Discovery | cli/catalog | Discovery Registry, Guide, Skill Category, Arcade Tracked |
| Project Lifecycle | cli/init, cli/migrate | Fence Versioning, Init Wizard, Project Migration |
| Quality Assurance | evals/ | Attestation |

## Cross-Cutting Concerns

- **Fact grounding**: Writing workflows use source hierarchy with KB as truth source
- **Human gates**: `waiting_for_user` emitted before prompts, visible in host tool and Arcade
- **Traceable state**: Intermediates (`brief.md`, `scan_results.json`) persist under `.rp1/work/`
- **State discipline**: Mermaid states, emitted steps, namespaced sub-agent steps, and logical step keys stay aligned
- **Configuration resolution**: `resolve-args` + `workflow-bootstrap` unify argument, directory, and run creation
- **Platform portability**: Semantic tags and data-driven definitions let one prompt target multiple hosts
- **Single-source discovery**: Frontmatter metadata drives all catalog views, avoiding drift
- **Standard tool envelope**: All agent-tools return `ToolResult<T>` JSON for predictable AI-agent parsing
