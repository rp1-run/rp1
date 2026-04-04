# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI agent orchestration, tracked workflow authoring, and developer tooling

## Core Concepts

| Concept | Type | Meaning |
|---------|------|---------|
| Plugin | entity | Capability pack such as `rp1-base`, `rp1-dev`, or `rp1-utils` that groups skills and agents under a namespace and enforces dependency direction. |
| Skill | entity | User-facing workflow entry point defined by `SKILL.md` with typed arguments, optional state machine, event emission, and platform-tagged behavior. |
| Agent | entity | Focused worker that receives pre-resolved parameters from a parent skill and performs bounded execution in a single pass. |
| Run | entity | Tracked workflow execution identified by `run-id` and advanced through explicit step and status events. |
| Event | entity | Typed record emitted against a run to drive workflow state, waiting gates, artifact registration, and dashboard updates. |
| Artifact | artifact | Registered output file with explicit `storageRoot` routing for project, work, or absolute paths. |
| Annotation | entity | Threaded inline feedback attached to an artifact for review, reply, and resolution workflows. |
| State Machine | entity | `stateDiagram-v2` workflow graph whose state IDs must align with emitted step names. |
| Knowledge Base | resource | Structured project documentation under `.rp1/context/`, loaded progressively and treated as the repo knowledge source for KB-aware workflows. |
| Platform Tag | entity | Semantic Liquid tag such as `dispatch_agent`, `ask_user`, `edit_model`, or `plan_tool` that the build pipeline renders per host. |
| CanonicalName | entity | Normalized `plugin:artifact` identity used to translate namespaces across Claude Code, OpenCode, and Codex. |
| Project | entity | Registered workspace that defines project, KB, and work roots for runs and tooling. |
| Task Queue | entity | Persistent work queue for cross-agent coordination with pending, in-progress, completed, failed, and cancelled states. |
| PR Review | workflow | Map-reduce pull request analysis workflow with CI awareness, confidence gating, and GitHub integration. |
| Attestation | artifact | Content-addressable evaluation record linking prompt and dependency hashes to pass/fail results. |
| Spatial Analyzer | workflow | KB discovery agent that ranks files and maps repository areas to downstream KB sections. |
| Content Workflow | workflow | Tracked writing workflow that normalizes a request, persists a brief, asks only blocking questions, drafts, reviews, and finalizes a document. |
| Content Brief | artifact | Durable brief artifact that separates verified facts, editorial decisions, open questions, and Q&A history for a writing run. |
| Documentation Synchronization | workflow | Two-pass workflow that discovers user docs, validates KB currency, scans sections, requests one approval gate, and processes updates against KB-backed facts. |
| Scan Results | artifact | Intermediate artifact bridging documentation scan and process phases with KB status, inferred style, per-file section classifications, and errors. |
| Scribe | agent | File-level documentation worker that executes scan or process batches and returns strict JSON-only results. |
| Prompt Authoring Workflow | workflow | Tracked workflow that authors or rewrites prompts, classifies the target, loads companion references, and validates rp1 conventions before review. |
| Prompt Authoring Corpus | resource | On-demand reference set of patterns, templates, and rp1-specific authoring rules used to synthesize terse prompts. |

## Terminology Glossary

| Term | Meaning |
|------|---------|
| `run-id` | UUID that identifies a workflow execution across status changes, gates, artifacts, and dashboard views. |
| `storageRoot` | Explicit artifact root selector: `work_dir`, `project`, or `absolute`. |
| Namespaced Step | Sub-agent step name prefixed with `agent-name:` to avoid collisions with parent workflow states. |
| `SKILL.md` | Canonical skill file format with YAML frontmatter and workflow body. |
| Resolve Args | Auto-injected argument-resolution step that merges user input, settings, env fallbacks, and schema defaults for `metadata.arguments`. |
| Progressive Disclosure | Load `index.md` first, then widen only to the KB or reference files needed for the current task. |
| Bayesian Reconciliation | KB update method that treats existing documentation as prior hypotheses and revises only where new evidence justifies it. |
| Novelty Scan | Explicit post-reconciliation search for materially new concepts not already modeled in the prior KB. |
| Diff Frontier | Changed-file frontier used to bias incremental KB analysis toward recently edited areas before widening locally. |
| Document Kind | Requested or inferred document shape that selects the default structure, such as `auto`, `blog-post`, `technical-proposal`, or `feedback`. |
| Source Hierarchy | Writing evidence order: user input, existing target doc, local project sources and KB, then external sources only when explicitly requested. |
| Section Scenario | Doc-sync classification for a section: `verify`, `add`, or `fix`. |
| `kb_match` | Reference from a user-doc section to a KB section, encoded as `file:line` or `file:start-end`. |
| `scan_results.json` | Bridge artifact that carries KB status, inferred style, per-file section classifications, and scan errors into the process phase. |
| Stale KB Gate | Explicit pre-scan decision when the KB is behind `HEAD` but still structurally readable. |
| Review Marker | Inline HTML comment inserted when doc verification cannot confidently resolve a claim. |
| `list_marker` | Canonical unordered-list style field; `list_style` is retained only as a compatibility alias. |
| Companion Files | Prompt-writer support docs loaded on demand: `PATTERNS.md`, `TEMPLATES.md`, and `RP1-AUTHORING.md`. |
| Prompt Complexity Band | Simple, moderate, or complex size bucket that guides template selection in prompt authoring. |
| Shell-Safe Formatting | Prompt-authoring rule set that avoids shell-expansion hazards before text reaches the target host. |

## Key Relationships

| From | Relation | To | Meaning |
|------|----------|----|---------|
| Plugin | contains | Skill | Plugins package user-facing workflows under a namespace. |
| Plugin | contains | Agent | Plugins package focused workers alongside skills. |
| Skill | delegates to | Agent | Skills orchestrate work and hand bounded tasks to agents. |
| Skill | embeds | State Machine | Tracked skills declare workflow states in Mermaid and mirror them with emitted steps. |
| State Machine | governs | Run | Run progression is validated against declared states and transitions. |
| Run | contains | Event | Runs are materialized through emitted workflow events. |
| Run | produces | Artifact | Workflows register generated files as run artifacts. |
| Artifact | anchors | Annotation | Feedback threads attach to specific artifact locations. |
| Knowledge Base | grounds | Documentation Synchronization | User-doc reconciliation treats the KB as the fact source for scan and fix decisions. |
| Knowledge Base | informs | Content Workflow | Repo-specific writing loads `index.md` first and then only the KB slices needed for the draft. |
| Documentation Synchronization | dispatches | Scribe | The orchestrator delegates scan and process batches to scribe workers. |
| Documentation Synchronization | produces | Scan Results | The scan phase persists an intermediate artifact that bridges into processing. |
| Content Workflow | produces | Content Brief | Each writing run creates and maintains a durable brief as workflow state. |
| Prompt Authoring Workflow | loads | Prompt Authoring Corpus | Prompt-writer pulls in templates, patterns, and rp1 authoring rules on demand. |
| Platform Tag | transforms | Skill | Build-time rendering converts semantic tags into host-specific instructions. |
| Spatial Analyzer | maps for | Knowledge Base | Spatial analysis routes repository evidence into downstream KB sections. |
| Attestation | validates | Skill | Attestations tie prompt content hashes to evaluation outcomes for release gating. |
| Task Queue | coordinates | Agent | Persistent tasks provide a shared handoff mechanism for agents. |

## Bounded Contexts

| Context | Scope | Key Concepts | Boundary |
|---------|-------|--------------|----------|
| Knowledge Management | `rp1-base` | Knowledge Base, Spatial Analyzer, Progressive Disclosure, Bayesian Reconciliation | Owns `.rp1/context` generation and freshness signals; does not directly edit user-facing docs. |
| Documentation Production | `rp1-base` | Content Workflow, Content Brief, Documentation Synchronization, Scan Results, Scribe | Owns user-facing doc creation and KB-backed reconciliation, persisting workflow state in `.rp1/work/`. |
| Prompt Tooling | `rp1-utils` | Prompt Authoring Workflow, Prompt Authoring Corpus, Shell-Safe Formatting | Owns prompt synthesis, rewrite guidance, rp1 authoring conventions, and reusable prompt templates and patterns. |
| Feature Delivery | `rp1-dev` | PR Review, Task Queue, Builder-Reviewer | Owns implementation and review workflows for product changes. |
| Runtime Services | `cli/src` | Project, Run, Event, CLI entrypoints | Owns command registration, runtime detection, agent-tools plumbing, install/update/init flows, and top-level CLI execution. |
| Dashboard | `cli/web-ui` | Arcade, Run, Artifact, Annotation | Owns live visualization, feedback threads, and waiting-gate visibility for active workflows. |
| Quality Assurance | `evals/` | Attestation | Owns prompt verification and release-gating evidence. |
| Platform Abstraction | build pipeline | Platform Tag, CanonicalName | Owns host-specific rendering and namespace translation so one prompt source can target multiple agent hosts. |

## Cross-Cutting Concerns

- **Fact grounding**: Writing workflows use a source hierarchy, treat the KB as the truth source for doc reconciliation, and insert review markers instead of inventing unsupported claims.
- **Explicit human gates**: `waiting_for_user` is emitted before clarification, approval, or stale-KB decisions so pauses are visible in both the host tool and Arcade.
- **Traceable intermediate state**: Resumable intermediates such as `brief.md` and `scan_results.json` persist under `.rp1/work/` instead of living only in prompt context.
- **Style normalization**: Doc-sync infers dominant style once, normalizes to canonical fields such as `list_marker`, and applies them consistently during edits.
- **State and step discipline**: Mermaid states, emitted step names, namespaced sub-agent steps, and terminal completion semantics stay aligned.
- **Configuration resolution**: Typed `metadata.arguments` plus auto-injected `resolve-args` replace manual parameter parsing in tracked skills.
- **Shell-safe prompt rendering**: Prompt-authoring guidance avoids text patterns that would be expanded or misparsed by the shell.
- **Platform portability**: Semantic platform tags and canonical naming let one authored workflow target Claude Code, OpenCode, and Codex without duplicating prompt sources.

## Cross-References

- **System topology**: See [architecture.md](architecture.md)
- **Component inventory**: See [modules.md](modules.md)
- **Implementation idioms**: See [patterns.md](patterns.md)
- **Surface behavior**: See [interaction-model.md](interaction-model.md)
