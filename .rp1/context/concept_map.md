# Domain Concepts & Terminology

**Project**: rp1
**Domain**: AI agent orchestration, tracked workflow authoring, and developer tooling

## Core Concepts

| Concept | Type | Description |
|---------|------|-------------|
| Plugin | entity | Capability pack (`rp1-base`, `rp1-dev`, `rp1-utils`) grouping skills and agents under a namespace with enforced dependency direction |
| Skill | entity | User-facing workflow entry point defined by `SKILL.md` with typed arguments, optional state machine, event emission, and platform-tagged behavior. Declares `metadata.category` and `metadata.is_workflow` for discovery registry enrollment |
| Agent | entity | Focused worker receiving pre-resolved parameters (including path variables like `KB_ROOT`, `WORK_ROOT`) from a parent skill for bounded single-pass execution |
| Run | entity | Tracked workflow execution identified by `run-id`, governed by `run_policy` (fresh/resumable), advanced through explicit step and status events. Resumable runs carry `workIdentity` for identity-based matching |
| Event | entity | Typed record emitted against a run: `status_change`, `artifact_registered`, `annotation_updated`, `waiting_for_user`, `btw_update`, `subflow_registered` |
| Artifact | artifact | Registered output file with explicit `storageRoot` routing (project, work_dir, absolute). Types: markdown, code, diagram, diff, report, other |
| Annotation | entity | Threaded inline feedback on an artifact for review, reply, and resolution. Anchored by text-selection, hidden-anchor, or line-based positions |
| State Machine | entity | Mermaid `stateDiagram-v2` workflow graph whose state IDs must align with emitted step names. Parsed for validation |
| Knowledge Base | resource | Structured project docs accessed via the resolved `{KB_ROOT}` variable (defaults to `.rp1/context/`; may resolve elsewhere under non-default storage modes), loaded progressively as the repo knowledge source |
| Platform Tag | entity | Semantic Liquid tag (`dispatch_agent`, `ask_user`, `edit_model`, `plan_tool`) rendered per host by the build pipeline |
| CanonicalName | entity | Normalized `plugin:artifact` identity translating namespaces across Claude Code, OpenCode, and Codex |
| Project | entity | Registered workspace identified by `project_id`, resolved via directory walk-up or git worktree common-dir |
| Task Queue | entity | Persistent work queue for cross-agent coordination with pending, in-progress, completed, failed, and cancelled states |
| Notification | entity | System-generated message surfaced in Arcade, triggered by run status changes (completed/failed) or `waiting_for_user` events. Deduplicated per source |
| Workflow Bootstrap | entity | Auto-injected initialization step resolving arguments, directories (`projectRoot`, `kbRoot`, `workRoot`, `codeRoot` via storage-mode-aware `rp1-root-dir`), and run identity in one atomic call |
| Discovery Registry | entity | Canonical skill catalog built from frontmatter at build time. Drives CATALOG.md, init awareness blocks, `rp1 list --json`, and ambient suggestions |
| Arcade Tracked | mechanism | Optional `metadata.arcade_tracked` boolean controlling Activity feed visibility without disabling workflow mechanics |
| Platform Definition | entity | Data-driven build configuration capturing platform-varying behavior. Supported platforms: claude-code, opencode, codex, copilot, antigravity |
| Subflow | entity | Nested workflow registered within a parent run via `subflow_registered` event type |
| ModelTier | entity | Abstract model alias (`frontier`, `deep`, `standard`, `fast`, `inherit`) declared in agent frontmatter, decoupling agents from vendor model IDs. Ordered by `TIER_RANK` (frontier=3, deep=2, standard=1, fast=0); `inherit` unranked (session model). Resolved at build time via `TIER_MODEL_MAP` |
| EffortLevel | entity | Reasoning-depth control (`low`, `medium`, `high`, `xhigh`, `max`) declared independently of tier. Resolved to platform-specific field names at build time; incompatible with the fast tier |
| TIER_MODEL_MAP | mechanism | Exported resolution dictionary mapping each tier (frontier/deep/standard/fast) to concrete model IDs for Claude Code, Codex, and Antigravity (OpenCode/Copilot omitted — no per-agent tiering). Single source of truth for build AND install-time remapping |
| TIER_RANK | mechanism | Ordered numeric rank for tier comparison. Used by protected-agent downgrade checks at build and remap time — compares capability level, not name equality |
| Protected Agents | mechanism | Set of 14 reasoning-critical agents (feature-architect, phase-planner, security-validator, pr-sub-reviewer, task-reviewer, …) that must stay at or above deep. Build and remapping warn (never block) on downgrade |
| BundleAgentEntry | entity | Bundle asset entry extended with optional tier/effort metadata, carried through manifests and the embedded manifest so install-time remapping needs no source frontmatter |
| TierRemappingConfig | entity | User-declared remapping from `settings.toml` `[models]`: optional preset name + per-platform `[models.<platform>]` tier overrides (explicit entries beat preset values) |
| Preset | entity | Blessed tier-to-model profile (`budget`, `standard`, `premium`) for CC + Codex. Budget = fast-class everywhere; standard = deep collapses to sonnet-class; premium = build defaults |
| Artifact Rewriter | mechanism | Pure-function module rewriting installed agent artifacts per remapping: CC YAML frontmatter, Codex TOML line replacement; strips effort on fast-class remaps; warns on protected downgrades |
| Task File Lock | mechanism | Directory-based lock (`mkdir .task-file.lock`) serializing concurrent task-file updates during parallel builder execution |
| ArcadeSettings | entity | User-configurable Arcade UI preferences from `settings.toml` `[arcade]`: `theme` (light/dark/system, validated against `VALID_ARCADE_THEMES`) + `[arcade.downsampling]` `thresholdHours`. Defaults: system theme, 24h threshold |
| Settings Migration | mechanism | Automated legacy `settings.json` → canonical `settings.toml` conversion (arcade fields) at both global and project paths. Runs inside `rp1 migrate` and as daemon grace fallback; dry-run support; originals renamed `.migrated` for audit trail; idempotent merge never overwrites existing TOML keys |
| Path Variable | mechanism | Parameterized directory placeholder declared in agent/skill frontmatter (`KB_ROOT`, `WORK_ROOT`, `CODE_ROOT`) and interpolated at dispatch time, decoupling prompt logic from storage layout. Two naming layers: UPPER_SNAKE in agent arguments, camelCase (`kbRoot`/`workRoot`) in skill dispatch blocks |

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
| Resolve Args | Auto-injected argument-resolution step merging user input, settings, env fallbacks, and schema defaults; also resolves directory paths (`kbRoot`, `workRoot`) via `rp1-root-dir` |
| Storage Mode | Abstraction in `rp1-root-dir` letting `kbRoot`/`workRoot` resolve to non-default locations outside the project tree. Default: local (subdirectories of `projectRoot`) |
| codeRoot | Worktree-aware source directory from `rp1-root-dir`: the worktree path in git-worktree contexts, otherwise `projectRoot`. Used by code-writing agents |
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
| Model Tier | Abstract alias for agent model selection. `frontier` = maximum-capability (fable on CC), `deep` = frontier reasoning (opus), `standard` = capable general-purpose (sonnet), `fast` = cheapest single-pass (haiku), `inherit` = session model (default) |
| Effort Level | Reasoning-depth control independent of tier: `low`–`max`. Omitted for fast tier. Field names: `effort` (CC, all 5 levels), `model_reasoning_effort` (Codex, `max` clamps to `xhigh`) |
| Tier Resolution | Build-time mapping of ModelTier + platform → concrete model ID via `TIER_MODEL_MAP`, and EffortLevel + platform → field name/value via `resolveEffort()` |
| Tier Remapping | Install-time process applying `[models]` settings to rewrite installed agent artifacts without rebuilding: load → validate → discover via bundle metadata → rewrite → report. Idempotent (re-runs report "already up to date") |
| RemappableTier | Preset-exposed tier subset: `deep`, `standard`, `fast` (`frontier` and `inherit` excluded from presets) |
| Effort Clamping | Codex-specific `max` → `xhigh` mapping (Codex supports four levels); CC supports all five natively |
| Hermetic Settings Seam | Optional `globalSettingsPath` parameter on settings loaders/resolvers isolating tests from real `~/.config/rp1/settings.toml` |

## Relationships

```text
Plugin ──contains──> Skill, Agent
Skill ──delegates to──> Agent
Skill ──embeds──> State Machine
Skill ──enrolls in──> Discovery Registry
State Machine ──governs──> Run
Run ──contains──> Event
Run ──produces──> Artifact
Run ──triggers──> Notification
Artifact ──anchors──> Annotation
Knowledge Base ──grounds──> Documentation Synchronization
Workflow Bootstrap ──initializes──> Run
Platform Definition ──configures──> Build Template Context
Discovery Registry ──generates──> Guide, Init Wizard
Attestation ──validates──> Skill
ModelTier ──classifies──> Agent (14 deep, 33 standard, 5 fast; frontier unused by default)
TIER_MODEL_MAP ──resolves──> ModelTier (abstract tier → platform model ID)
TIER_RANK ──orders──> ModelTier (frontier > deep > standard > fast)
EffortLevel ──tunes──> Agent (optional reasoning-depth control)
Protected Agents ──constrains──> ModelTier (rank-based warning on downgrade below deep)
BundleAgentEntry ──feeds──> Artifact Rewriter (build-time metadata → install-time rewriting)
TierRemappingConfig ──configures──> Artifact Rewriter (user settings drive substitutions)
Preset ──provides defaults for──> TierRemappingConfig (explicit overrides supersede)
Task File Lock ──protects──> Task Queue (serializes concurrent task-file writes)
Workflow Bootstrap ──resolves──> Path Variable (kbRoot/workRoot/codeRoot from rp1-root-dir → dispatch parameters)
Path Variable ──locates──> Knowledge Base (KB_ROOT resolves the storage-mode-aware KB directory)
```

## Agent Patterns

| Pattern | Context | Application |
|---------|---------|-------------|
| Constitutional Prompting | All agent execution | Expert knowledge, codebase context, anti-loop directives, and output contracts in structured markdown |
| Map-Reduce | KB generation, PR review | Spatial analyzer maps work to parallel units; orchestrator reduces results |
| Skill-Agent Delegation | All workflow entry points | Skill interprets request, loads context, delegates bounded work to agents |
| Builder-Reviewer | Feature implementation | Builder implements, reviewer verifies; one retry cycle with user escalation |
| Single-Dispatch Interview | Blueprint/bootstrap interviews | One logical interview phase per agent with three topologies: Claude Code direct interaction with same-agent continuation; Codex parent relay continuing the same agent via `followup_task`; OpenCode/Copilot/Antigravity fresh parent-mediated re-dispatch with durable checkpoint recovery. All relay harnesses (Codex, OpenCode, Copilot, Antigravity) yield `needs_input` envelopes; sections written incrementally, resume via `_TBD_` gap analysis |
| Data-Driven Platform Build | Multi-platform artifacts | PlatformDefinition entries capture all platform-varying behavior |
| Notification Auto-Generation | Emit pipeline | Status changes and waiting_for_user events auto-generate deduplicated notifications |
| Build-Time Tier Resolution | Agent build pipeline | Frontmatter declares abstract tier + effort; `resolveTier()`/`resolveEffort()` map to platform specifics before rendering. Templates stay format-only |
| Install-Time Tier Remapping | User model settings | Build embeds tier metadata in `BundleAgentEntry`; settings.toml overrides rewrite installed artifacts without rebuilding. Preset → validate → discover → rewrite → report |
| Generator-Verifier Asymmetry | Agent classification | Generator agents (task-builder) run at standard tier because deep-tier verifiers (task-reviewer) validate their output — quality preserved, cost reduced |
| Directory-Based File Lock | Parallel task-builder execution | `mkdir` atomicity serializes concurrent read-modify-write on shared task files; sleep-poll on contention; always release |
| Variable-Based Path Interpolation | All agent and skill dispatch | Skills resolve `{kbRoot}`/`{workRoot}` via workflow-bootstrap; agents receive `{KB_ROOT}`/`{WORK_ROOT}` as frontmatter arguments. No literal path references — enables storage-mode redirection without prompt changes |

## Bounded Contexts

| Context | Scope | Key Concepts |
|---------|-------|-------------|
| Knowledge Management | rp1-base | Knowledge Base, Spatial Analyzer, Progressive Disclosure |
| Documentation Production | rp1-base | Content Workflow, Documentation Synchronization, Scribe |
| Prompt Tooling | rp1-utils | Prompt Authoring Workflow, Shell-Safe Formatting |
| Feature Delivery | rp1-dev | PR Review, Task Queue, Builder-Reviewer, Task File Lock |
| Runtime Services | cli/src | Project, Run, Event, Workflow Bootstrap, Notification |
| Dashboard | cli/web-ui | Arcade, Artifact, Annotation, Run Invocation Context |
| Platform Abstraction | build pipeline | Platform Tag, CanonicalName, Platform Definition, ModelTier, EffortLevel, Tier Resolution, TIER_RANK |
| Model Settings | cli/src/settings | TierRemappingConfig, Preset, Artifact Rewriter, BundleAgentEntry, Install-Time Tier Remapping, ArcadeSettings |
| Discovery | cli/catalog | Discovery Registry, Guide, Skill Category, Arcade Tracked |
| Project Lifecycle | cli/init, cli/migrate | Fence Versioning, Init Wizard, Project Migration, Settings Migration |
| Quality Assurance | evals/ | Attestation |
| Storage Resolution | cli/src/agent-tools, build pipeline | Path Variable, Storage Mode, codeRoot, rp1-root-dir |

## Cross-Cutting Concerns

- **Fact grounding**: Writing workflows use source hierarchy with KB as truth source
- **Human gates**: `waiting_for_user` emitted before prompts, visible in host tool and Arcade
- **Traceable state**: Intermediates (`brief.md`, `scan_results.json`) persist under `.rp1/work/`
- **State discipline**: Mermaid states, emitted steps, namespaced sub-agent steps, and logical step keys stay aligned
- **Configuration resolution**: `resolve-args` + `workflow-bootstrap` unify argument, directory, and run creation; `rp1-root-dir` provides storage-mode-aware path resolution; `settings.toml` layers (global, project) with preset and per-platform overrides for model tier remapping
- **Storage-agnostic path resolution**: all prompts reference directories via path variables resolved at dispatch time, never hardcoded; build lint L014 enforces (no literal `rp1-root-dir` calls in parameterized skills)
- **Platform portability**: Semantic tags, data-driven definitions, and tier resolution let one prompt target 5 hosts with appropriate model and effort settings
- **Single-source discovery**: Frontmatter metadata drives all catalog views, avoiding drift
- **Standard tool envelope**: All agent-tools return `ToolResult<T>` JSON for predictable AI-agent parsing
- **Concurrent task safety**: Directory-based file locks protect shared task-file updates during parallel builder execution
