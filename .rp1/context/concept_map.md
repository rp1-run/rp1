# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI agent orchestration, tracked workflow authoring, and developer tooling

## Core Concepts

| Concept | Type | Meaning |
|---------|------|---------|
| Plugin | entity | Capability pack such as `rp1-base`, `rp1-dev`, or `rp1-utils` that groups skills and agents under a namespace and enforces dependency direction. |
| Skill | entity | User-facing workflow entry point defined by `SKILL.md` with typed arguments, optional state machine, event emission, and platform-tagged behavior. Each skill declares `metadata.category` and `metadata.is_workflow` for discovery registry enrollment. |
| Agent | entity | Focused worker that receives pre-resolved parameters from a parent skill and performs bounded execution in a single pass. |
| Run | entity | Tracked workflow execution identified by `run-id`, governed by a `run_policy` (fresh or resumable), and advanced through explicit step and status events. Resumable runs carry `workIdentity` and `bootstrapContext` for identity-based matching. |
| Event | entity | Typed record emitted against a run to drive workflow state, waiting gates, artifact registration, and dashboard updates. Six event types: `status_change`, `artifact_registered`, `annotation_updated`, `waiting_for_user`, `btw_update`, `subflow_registered`. |
| Artifact | artifact | Registered output file with explicit `storageRoot` routing for project, work, or absolute paths. Classified by type: markdown, code, diagram, diff, report, or other. |
| Annotation | entity | Threaded inline feedback attached to an artifact for review, reply, and resolution workflows. |
| State Machine | entity | `stateDiagram-v2` workflow graph whose state IDs must align with emitted step names. Parsed into states, transitions, initial states, and terminal states for validation. |
| Knowledge Base | resource | Structured project documentation under `.rp1/context/`, loaded progressively and treated as the repo knowledge source for KB-aware workflows. |
| Platform Tag | entity | Semantic Liquid tag such as `dispatch_agent`, `ask_user`, `edit_model`, or `plan_tool` that the build pipeline renders per host. |
| CanonicalName | entity | Normalized `plugin:artifact` identity used to translate namespaces across Claude Code, OpenCode, and Codex. Expressed as both canonical (`base:guide`) and user-facing (`rp1-base:guide`) forms. |
| Project | entity | Registered workspace identified by `project_id`, resolved via directory walk-up or git worktree common-dir, that defines project, KB, and work roots. |
| Task Queue | entity | Persistent work queue for cross-agent coordination with pending, in-progress, completed, failed, and cancelled states. |
| PR Review | workflow | Map-reduce pull request analysis workflow with CI awareness (GitHub Actions, Buildkite, GitLab), configurable verdict modes, confidence gating, and GitHub integration. |
| Attestation | artifact | Content-addressable evaluation record linking prompt and dependency hashes to pass/fail results per platform (claude-code, opencode, codex). |
| Spatial Analyzer | workflow | KB discovery agent that ranks files and maps repository areas to downstream KB sections. |
| Content Workflow | workflow | Tracked writing workflow that normalizes a request, persists a brief, asks only blocking questions, drafts, reviews, and finalizes a document. |
| Content Brief | artifact | Durable brief artifact that separates verified facts, editorial decisions, open questions, and Q&A history for a writing run. |
| Documentation Synchronization | workflow | Two-pass workflow that discovers user docs, validates KB currency, scans sections, requests one approval gate, and processes updates against KB-backed facts. |
| Scan Results | artifact | Intermediate artifact bridging documentation scan and process phases with KB status, inferred style, per-file section classifications, and errors. |
| Scribe | agent | File-level documentation worker that executes scan or process batches and returns strict JSON-only results. |
| Prompt Authoring Workflow | workflow | Tracked workflow that authors or rewrites prompts, classifies the target, loads companion references, and validates rp1 conventions before review. |
| Prompt Authoring Corpus | resource | On-demand reference set of patterns, templates, and rp1-specific authoring rules used to synthesize terse prompts. |
| Workflow Bootstrap | entity | Auto-injected initialization step for tracked workflows that resolves arguments, resolves or resumes a run, and returns a composite result with arguments, directories, workflow metadata, run identity, and trace context. |
| Discovery Registry | entity | Canonical skill catalog built from frontmatter metadata at build time. Drives `guide/CATALOG.md`, init skill-awareness blocks, `rp1 list --json` enrichment, and ambient suggestion tables from a single source of truth. |
| Guide | skill | Interactive skill-discovery entry point that loads companion catalog and workflow docs, classifies user intent, validates installed skills per host, and offers to invoke recommended skills. |
| Fence Versioning | mechanism | Versioned markers (`<!-- rp1:start v=X.Y.Z -->` / `# rp1:start v=X.Y.Z`) embedded in instruction files (CLAUDE.md, AGENTS.md, .gitignore) that enable staleness detection and guided `rp1 migrate` upgrades. |
| Builder-Reviewer | pattern | Adversarial cooperation architecture where a builder agent implements code and a separate reviewer agent verifies it, with one retry cycle and fail-safe escalation to the user. |
| Stateless Agent | pattern | Interview-style agent whose accumulated state lives in a visible file-based scratch pad rather than conversation context, enabling session-independent resumability. |

## Terminology Glossary

| Term | Meaning |
|------|---------|
| `run-id` | UUID that identifies a workflow execution across status changes, gates, artifacts, and dashboard views. |
| `storageRoot` | Explicit artifact root selector: `work_dir`, `project`, or `absolute`. |
| Namespaced Step | Sub-agent step name prefixed with `agent-name:` to avoid collisions with parent workflow states. Logical step keys collapse the namespace for Arcade grouping. |
| `SKILL.md` | Canonical skill file format with YAML frontmatter and workflow body. |
| Resolve Args | Auto-injected argument-resolution step that merges user input, settings, env fallbacks, and schema defaults for `metadata.arguments`. Returns resolved arguments, canonical directories, and environment. |
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
| `run_policy` | Workflow lifecycle selector: `fresh` always creates a new run; `resumable` matches an existing non-terminal run by `identity_args` values. |
| `identity_args` | Subset of declared skill arguments whose values form the `workIdentity` key for resumable run matching. |
| `workIdentity` | Composite key derived from `identity_args` values, stored on the run record and used to match subsequent invocations to an existing non-terminal run. |
| Skill Category | Nine-value enum (`development`, `investigation`, `quality`, `review`, `documentation`, `knowledge`, `strategy`, `planning`, `prompt`) that classifies skills for catalog grouping and ambient awareness. |
| `is_workflow` | Boolean frontmatter flag distinguishing workflow-orchestrating skills from single-purpose skills. Flows into catalog views and runtime listing. |
| Run Invocation Context | Dashboard-surfaced metadata showing how a run was created: workflow name, run policy, decision (`created_new_run`, `matched_non_terminal_run`, `legacy_backfill_resume`), project identity, and worktree state. |
| Logical Step Key | Collapsed step identifier for dashboard grouping: non-namespaced steps keep their ID; namespaced lifecycle steps collapse to the namespace prefix, optionally suffixed with `::unit`. |
| Fence Marker | Versioned delimiter (HTML comment or shell comment) that brackets rp1-managed content in instruction files for staleness detection and safe upgrade. |
| `LATEST_FENCE_VERSION` | Semver constant shipped with the CLI build; instruction file fence markers are stale when their version is older. |
| Distribution Scope | Catalog classification: `distributable` (base, dev plugins, visible to end users) or `internal` (utils plugin, not in public catalog). |
| ToolResult Envelope | Standard `{ success, tool, data, errors? }` JSON structure wrapping all agent-tool outputs for consistent AI-agent parsing. |
| Confidence Gating | PR review threshold: 65%+ includes a finding; 40-64% triggers investigation for critical/high findings; below 40% excludes. |
| Verdict Mode | PR review submission strategy: `auto` (severity-derived), `approve`, `request_changes`, or `comment`. |

## Key Relationships

| From | Relation | To | Meaning |
|------|----------|----|---------|
| Plugin | contains | Skill | Plugins package user-facing workflows under a namespace. |
| Plugin | contains | Agent | Plugins package focused workers alongside skills. |
| Skill | delegates to | Agent | Skills orchestrate work and hand bounded tasks to agents. |
| Skill | embeds | State Machine | Tracked skills declare workflow states in Mermaid and mirror them with emitted steps. |
| Skill | enrolls in | Discovery Registry | Every skill with `category` and `is_workflow` metadata is collected into the canonical catalog. |
| State Machine | governs | Run | Run progression is validated against declared states and transitions. |
| Run | contains | Event | Runs are materialized through emitted workflow events. |
| Run | produces | Artifact | Workflows register generated files as run artifacts. |
| Run | carries | Run Invocation Context | Dashboard displays how each run was created, resumed, or matched. |
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
| Discovery Registry | generates | Guide | The guide skill loads auto-generated `CATALOG.md` and `WORKFLOWS.md` from registry data. |
| Discovery Registry | generates | Init Templates | The init workflow injects a registry-derived skill-awareness table into instruction files. |
| Workflow Bootstrap | initializes | Run | Bootstrap resolves arguments, resolves directories, and creates or resumes a run in one step. |
| Fence Versioning | gates | Project Migration | Stale fence markers trigger `rp1 migrate` to upgrade instruction file content. |
| Builder-Reviewer | quality-gates | Agent | Builder implements, reviewer verifies, with one retry and user escalation. |

## Bounded Contexts

| Context | Scope | Key Concepts | Boundary |
|---------|-------|--------------|----------|
| Knowledge Management | `rp1-base` | Knowledge Base, Spatial Analyzer, Progressive Disclosure, Bayesian Reconciliation | Owns `.rp1/context` generation and freshness signals; does not directly edit user-facing docs. |
| Documentation Production | `rp1-base` | Content Workflow, Content Brief, Documentation Synchronization, Scan Results, Scribe | Owns user-facing doc creation and KB-backed reconciliation, persisting workflow state in `.rp1/work/`. |
| Prompt Tooling | `rp1-utils` | Prompt Authoring Workflow, Prompt Authoring Corpus, Shell-Safe Formatting | Owns prompt synthesis, rewrite guidance, rp1 authoring conventions, and reusable prompt templates and patterns. |
| Feature Delivery | `rp1-dev` | PR Review, Task Queue, Builder-Reviewer | Owns implementation and review workflows for product changes. |
| Runtime Services | `cli/src` | Project, Run, Event, Workflow Bootstrap, Resolve Args, CLI entrypoints | Owns command registration, runtime detection, agent-tools plumbing, install/update/init flows, and top-level CLI execution. |
| Dashboard | `cli/web-ui` | Arcade, Run, Artifact, Annotation, Run Invocation Context, Notifications | Owns live visualization, feedback threads, run invocation tracing, and waiting-gate visibility for active workflows. |
| Quality Assurance | `evals/` | Attestation | Owns prompt verification and release-gating evidence. |
| Platform Abstraction | build pipeline | Platform Tag, CanonicalName | Owns host-specific rendering and namespace translation so one prompt source can target multiple agent hosts. |
| Discovery | `cli/src/catalog`, `guide` skill | Discovery Registry, Guide, Skill Category, Distribution Scope | Owns the single-source-of-truth skill catalog derived from frontmatter metadata, plus generated catalog views, init awareness blocks, and the interactive guide skill. |
| Project Lifecycle | `cli/src/init`, `cli/src/migrate` | Fence Versioning, Init Wizard, Project Migration | Owns project initialization, instruction-file fencing, staleness detection, and guided migration upgrades. |

## Cross-Cutting Concerns

- **Fact grounding**: Writing workflows use a source hierarchy, treat the KB as the truth source for doc reconciliation, and insert review markers instead of inventing unsupported claims.
- **Explicit human gates**: `waiting_for_user` is emitted before clarification, approval, or stale-KB decisions so pauses are visible in both the host tool and Arcade.
- **Traceable intermediate state**: Resumable intermediates such as `brief.md` and `scan_results.json` persist under `.rp1/work/` instead of living only in prompt context.
- **Style normalization**: Doc-sync infers dominant style once, normalizes to canonical fields such as `list_marker`, and applies them consistently during edits.
- **State and step discipline**: Mermaid states, emitted step names, namespaced sub-agent steps, logical step keys, and terminal completion semantics stay aligned.
- **Configuration resolution**: Typed `metadata.arguments` plus auto-injected `resolve-args` replace manual parameter parsing in tracked skills. Workflow bootstrap unifies argument resolution, directory resolution, and run creation into a single atomic step.
- **Shell-safe prompt rendering**: Prompt-authoring guidance avoids text patterns that would be expanded or misparsed by the shell.
- **Platform portability**: Semantic platform tags and canonical naming let one authored workflow target Claude Code, OpenCode, and Codex without duplicating prompt sources.
- **Single-source discovery**: Skill category, workflow flag, and argument metadata in frontmatter drive all downstream catalog views, avoiding hand-maintained inventory tables that drift.
- **Fence-versioned instruction files**: rp1-managed stanzas in CLAUDE.md, AGENTS.md, and .gitignore carry version markers so the CLI can detect staleness and offer guided upgrades.
- **Standard tool envelope**: All agent-tools return a `ToolResult<T>` JSON envelope (`success`, `tool`, `data`, optional `errors`) for predictable AI-agent parsing.

## Cross-References

- **System topology**: See [architecture.md](architecture.md)
- **Component inventory**: See [modules.md](modules.md)
- **Implementation idioms**: See [patterns.md](patterns.md)
- **Surface behavior**: See [interaction-model.md](interaction-model.md)
