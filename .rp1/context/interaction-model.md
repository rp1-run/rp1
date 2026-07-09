# rp1 - Interaction Model

**Project**: rp1
**Analysis Date**: 2026-07-08
**Surfaces**: CLI, Host Tool Integration, Arcade Web UI, Agent Tools CLI, Agent .md frontmatter, Settings Configuration, Reference Docs, Init Wizard

## Experience Principles

- **Observable workflows** — long-running skills expose named runs, explicit phase transitions, gate pauses, and registered artifacts.
- **Evidence before questions** — interactive workflows read repo/KB material first and ask only for material-changing decisions.
- **Durable handoffs** — intermediate artifacts are source-of-truth handoffs preserved across review/block/cancel paths.
- **Automation-aware CLI** — machine-friendly modes (`--json`, `--lint`, `hook-json`, `--daemon-only`, `--dry-run`, `--preset`); build and settings emit structured errors/warnings without blocking on human input.
- **Fail-fast with actionable diagnostics** — build-time and settings validation surface the file, the invalid value, and the allowed set so the author can fix without guesswork.
- **Non-blocking degradation** — optional post-install steps (tier remapping re-apply, protected-agent warnings, cache refresh) log diagnostics but never interrupt the primary workflow.
- **Attention-proportional notification** — notifications categorized by attention level with bulk dismiss.
- **Progressive detail disclosure** — secondary metadata hidden by default, toggled via contextual commands, persisted in sessionStorage.
- **Storage-mode transparency** — agents and skills reference KB/work directories via resolver variables (`{kbRoot}`/`{workRoot}` in skills; `{KB_ROOT}`/`{WORK_ROOT}` in agent arguments), never assuming physical locations; enables storage-mode redirection without prompt changes (lint L014 enforces).

## Actors & Surfaces

| Actor | Goals | Surfaces |
|-------|-------|----------|
| End user | Execute workflows, monitor runs, review artifacts, give feedback, control model cost/capability trade-offs | CLI, Host Tool, Arcade, `settings.toml` |
| Agent author | Set model tier + effort in agent frontmatter; declare `KB_ROOT`/`WORK_ROOT` argument variables; get build-time validation feedback | Agent `.md` frontmatter, `rp1 build`, Agent Tools CLI |
| CI system | Validate/lint, produce JSON build output | `rp1 build --json --lint` |

**Agent `.md` frontmatter**: authors set `model: frontier|deep|standard|fast|inherit` and optional `effort: low|medium|high|xhigh|max`. **Settings configuration** (`~/.config/rp1/settings.toml` user, `.rp1/settings.toml` project): users declare `[models]` presets or per-platform tier remappings that override build defaults without rebuilding.

## User-Visible States

| State | Meaning | Surfaces |
|-------|---------|----------|
| running / waiting_for_user / completed / failed | Workflow phase lifecycle | Arcade, Host Tool, Agent Tools |
| blocked / cancelled | Unresolved facts; user-stopped (work preserved) | Host Tool |
| kb_stale | KB behind HEAD; continue/rebuild/cancel gate | Host Tool |
| build_validation_error | Unknown model tier/effort; build halts that agent, exits 1, lists allowed values | CLI (`rp1 build`) |
| build_validation_warning | Valid but sub-optimal (fast+effort, protected-agent downgrade); build continues | CLI (`rp1 build`) |
| settings_validation_error | Invalid TOML syntax or tier remapping semantics (bad preset, platform, model ID); `settings validate` exits 1 | CLI (`rp1 settings validate`) |
| tier_remapping_applied | Agent artifacts rewritten per user mapping; count reported; idempotent re-run reports "already up to date" (distinct from "nothing matched") | CLI (`rp1 settings apply`, `rp1 update`) |
| connection_status / annotation_status / notification_attention | Arcade live-update + feedback + triage signals | Arcade |
| init step running / waiting_for_user / completed / failed / skipped | Init wizard step lifecycle; prompts (git-root, reinit, ancestor-project, gitignore preset) pause the step until the user chooses, then it re-executes | Init wizard UI, activity feed |
| settings_created / settings_preserved | Init settings-setup created global/local `settings.toml` from template, or found existing files and left them untouched | Init wizard activity feed |

## Feedback Loops

- **Workflow gate** — emit `waiting_for_user` → Arcade pause + host-tool prompt → answer resumes/revises/cancels.
- **Artifact registration** — emit `artifact_registered` with `storageRoot` → Arcade resolves and shows the file.
- **Annotation feedback** — user annotates/edits in Arcade → runtime persists → agents read via `feedback read` → replies update UI over WS.
- **Notification lifecycle** — events produce deduplicated notifications; toasts auto-dismiss (6s); sidebar groups by attention.
- **Build-time tier & effort validation** — `rp1 build` parses frontmatter → `validateAgentTierAndEffort` (errors halt with file+allowed values; warnings continue) → `resolveTier`/`resolveEffort` → platform-native config emitted.
- **Settings tier remapping apply** — `rp1 settings apply` (or `rp1 update` auto-reapply) loads config/preset → validates semantics → discovers installed agents → rewrites model/effort fields → reports modified count + effort adjustments + protected-agent warnings. `--dry-run` previews.
- **Storage-mode-aware directory resolution** — `rp1 agent-tools rp1-root-dir` returns `kbRoot`/`workRoot` respecting the active storage mode; skills receive resolved paths via workflow-bootstrap/resolve-args; agents receive them as dispatch arguments. Paths may resolve outside the project tree under non-default modes.
- **Emit-driven run projection / snapshot reconciliation** — Arcade reduces events into `LiveRunIndex`, reconnects with saved cursor, falls back to REST when replay is impossible.
- **Init wizard activity timeline** — `rp1 init` runs 11 ordered steps (registry → git-check → reinit-check → directory-setup → settings-setup → tool-detection → instruction-injection → gitignore-config → install-check → health-check → summary); each emits timestamped activities (info/success/warning/error). Plugin-install failures and health-check misses log as warnings, never fail the wizard. `--yes` applies non-interactive defaults; `--force-nested` bypasses the ancestor-project prompt.

## Cross-Surface Deltas

- **Model tier resolution** — same abstract tier resolves to different vendor IDs per platform (CC: fable/opus/sonnet/haiku; Codex: gpt-5.5/gpt-5.4/gpt-5.4-mini; Antigravity: gemini-3.1-pro/gemini-3.5-flash; OpenCode/Copilot: tiering omitted → inherit). `inherit` emits no model field anywhere.
- **Effort field resolution** — CC emits `effort` (5 levels); Codex emits `model_reasoning_effort` (`max` clamps to `xhigh`); OpenCode/Copilot/Antigravity omit; fast tier always omits. Settings rewriter strips effort when a remap lands on a fast-class model.
- **Tier remapping scope** — `settings apply` rewrites only CC (.md frontmatter) and Codex (.toml) artifacts; other platforms lack per-agent model fields in installed artifacts (validator warning coverage for antigravity is a known gap — it currently no-ops silently).
- **Agent template output format** — CC/OpenCode emit YAML frontmatter; Codex emits TOML; all conditionally omit model (inherit) and effort (unsupported).
- **Plugin install** — CC uses MCP registration; OpenCode copies filesystem artifacts; Codex uses its own path; Antigravity uses generated workflow assets. Gemini platform retired.
- **Execution vs observability** — host tools do the work; Agent Tools carry protocol; Arcade shows passive status.

## Accessibility & Discoverability

Keyboard-first Arcade (roving tabindex, single-key suppression during text entry, reduced-motion fallback, ARIA labels + live regions); named emits + state-machine-aligned steps give meaningful dashboard labels; namespaced sub-agent steps avoid timeline collisions.

## Related KB

- Surfaces map to `architecture.md` layers · build/settings internals in `modules.md` · conventions in `patterns.md`
