# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-04-12

## Naming & Organization

- **Files**: TypeScript stays feature-scoped under directories such as `cli/src/commands/`; prompt assets use kebab-case skill folders with `SKILL.md` plus companion docs when deeper guidance is needed.
- **Functions**: CLI helpers use camelCase verbs; prompt parameters use `UPPER_SNAKE_CASE` in `metadata.arguments`, while agents keep top-level `arguments`.
- **Imports**: Relative TS imports keep explicit `.js` suffixes; command registration stays centralized in `cli/src/main.ts`.
- **Evidence**: `cli/src/main.ts`, `plugins/base/skills/write-content/SKILL.md`, `plugins/base/agents/scribe.md`

## Type & Data Modeling

- **Data modeling**: Runtime TS favors discriminated unions, readonly records, and `Either`/`TaskEither`; prompt workflows describe inputs and outputs declaratively in YAML frontmatter and JSON contracts.
- **Strictness**: Tagged unions (`_tag`, status/event enums) and explicit allowed-value tables are preferred over loose objects or prose-only contracts. Build-time types enforce canonical enums: `SkillCategory`, `WorkflowRunPolicy`, `Status`, `EventType`, `ArtifactType`.
- **Immutability**: TS models lean on `readonly` and `as const`; persisted artifacts such as `brief.md` and `scan_results.json` serve as source-of-truth snapshots.
- **Evidence**: `cli/shared/errors.ts`, `cli/shared/events.ts`, `cli/src/build/models.ts`

## Error Handling

- **Strategy**: TS code returns `Either` or `TaskEither<CLIError, A>` and formats errors once at the CLI boundary; prompt workers fail fast on invalid inputs and return structured JSON with `errors[]`.
- **Propagation**: Parent skills gate on hard failures, but batch workflows tolerate partial success when enough worker results are valid.
- **Common types**: `UsageError`, `ConfigError`, `ValidationError`, `RuntimeError`, `PrerequisiteError`, `ParseError`, `NotFoundError`.
- **Evidence**: `cli/shared/errors.ts`, `cli/src/build/validator.ts`, `cli/src/agent-tools/workflow-bootstrap/index.ts`

## Validation & Boundaries

- **Where validation happens**: At workflow intake and command boundaries, not deep in execution. Build pipeline enforces L1 (syntax) then L2 (schema) validation on all YAML frontmatter.
- **How validation happens**: Explicit enum/default tables, existence checks, compatibility aliases, and stop/continue gates. Tracked workflows validate `run_policy`/`identity_args` coherence at build and bootstrap time.
- **Normalization**: `list_marker` is canonical while `list_style` is preserved as a compatibility alias; fence markers carry semver versions for staleness detection.
- **Evidence**: `cli/src/build/validator.ts`, `cli/src/lib/fence-check.ts`, `cli/src/agent-tools/workflow-bootstrap/index.ts`

## Observability

- **Logging**: CLI entrypoints attach a logger in `preAction`, map `--verbose` and `--trace` to levels.
- **Events**: Six canonical event types (`status_change`, `artifact_registered`, `annotation_updated`, `waiting_for_user`, `btw_update`, `subflow_registered`) are persisted to SQLite via the emit pipeline and broadcast over WebSocket to the daemon.
- **Notifications**: Auto-generated from emit pipeline for completed/failed runs and `waiting_for_user` events, with deduplication by source.
- **Evidence**: `cli/shared/events.ts`, `cli/src/agent-tools/emit/index.ts`, `cli/src/agent-tools/emit/notification-generator.ts`

## Testing Idioms

- **Organization**: Tests live under `cli/src/__tests__/` mirroring feature areas with shared helpers in `helpers/`. Evals share assertions and tool-name canonicalization under `evals/suites/shared/`.
- **Fixtures**: Common patterns include temp directories, explicit env save/restore, and helper unwraps for `Either` and `TaskEither`.
- **Levels**: Unit-heavy, with integration-style setup around CLI, filesystem, config, and build pipeline behavior. Golden-file tests validate rendered template output.
- **Evidence**: `cli/src/__tests__/build/validator.test.ts`, `cli/src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts`, `evals/suites/shared/assertions/tool-calls.ts`

## I/O & Integration

- **Workflow I/O**: Doc workflows are explicit `scan -> approve -> process` pipelines that read and write JSON artifacts and use `git` plus `Glob/Grep/Edit` instead of opaque repo sweeps.
- **CLI entrypoints**: `cli/src/main.ts` lazy-loads heavy or special entrypoints such as `agent-tools` and the daemon server; concrete commands adapt flags into executor args and delegate.
- **Database**: SQLite (via `bun:sqlite`) stores runs, events, artifacts, annotations, and notifications. The emit module uses upsert semantics and the web-ui V2 API reads from the same DB.
- **Evidence**: `cli/src/main.ts`, `cli/src/agent-tools/emit/database.ts`, `cli/web-ui/src/server/routes/v2-api.ts`

## Concurrency & Async

- **Async usage**: TS entrypoints use async functions and dynamic imports; workflow prompts describe concurrency declaratively via background agent dispatch and later aggregation.
- **Parallelism**: Batch by five, run background `rp1-base:scribe` workers, then aggregate counts and errors into one persisted result.
- **Safety**: Parent workflows keep durable intermediates so retries and gates do not depend on transient prompt context. Daemon notification is best-effort with silent failure.
- **Evidence**: `cli/src/main.ts`, `cli/src/agent-tools/emit/index.ts`

## Dependency & Configuration

- **Injection**: rp1 skills declare capabilities and parameters declaratively in frontmatter; agents receive pre-resolved parameters from parents and do not re-parse arguments.
- **Config resolution**: `resolve-args` and `rp1-root-dir` centralize argument and directory resolution. `workflow-bootstrap` unifies run creation/resumption for tracked workflows, resolving schema paths across worktrees and installed manifests.
- **Settings**: Project and user settings remain TOML-backed and layered under the shared configuration model.
- **Evidence**: `cli/src/agent-tools/resolve-args/index.ts`, `cli/src/agent-tools/workflow-bootstrap/index.ts`, `cli/shared/directory-resolution.ts`

## Extension Mechanisms

- **CLI extension**: Commands are added centrally with `program.addCommand(...)`, while heavy subsystems stay behind thin adapters. Agent tools register via `registerTool()` with name/description/execute.
- **Prompt extension**: Workflows compose through `sub_agents` metadata, Liquid tags such as `dispatch_agent`, `ask_user`, `plan_tool`, and companion references loaded on demand.
- **Build extension**: One prompt source is rendered into Claude Code, OpenCode, and Codex artifacts through a shared LiquidJS-based build pipeline with registered lint rules (`registerLintRule`). Build-time catalog generation derives CATALOG.md from a shared registry.
- **State machines**: Workflows declare `stateDiagram-v2` blocks; the emit pipeline validates steps against loaded state machines, auto-skips unreached steps, and auto-completes predecessor steps.
- **Evidence**: `cli/src/build/lint/index.ts`, `cli/src/catalog/registry.ts`, `cli/src/agent-tools/emit/step-validation.ts`

## Content Fencing

- **Mechanism**: Injected content in instruction files (CLAUDE.md, AGENTS.md, .gitignore) is wrapped in versioned fence markers (`<!-- rp1:start:vX.Y.Z -->` / `<!-- rp1:end:vX.Y.Z -->`).
- **Staleness**: `LATEST_FENCE_VERSION` in `fence-version.ts` is bumped when stanza content changes. `fence-check.ts` scans markers to detect outdated files; `stanza-upgrade.ts` performs in-place upgrades.
- **Evidence**: `cli/src/init/comment-fence.ts`, `cli/src/lib/fence-check.ts`, `cli/src/migrate/stanza-upgrade.ts`
