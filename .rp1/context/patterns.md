# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-07-03

## Naming & Organization

- Feature-scoped directories (`cli/src/commands/`, `cli/src/build/`, `cli/src/settings/`); prompt assets use kebab-case skill folders with `SKILL.md`.
- CLI camelCase verbs; React hooks prefix `use`; error factories match their `_tag` (`usageError`, `runtimeError`).
- Parameters UPPER_SNAKE_CASE (`/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/`); relative TS imports keep `.js` suffixes; web-ui uses `@/`; CSS classes use `rp1-` prefix to avoid Tailwind collisions.

## Type & Data Modeling

- **Enum tables**: string-literal unions with parallel `VALID_*` arrays for build-time validation — `ModelTier`/`VALID_MODEL_TIERS`, `EffortLevel`/`VALID_EFFORT_LEVELS`, `SkillCategory`, `WorkflowRunPolicy`, `Status`, `EventType`.
- Discriminated unions: `_tag` on `CLIError`, `type` on `EventPayload`.
- `readonly` + `Readonly<Record<...>>` + `as const` throughout; persisted artifacts are source-of-truth snapshots.
- **Tier abstraction**: abstract tier aliases (frontier/deep/standard/fast/inherit) decoupled from vendor model IDs via the centralized `TIER_MODEL_MAP` — single update point on vendor model releases. `PROTECTED_AGENTS` + `TIER_RANK` guard reasoning-critical agents from accidental downgrade. Compile-time safety: `Exclude<ModelTier, "inherit">` keys on `TIER_MODEL_MAP` and `TIER_RANK` force compile errors if a tier is added without mappings.
- **Build-to-install metadata chain**: `BundleAgentEntry` extends `BundleAssetEntry` with optional `tier`/`effort`, preserved through bundle manifests → `generate-asset-imports.ts` → `EMBEDDED_MANIFEST`, so install-time remapping works from the compiled binary without source frontmatter.

## Error Handling

- Returns `Either`/`TaskEither<CLIError, A>`; formatted once at the CLI boundary via `formatError`; `tryCatchTE` wraps async.
- Parent skills gate on hard failures; batch workflows tolerate partial success. L1 (syntax) then L2 (schema) validation staging.
- **Warnings vs errors**: `validateAgentTierAndEffort` and `validateTierRemappings` return `{errors[], warnings[]}` — errors halt processing, warnings emit advisories (fast-tier effort, protected-agent downgrade, unsupported platform).
- **Non-blocking degradation**: optional post-update steps (tier remapping re-apply, plugin cache refresh) wrap in try/catch, surface warnings, and never abort the parent lifecycle.

## Validation & Boundaries

- **Additive-field propagation**: a new frontmatter field flows `parser → model interface → validator → tier-resolution → template context → Liquid templates` without breaking existing paths. Established for `arcadeTracked`; extended identically for `model` (ModelTier) and `effort` (EffortLevel).
- Each definition validated field-by-field with early return on first error.
- **Single-source validation sets**: settings validator imports shared helpers (`getValidModelIdsForPlatform`, `modelSupportsEffort`, `getPlatformsWithModelSupport`) from `tier-resolution.ts` — no separate allowlists; derive runtime sets from canonical maps (e.g. `TIER_KEYS` from `VALID_MODEL_TIERS`) instead of hand-copying.

## Build Pipeline

- **Tier resolution**: `resolveTier` maps tier→platform model ID via `TIER_MODEL_MAP` (null for `inherit`/unmapped). `resolveEffort` returns a platform-specific `{fieldName, value}` — `effort` (Claude Code, 5 levels), `model_reasoning_effort` (Codex, `max` clamps to `xhigh`); omits for fast tier and platforms without effort support (OpenCode, Copilot, Antigravity).
- **Install-time tier remapping (late binding)**: user `settings.toml` `[models]`/`[models.<platform>]` sections (or presets budget/standard/premium) drive `rp1 settings apply`: load → validate → discover agents from the embedded manifest → rewrite installed artifacts (CC YAML frontmatter, Codex TOML targeted line replacement) → report modified/already-current counts. `rp1 update` re-applies automatically. Idempotent: rewriter reports `modified=false` when target equals current.
- **LiquidJS whitespace control (CRITICAL)**: production engine (`template-engine.ts`) uses `greedy:true`. Golden-file tests MUST replicate the identical config — config drift lets whitespace bugs ship undetected. Use `{%- endif %}` (no trailing dash) when a newline separator must survive. Gate optional fields on `model != "inherit"` / `effortValue` so opt-out output is byte-identical to legacy.
- **Script entrypoint guard**: `cli/scripts/` executables wrap top-level execution in `if (import.meta.main)` so test imports of exported functions are side-effect-free.
- **fp-ts pipeline**: `pipe(loadConfig, TE.fromEither, TE.chain(...))`; prefer clear `map`/`flatMap`/`isLeft` over abstractions.

## Observability

- consola logger with `--verbose`/`--trace` levels; daemon appends structured NDJSON to `daemon.log`; `runId`/`projectId`/source IDs correlate events and notifications.

## Testing Idioms

- Tests under `cli/src/__tests__/` mirror feature areas with shared helpers (temp dirs, env save/restore, Either/TaskEither unwrap).
- **Golden-file tests** validate rendered template output; the test Liquid engine config MUST match production (`greedy:true`) or whitespace bugs ship undetected.
- **Hermetic settings tests**: any code path reading `~/.config/rp1/settings.toml` accepts an optional `globalSettingsPath` injection seam (`loadAllArgumentDefaults`, `loadTierRemappings`, `resolveConfig`); tests point it at an isolated nonexistent path so real developer config never leaks into assertions. Contract tests guard shape parity between `BundleAgentEntry` and the embedded manifest generator.
- Evals share assertions under `evals/suites/shared/`.

## I/O & Integration

- SQLite via `bun:sqlite` (runs, events, artifacts, annotations, notifications); upsert + source dedup.
- Atomic writes via temp-file + rename (registry); PID file mode `0o600`.
- `rp1 agent-tools emit` persists canonical events; daemon relays project-scoped WS envelopes. File artifacts keep `path`+`storageRoot`; URL artifacts register as `type: link` with deterministic identity (only curated run-output links).
- **Directory-scoped I/O**: code edits resolve against `codeRoot` (worktree-aware); work/KB reads use `workRoot`/`kbRoot` (canonical `.rp1/`).

## Concurrency & Async

- `withRegistryLock` async mutex serializes registry read-modify-write; functional state updaters dedup concurrent WS toasts; heavy subsystems (daemon, LiquidJS) loaded via dynamic `import()` and excluded from the compiled binary.
- **Module-level cache with explicit reset**: settings loader caches parsed TOML per invocation lifetime; `resetSettingsCache()` exists solely for test isolation.
- **Directory-based file lock**: parallel task-builders serialize shared task-file updates via `mkdir .task-file.lock` atomicity (sleep-poll on contention, always release).

## Dependency Injection & Configuration

- **Optional-parameter seams**: `ApplyDeps` interface injects `readFile`/`writeFile`/`fileExists`/`refreshClaudeCodePlugins` with `DEFAULT_DEPS` production binding; `globalSettingsPath` threads through loader/apply for isolation.
- **TOML settings, two-level merge**: project `.rp1/settings.toml` > user `~/.config/rp1/settings.toml`, per key for both `[arguments.*]` and `[models.*]`; loader normalizes lower-kebab → UPPER_SNAKE. Blessed presets (`presets.ts`) provide complete tier-to-model profiles that explicit overrides supersede.

## Extension Mechanisms

- Commands via `program.addCommand` in `main.ts`; agent tools via `registerTool()`; build templates per-platform under `templates/<platform>/` with registered lint rules + filters; state machines via `stateDiagram-v2` with auto-skip/auto-complete.

## Related KB

- Components: `modules.md` · System design: `architecture.md` · Concepts: `concept_map.md`
