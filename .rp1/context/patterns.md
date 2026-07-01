# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-06-30

## Naming & Organization

- Feature-scoped directories (`cli/src/commands/`, `cli/src/build/`); prompt assets use kebab-case skill folders with `SKILL.md`.
- CLI camelCase verbs; React hooks prefix `use`; error factories match their `_tag` (`usageError`, `runtimeError`).
- Parameters UPPER_SNAKE_CASE (`/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/`); relative TS imports keep `.js` suffixes; web-ui uses `@/`; CSS classes use `rp1-` prefix to avoid Tailwind collisions.

## Type & Data Modeling

- **Enum tables**: string-literal unions with parallel `VALID_*` arrays for build-time validation — `ModelTier`/`VALID_MODEL_TIERS`, `EffortLevel`/`VALID_EFFORT_LEVELS`, `SkillCategory`, `WorkflowRunPolicy`, `Status`, `EventType`.
- Discriminated unions: `_tag` on `CLIError`, `type` on `EventPayload`.
- `readonly` + `as const` throughout; persisted artifacts are source-of-truth snapshots.
- **Tier abstraction**: abstract tier aliases (deep/standard/fast/inherit) decoupled from vendor model IDs via the centralized `TIER_MODEL_MAP` — single update point on vendor model releases. `PROTECTED_AGENTS` guards frontier-critical agents from accidental downgrade.

## Error Handling

- Returns `Either`/`TaskEither<CLIError, A>`; formatted once at the CLI boundary via `formatError`; `tryCatchTE` wraps async.
- Parent skills gate on hard failures; batch workflows tolerate partial success. L1 (syntax) then L2 (schema) validation staging.
- **Warnings vs errors**: `validateAgentTierAndEffort` returns `{errors[], warnings[]}` — errors halt agent processing, warnings emit advisories (fast-tier effort, protected-agent downgrade).

## Validation & Boundaries

- **Additive-field propagation**: a new frontmatter field flows `parser → model interface → validator → tier-resolution → template context → Liquid templates` without breaking existing paths. Established for `arcadeTracked`; extended identically for `model` (ModelTier) and `effort` (EffortLevel).
- Each definition validated field-by-field with early return on first error.

## Build Pipeline

- **Tier resolution**: `resolveTier` maps tier→platform model ID via `TIER_MODEL_MAP` (null for `inherit`/unmapped). `resolveEffort` derives provider from the resolved model ID (closed-world assumption) and returns a platform/provider `{fieldName, value}` — `effort` (Claude Code), `model_reasoning_effort` (Codex), `reasoningEffort` (OpenAI-on-OpenCode); omits for fast tier, unknown provider, or null platform config.
- **LiquidJS whitespace control (CRITICAL)**: production engine (`template-engine.ts`) uses `greedy:true`. Golden-file tests MUST replicate the identical config (`greedy:true`, `strictVariables`, `strictFilters`, `lenientIf`) — config drift lets whitespace bugs ship undetected. Use `{%- endif %}` (no trailing dash) when a newline separator must survive after an `endif`; a trailing `{%- endif -%}` under `greedy:true` strips the separator and concatenates adjacent fields (this caused invalid Codex TOML). Gate optional fields on `model != "inherit"` / `effortValue` so opt-out output is byte-identical to legacy.
- **fp-ts pipeline**: `pipe(loadConfig, TE.fromEither, TE.chain(...))`; prefer clear `map`/`flatMap`/`isLeft` over abstractions.

## Observability

- consola logger with `--verbose`/`--trace` levels; daemon appends structured NDJSON to `daemon.log`; `runId`/`projectId`/source IDs correlate events and notifications.

## Testing Idioms

- Tests under `cli/src/__tests__/` mirror feature areas with shared helpers (temp dirs, env save/restore, Either/TaskEither unwrap).
- **Golden-file tests** validate rendered template output; the test Liquid engine config MUST match production (`greedy:true`) or whitespace bugs ship undetected.
- Evals share assertions under `evals/suites/shared/`.

## I/O & Integration

- SQLite via `bun:sqlite` (runs, events, artifacts, annotations, notifications); upsert + source dedup.
- Atomic writes via temp-file + rename (registry); PID file mode `0o600`.
- `rp1 agent-tools emit` persists canonical events; daemon relays project-scoped WS envelopes. File artifacts keep `path`+`storageRoot`; URL artifacts register as `type: link` with deterministic identity (only curated run-output links).
- **Directory-scoped I/O**: code edits resolve against `codeRoot` (worktree-aware); work/KB reads use `workRoot`/`kbRoot` (canonical `.rp1/`).

## Concurrency & Async

- `withRegistryLock` async mutex serializes registry read-modify-write; functional state updaters dedup concurrent WS toasts; heavy subsystems (daemon, LiquidJS) loaded via dynamic `import()` and excluded from the compiled binary.

## Extension Mechanisms

- Commands via `program.addCommand` in `main.ts`; agent tools via `registerTool()`; build templates per-platform under `templates/<platform>/` with registered lint rules + filters; state machines via `stateDiagram-v2` with auto-skip/auto-complete.

## Related KB

- Components: `modules.md` · System design: `architecture.md` · Concepts: `concept_map.md`
