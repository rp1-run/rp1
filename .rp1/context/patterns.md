# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-04-04

## Naming & Organization

- **Files**: TypeScript stays feature-scoped under directories such as `cli/src/commands/`; prompt assets use kebab-case skill folders with `SKILL.md` plus companion docs when deeper guidance is needed.
- **Functions**: CLI helpers use camelCase verbs; prompt parameters use `UPPER_SNAKE_CASE` in `metadata.arguments`, while agents keep top-level `arguments`.
- **Imports**: Relative TS imports keep explicit `.js` suffixes; command registration stays centralized in `cli/src/main.ts`.
- **Evidence**: `cli/src/main.ts`, `plugins/base/skills/write-content/SKILL.md`, `plugins/base/agents/scribe.md`

## Type & Data Modeling

- **Data modeling**: Runtime TS favors discriminated unions, readonly records, and `Either`/`TaskEither`; prompt workflows describe inputs and outputs declaratively in YAML frontmatter and JSON contracts.
- **Strictness**: Tagged unions (`_tag`, status/event enums) and explicit allowed-value tables are preferred over loose objects or prose-only contracts.
- **Immutability**: TS models lean on `readonly` and `as const`; prompt workflows treat persisted artifacts such as `brief.md` and `scan_results.json` as source-of-truth snapshots.
- **Evidence**: `cli/shared/errors.ts`, `cli/shared/events.ts`, `plugins/base/agents/scribe.md`

## Error Handling

- **Strategy**: TS code returns `Either` or `TaskEither<CLIError, A>` and formats errors once at the CLI boundary; prompt workers fail fast on invalid inputs and return structured JSON with `errors[]`.
- **Propagation**: Parent skills gate on hard failures, but batch workflows tolerate partial success when enough worker results are valid.
- **Common types**: `UsageError`, `ConfigError`, `ValidationError`, `RuntimeError`, and `PrerequisiteError` dominate the changed frontier.
- **Evidence**: `cli/shared/errors.ts`, `cli/src/commands/build.ts`, `plugins/base/agents/scribe.md`

## Validation & Boundaries

- **Where validation happens**: At workflow intake and command boundaries, not deep in execution.
- **How validation happens**: Explicit enum/default tables, existence checks, compatibility aliases, and stop/continue gates.
- **Normalization**: `list_marker` is canonical while `list_style` is preserved as a compatibility alias; repo-specific writing always starts from `.rp1/context/index.md` and narrows from there.
- **Evidence**: `plugins/base/skills/write-content/SKILL.md`, `plugins/base/skills/generate-user-docs/SKILL.md`, `plugins/base/agents/scribe.md`

## Observability

- **Logging**: CLI entrypoints attach a logger in `preAction`, map `--verbose` and `--trace` to levels, and warn on runtime mismatches before command execution.
- **Metrics**: No new metrics subsystem appeared in the frontier; workflow visibility is carried mostly by status events, summaries, and persisted artifacts.
- **Tracing**: Skills emit lifecycle events and persist replayable artifacts under `.rp1/work/...` for audit and debugging.
- **Evidence**: `cli/src/main.ts`, `plugins/base/skills/write-content/SKILL.md`, `plugins/base/skills/generate-user-docs/SKILL.md`

## Testing Idioms

- **Organization**: Tests live under `cli/src/__tests__/` and mirror feature areas with shared helpers in `helpers/`.
- **Fixtures**: Common patterns include temp directories, explicit env save/restore, and helper unwraps for `Either` and `TaskEither`.
- **Levels**: The repo remains unit-heavy, with integration-style setup around CLI, filesystem, and config behavior.
- **Evidence**: `cli/src/__tests__/pr-review/config.test.ts`, `cli/src/__tests__/helpers/fp-ts-helpers.ts`

## I/O & Integration

- **Workflow I/O**: Doc workflows are explicit `scan -> approve -> process` pipelines that read and write JSON artifacts and use `git` plus `Glob/Grep/Edit` instead of opaque repo sweeps.
- **CLI entrypoints**: `cli/src/main.ts` lazy-loads heavy or special entrypoints such as `agent-tools` and the daemon server, while concrete commands adapt flags into executor args and delegate real work.
- **External tooling**: `generate-user-docs` uses git for freshness and diff checks; `build:opencode` surfaces the shared build pipeline as a user command.
- **Evidence**: `cli/src/main.ts`, `cli/src/commands/build.ts`, `plugins/base/skills/generate-user-docs/SKILL.md`

## Concurrency & Async

- **Async usage**: TS entrypoints use async functions and dynamic imports; workflow prompts describe concurrency declaratively via background agent dispatch and later aggregation.
- **Parallelism**: Batch by five, run background `rp1-base:scribe` workers, then aggregate counts and errors into one persisted result.
- **Safety**: Parent workflows keep durable intermediates so retries and gates do not depend on transient prompt context.
- **Evidence**: `cli/src/main.ts`, `plugins/base/skills/generate-user-docs/SKILL.md`

## Dependency & Configuration

- **Injection**: rp1 skills declare capabilities and parameters declaratively in frontmatter; agents receive pre-resolved parameters from parents and do not re-parse arguments.
- **Config resolution**: `resolve-args` and `rp1-root-dir` centralize argument and directory resolution; removed env-based root discovery is treated as a repo convention, not a per-skill choice.
- **Settings**: Project and user settings remain TOML-backed and layered under the shared configuration model.
- **Evidence**: `plugins/utils/skills/prompt-writer/RP1-AUTHORING.md`, `plugins/base/skills/write-content/SKILL.md`, `cli/shared/config.ts`

## Extension Mechanisms

- **CLI extension**: Commands are added centrally with `program.addCommand(...)`, while heavy subsystems stay behind thin adapters.
- **Prompt extension**: Workflows compose through `sub_agents` metadata, Liquid tags such as `dispatch_agent`, `ask_user`, `plan_tool`, and companion references loaded on demand.
- **Build extension**: One prompt source is rendered into Claude Code, OpenCode, and Codex artifacts through a shared LiquidJS-based build pipeline.
- **Evidence**: `cli/src/main.ts`, `plugins/utils/skills/prompt-writer/SKILL.md`, `plugins/utils/skills/prompt-writer/RP1-AUTHORING.md`
