# rp1 - Interaction Model

**Project**: rp1
**Analysis Date**: 2026-06-30
**Surfaces**: CLI, Host Tool Integration, Arcade Web UI, Agent Tools CLI, Agent .md frontmatter, Reference Docs, Init Wizard

## Experience Principles

- **Observable workflows** — long-running skills expose named runs, explicit phase transitions, gate pauses, and registered artifacts.
- **Evidence before questions** — interactive workflows read repo/KB material first and ask only for material-changing decisions.
- **Durable handoffs** — intermediate artifacts are source-of-truth handoffs preserved across review/block/cancel paths.
- **Automation-aware CLI** — machine-friendly modes (`--json`, `--lint`, `hook-json`, `--daemon-only`); build validates agent frontmatter and emits structured errors/warnings without blocking on human input.
- **Fail-fast with actionable diagnostics** — build-time validation surfaces the file, the invalid value, and the allowed set so the agent author can fix without guesswork.
- **Attention-proportional notification** — notifications categorized by attention level with bulk dismiss.
- **Progressive detail disclosure** — secondary metadata (frontmatter, run invocation context) hidden by default, toggled via contextual commands, persisted in sessionStorage.

## Actors & Surfaces

| Actor | Goals | Surfaces |
|-------|-------|----------|
| End user | Execute workflows, monitor runs, review artifacts, give feedback | CLI, Host Tool, Arcade |
| **Agent author** | Set model tier + effort in agent frontmatter; get build-time validation feedback | Agent `.md` frontmatter, `rp1 build`, Agent Tools CLI |
| CI system | Validate/lint, produce JSON build output | `rp1 build --json --lint` |

**Agent `.md` frontmatter** is a declarative configuration surface: authors set `model: deep|standard|fast|inherit` and optional `effort: low|medium|high|xhigh|max`, plus tools/arguments. `rp1 build` resolves and validates these.

## User-Visible States

| State | Meaning | Surfaces |
|-------|---------|----------|
| running / waiting_for_user / completed / failed | Workflow phase lifecycle | Arcade, Host Tool, Agent Tools |
| blocked / cancelled | Unresolved facts; user-stopped (work preserved) | Host Tool |
| kb_stale | KB behind HEAD; continue/rebuild/cancel gate | Host Tool |
| **build_validation_error** | Unknown model tier/effort; build halts that agent, exits 1, lists allowed values | CLI (`rp1 build`) |
| **build_validation_warning** | Valid but sub-optimal (fast+effort, protected-agent downgrade); build continues | CLI (`rp1 build`) |
| connection_status / annotation_status / notification_attention | Arcade live-update + feedback + triage signals | Arcade |

## Feedback Loops

- **Workflow gate** — emit `waiting_for_user` → Arcade pause + host-tool prompt → answer resumes/revises/cancels.
- **Artifact registration** — emit `artifact_registered` with `storageRoot` → Arcade resolves and shows the file.
- **Annotation feedback** — user annotates/edits in Arcade → runtime persists → agents read via `feedback read` → replies update UI over WS.
- **Notification lifecycle** — events produce deduplicated notifications; toasts auto-dismiss (6s); sidebar groups by attention.
- **Build-time tier & effort validation** — `rp1 build` parses frontmatter → `validateAgentTierAndEffort` (errors halt with file+allowed values; warnings print to stderr and continue) → `resolveTier`/`resolveEffort` → platform-native config emitted.
- **Emit-driven run projection / snapshot reconciliation / recovery fallback** — Arcade reduces events into `LiveRunIndex`, reconnects with saved cursor, and falls back to REST when replay is impossible.

## Cross-Surface Deltas

- **Model tier resolution** — same abstract tier resolves to different vendor IDs per platform (CC: opus/sonnet/haiku; Codex: o3/o4-mini/gpt-4.1-nano; OpenCode/Antigravity: Anthropic names; Gemini: gemini-2.5-pro/flash; Copilot: tiering omitted). `inherit` emits no model field anywhere (backward compatible).
- **Effort field resolution** — CC emits `effort` (5 levels); Codex emits `model_reasoning_effort` (clamped to 3); OpenCode emits `reasoningEffort` for OpenAI-provider models (clamped), omits for Anthropic/unknown; Antigravity/Gemini/Copilot omit; fast tier always omits.
- **Agent template output format** — CC/OpenCode emit YAML frontmatter; Codex emits TOML; all three conditionally omit model (inherit) and effort (undefined/unsupported).
- **Plugin install** — CC uses MCP registration; OpenCode copies filesystem artifacts; Codex uses its own path.
- **Execution vs observability** — host tools do the work; Agent Tools carry protocol; Arcade shows passive status.

## Accessibility & Discoverability

Keyboard-first Arcade (roving tabindex, single-key suppression during text entry, reduced-motion fallback, ARIA labels + live regions); named emits + state-machine-aligned steps give meaningful dashboard labels; namespaced sub-agent steps avoid timeline collisions.

## Related KB

- Surfaces map to `architecture.md` layers · build internals in `modules.md` · conventions in `patterns.md`
