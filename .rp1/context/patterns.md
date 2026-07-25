# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-07-25

## Naming & Organization

- Feature-scoped directories (`cli/src/commands/`, `cli/src/build/`, `cli/src/settings/`); prompt assets use kebab-case skill folders with `SKILL.md`.
- CLI camelCase verbs; React hooks prefix `use`; error factories match their `_tag` (`usageError`, `runtimeError`).
- Parameters UPPER_SNAKE_CASE (`/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/`); relative TS imports keep `.js` suffixes; web-ui uses `@/`; CSS classes use `rp1-` prefix to avoid Tailwind collisions.
- **Path variables (two-tier)**: skills reference project directories via `{kbRoot}`/`{workRoot}` (camelCase, from resolve-args/bootstrap); agents declare `KB_ROOT`/`WORK_ROOT` as UPPER_SNAKE frontmatter arguments. Dispatch blocks bridge the tiers with `KB_ROOT={kbRoot}` token syntax. Never hardcode literal `.rp1/context` or `.rp1/work` paths in prompts.

## Type & Data Modeling

- **Enum tables**: string-literal unions with parallel `VALID_*` arrays for build-time validation — `ModelTier`/`VALID_MODEL_TIERS`, `EffortLevel`/`VALID_EFFORT_LEVELS`, `SkillCategory`, `WorkflowRunPolicy`, `Status`, `EventType`, `StorageMode`/`VALID_STORAGE_MODES`, `ArcadeTheme`/`VALID_ARCADE_THEMES`, `PresetName`/`VALID_PRESET_NAMES`.
- Discriminated unions: `_tag` on `CLIError` and `AnnotationServiceError`, `type` on `EventPayload`.
- `readonly` + `Readonly<Record<...>>` + `as const` throughout; persisted artifacts are source-of-truth snapshots.
- **Tier abstraction**: abstract tier aliases (frontier/deep/standard/fast/inherit) decoupled from vendor model IDs via the centralized `TIER_MODEL_MAP` — single update point on vendor model releases. `PROTECTED_AGENTS` + `TIER_RANK` guard reasoning-critical agents from accidental downgrade. Compile-time safety: `Exclude<ModelTier, "inherit">` keys on `TIER_MODEL_MAP` and `TIER_RANK` force compile errors if a tier is added without mappings.
- **Build-to-install metadata chain**: `BundleAgentEntry` extends `BundleAssetEntry` with optional `tier`/`effort`, preserved through bundle manifests → `generate-asset-imports.ts` → `EMBEDDED_MANIFEST`, so install-time remapping works from the compiled binary without source frontmatter.

## Error Handling

- Returns `Either`/`TaskEither<CLIError, A>`; formatted once at the CLI boundary via `formatError`; `tryCatchTE` wraps async.
- Parent skills gate on hard failures; batch workflows tolerate partial success. L1 (syntax) then L2 (schema) validation staging.
- **Warnings vs errors**: `validateAgentTierAndEffort` and `validateTierRemappings` return `{errors[], warnings[]}` — errors halt processing, warnings emit advisories (fast-tier effort, protected-agent downgrade, unsupported platform).
- **Non-blocking degradation**: optional post-update steps (tier remapping re-apply, plugin cache refresh) wrap in try/catch, surface warnings, and never abort the parent lifecycle.
- **Comment-preserving TOML writes**: `rewriter.ts`, `arcade-writer.ts`, and `harness-writer.ts` use targeted line edits with regex-based section boundary detection (`findSectionRange` over `ANY_TABLE_HEADER_RE`) to append/merge TOML sections without disturbing existing comments or formatting; full-file serialization is avoided because `smol-toml` is parse-only.

## Validation & Boundaries

- **Additive-field propagation**: a new frontmatter field flows `parser → model interface → validator → tier-resolution → template context → Liquid templates` without breaking existing paths. Established for `arcadeTracked`; extended identically for `model` (ModelTier) and `effort` (EffortLevel).
- Each definition validated field-by-field with early return on first error.
- **Single-source validation sets**: settings validator imports shared helpers (`getValidModelIdsForPlatform`, `modelSupportsEffort`, `getPlatformsWithModelSupport`) from `tier-resolution.ts` — no separate allowlists; derive runtime sets from canonical maps (e.g. `TIER_KEYS` from `VALID_MODEL_TIERS`) instead of hand-copying.
- **Build lint L014**: parameterized skills must not mention `rp1-root-dir` literally — directory resolution comes from the auto-injected Resolve Arguments section; the lint rule fails the build otherwise.

## Build Pipeline

- **Tier resolution**: `resolveTier` maps tier→platform model ID via `TIER_MODEL_MAP` (null for `inherit`/unmapped). `resolveEffort` returns a platform-specific `{fieldName, value}` — `effort` (Claude Code, 5 levels), `model_reasoning_effort` (Codex, `max` clamps to `xhigh`); omits for fast tier and platforms without effort support (OpenCode, Copilot, Antigravity).
- **Install-time tier remapping (late binding)**: user `settings.toml` `[models]`/`[models.<platform>]` sections (or presets budget/standard/premium) drive `rp1 settings apply`: load → validate → discover agents from the embedded manifest → rewrite installed artifacts (CC YAML frontmatter, Codex TOML targeted line replacement) → report modified/already-current counts. `rp1 update` re-applies automatically. Idempotent: rewriter reports `modified=false` when target equals current.
- **LiquidJS whitespace control (CRITICAL)**: production engine (`template-engine.ts`) uses `greedy:true`. Golden-file tests MUST replicate the identical config — config drift lets whitespace bugs ship undetected. Use `{%- endif %}` (no trailing dash) when a newline separator must survive. Gate optional fields on `model != "inherit"` / `effortValue` so opt-out output is byte-identical to legacy.
- **Script entrypoint guard**: `cli/scripts/` executables wrap top-level execution in `if (import.meta.main)` so test imports of exported functions are side-effect-free.
- **Migrate-integrated settings migration**: `migrateArcadeSettings` runs inside `executeMigrate()`. Central-store migration (`central-store.ts`) is opt-in flag gated — `MigrateOptions.toCentral === true`; bare `rp1 migrate` never converts. Test-isolation seams via `homeDir`/`globalSettingsPath` optional parameters. Cross-device-safe file relocation via `rename()` with `EXDEV` fallback to copy-then-delete. Step ordering ensures consistency: relocation before mode write (the commit point).
- **Catalog checksums cover body content**: `catalog/agents.yaml` checksums hash agent body text, not just frontmatter — every prompt edit (even body-only) requires `just catalog-generate` with the regenerated catalog in the same commit.
- **fp-ts pipeline**: `pipe(loadConfig, TE.fromEither, TE.chain(...))`; prefer clear `map`/`flatMap`/`isLeft` over abstractions.

## Observability

- consola logger with `--verbose`/`--trace` levels; daemon appends structured NDJSON to `daemon.log`; `runId`/`projectId`/source IDs correlate events and notifications.

## Testing Idioms

- Tests under `cli/src/__tests__/` mirror feature areas with shared helpers (temp dirs, env save/restore, Either/TaskEither unwrap).
- **Golden-file tests** validate rendered template output; the test Liquid engine config MUST match production (`greedy:true`) or whitespace bugs ship undetected.
- **Hermetic settings tests**: any code path reading `~/.config/rp1/settings.toml` accepts an optional `globalSettingsPath` injection seam (`loadAllArgumentDefaults`, `loadTierRemappings`, `resolveConfig`, `loadArcadeSettings`, `loadStorageMode`, `loadEnabledHarnesses`, `writeHarnessSelection`); tests point it at an isolated nonexistent path so real developer config never leaks into assertions. Contract tests guard shape parity between `BundleAgentEntry` and the embedded manifest generator.
- Evals share assertions under `evals/suites/shared/`.

## I/O & Integration

- SQLite via `bun:sqlite` (runs, events, artifacts, annotations, notifications); upsert + source dedup.
- Atomic writes via temp-file + rename (registry); PID file mode `0o600`.
- `rp1 agent-tools emit` persists canonical events; daemon relays project-scoped WS envelopes. File artifacts keep `path`+`storageRoot`; URL artifacts register as `type: link` with deterministic identity (only curated run-output links).
- **Directory-scoped I/O**: code edits resolve against `codeRoot` (worktree-aware); work/KB reads use `workRoot`/`kbRoot` via `rp1-root-dir`, which respects the active storage mode — these paths may resolve outside the project tree when central mode is configured. `isContainerEnvironment()` forces local mode in Docker/Codespaces (cached after first check, with `resetContainerDetectionCache()` for test isolation).
- **Annotation persistence**: `annotation-service.ts` stores annotations in SQLite keyed by `doc_id` (FK to artifacts). `markdown-projection.ts` maps rendered-DOM text selections back to source-file offsets via an mdast-walk offset map, enabling anchored annotations on markdown artifacts.

## Concurrency & Async

- `withRegistryLock` async mutex serializes registry read-modify-write; functional state updaters dedup concurrent WS toasts; heavy subsystems (daemon, LiquidJS) loaded via dynamic `import()` and excluded from the compiled binary.
- **Module-level cache with explicit reset**: settings loader caches parsed TOML per invocation lifetime; `resetSettingsCache()` exists solely for test isolation.
- **Directory-based file lock**: parallel task-builders serialize shared task-file updates via `mkdir .task-file.lock` atomicity (sleep-poll on contention, always release).

## Dependency Injection & Configuration

- **Optional-parameter seams**: `ApplyDeps` interface injects `readFile`/`writeFile`/`fileExists`/`refreshClaudeCodePlugins`/`getBundledAssets` with `DEFAULT_DEPS` production binding (imports `getBundledAssetsReal` explicitly to avoid a circular dependency); `globalSettingsPath` threads through loader/apply/migrate for isolation; `globalConfigDir` on `migrateArcadeSettings` isolates migration tests.
- **TOML settings, two-level merge**: project `.rp1/settings.toml` > user `~/.config/rp1/settings.toml`, per key for `[arguments.*]`, `[models.*]`, `[arcade]`, and `[storage]` sections; loader normalizes lower-kebab → UPPER_SNAKE for arguments. `[arcade]` section supports `theme` ("light"/"dark"/"system", default "system") and `[arcade.downsampling]` sub-table (`thresholdHours`, default 24); `loadArcadeSettings()` merges project over user with per-key granularity and returns typed `ArcadeSettings`. `[harnesses]` is user-level only (per-machine, not per-project); `loadEnabledHarnesses()` reads only from global settings and returns `undefined` when absent (callers fall back to all-detected-stable). Blessed presets (`presets.ts`) provide complete tier-to-model profiles (budget/standard/premium) that explicit overrides supersede.
- **Argument resolution (5-layer merge)**: `resolveArgs` merges arguments in precedence order: user input → project settings → user settings → ENV var (`source.env`) → schema default. Positional parsing uses greedy capture when exactly one required non-variadic string arg exists with no variadic peer; otherwise the required scalar takes a single token and the variadic captures the rest. Implies chains resolve via fixed-point iteration. `kbInitialized` flag (checks `index.md` presence, not bare directory) surfaces `kbNextStepHint` when the KB is empty.

## Extension Mechanisms

- Commands via `program.addCommand` in `main.ts`; agent tools via `registerTool()`; build templates per-platform under `templates/<platform>/` with registered lint rules + filters; state machines via `stateDiagram-v2` with auto-skip/auto-complete.

## Agent & Workflow Patterns

- **Parent-owned interview**: only the top-level skill asks user-facing questions; leaf agents are bounded non-interactive workers. At most 10 parent questions per artifact phase. Loop: read artifact → scan declared required sections for gaps → ask one focused question → reconstruct and write full artifact → re-read and verify → repeat or exit. Resume always starts from the artifact read, not from workflow events or checkpoint files.
- **Artifact template indirection**: 20 producer agents read canonical templates from `rp1-base:artifact-templates` via a two-hop discovery flow (index table → template file with routing metadata) rather than embedding output formats inline. Four instruction variants (A: single-doc, B: multi-doc, C: section-append, D: format-reference) match the agent's output type.

## Related KB

- Components: `modules.md` · System design: `architecture.md` · Concepts: `concept_map.md`
