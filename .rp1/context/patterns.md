# Implementation Patterns

**Repository**: rp1
**Current Project**: .
**Last Updated**: 2026-03-09

## Naming & Organization

**Files**: Kebab-case dominates directories and workflow assets, with `SKILL.md` as the canonical invocable file.
**Functions**: TypeScript functions use camelCase; React components and types use PascalCase.
**Imports**: ESM imports use explicit `.js` suffixes in CLI code; frontend code also uses `@/` aliases.

Evidence: `docs/concepts/skills.md`, `cli/src/commands/build.ts`, `cli/src/commands/init.ts`, `cli/src/install/installer.ts`, `cli/web-ui/src/app/App.tsx`

## Type & Data Modeling

**Data Representation**: Strict TypeScript interfaces and typed envelopes, especially `ToolResult<T>` and workflow-specific result shapes.
**Type Strictness**: Explicit typing is preferred across command, tool, and workflow boundaries.
**Immutability**: `readonly`-style data flow and pipeline composition are favored over shared mutable state.

Evidence: `cli/src/agent-tools/work/index.ts`, `cli/src/pr-review/index.ts`, `plugins/dev/skills/build/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`

## Error Handling

**Strategy**: fp-ts `Either` and `TaskEither` are preferred over exception-driven business logic.
**Propagation**: Failures are composed through pipelines and normalized at command or tool boundaries.
**Common Types**: `CLIError` variants such as validation, install, backup, config, and runtime errors are the dominant family.

Evidence: `cli/src/commands/build.ts`, `cli/src/commands/init.ts`, `cli/src/install/installer.ts`, `plugins/base/skills/knowledge-build/SKILL.md`

## Validation & Boundaries

**Location**: Validation happens at command entry, skill orchestration boundaries, and reduce phases.
**Method**: Explicit shape checks, parameter tables, state-machine validation, and deterministic parsing.
**Normalization**: Inputs are normalized early, including derived flags, resolved `RP1_ROOT`, and split `state.json` versus `meta.json`.

Evidence: `cli/src/agent-tools/work/index.ts`, `cli/src/install/installer.ts`, `plugins/base/skills/knowledge-build/SKILL.md`, `plugins/dev/skills/build/SKILL.md`

## Observability

**Logging**: Structured logging plus workflow-status events.
**Metrics**: Lightweight generated/reporting metrics dominate over runtime instrumentation.
**Tracing**: Run IDs, work updates, daemon notifications, and WebSocket fan-out provide workflow-level traceability.

Evidence: `cli/src/commands/init.ts`, `cli/src/install/installer.ts`, `cli/src/agent-tools/work/index.ts`, `plugins/dev/skills/build-fast/SKILL.md`

## Testing Idioms

**Organization**: CLI tests mirror source areas; evals cover prompt-driven behavior separately.
**Fixtures**: Temporary directories, helper utilities, and deterministic tool wrappers are preferred.
**Levels**: Strong unit coverage, integration flows for lifecycle behavior, and dedicated eval validation.

Evidence: `cli/src/__tests__/`, `evals/`, `docs/concepts/command-agent-pattern.md`, `Justfile`

## I/O & Integration

**Database**: SQLite-backed workflow tracking exposed through agent tools.
**HTTP Clients**: External operations are routed through dedicated tool/runtime surfaces, especially GitHub PR tooling.
**Resilience**: Backup/restore, atomic staging, best-effort notifications, and partial-success orchestration are common.

Evidence: `cli/src/agent-tools/work/database.ts`, `cli/src/agent-tools/github-pr/`, `cli/src/install/installer.ts`, `plugins/base/skills/knowledge-build/SKILL.md`

## Concurrency & Async

**Async Usage**: Async work is wrapped in `TaskEither` pipelines at the boundary.
**Parallelism**: Map-reduce fan-out and isolated git worktrees are the main concurrency patterns.
**Safety**: Isolation, explicit reduction, and state-machine enforcement are preferred over shared-state coordination.

Evidence: `plugins/base/skills/knowledge-build/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`, `cli/src/agent-tools/worktree/`, `cli/src/install/installer.ts`

## Dependency & Configuration

**DI Pattern**: Lightweight dependency injection through passed loggers, callbacks, providers, and runtime resolution.
**Config Loading**: CLI flags, env vars, frontmatter, `.rp1/config/*`, and generated KB state files.
**Initialization**: Explicit staged startup is preferred over implicit auto-discovery.

Evidence: `cli/src/commands/build.ts`, `cli/src/commands/init.ts`, `cli/src/install/installer.ts`, `cli/web-ui/src/app/App.tsx`, `plugins/base/skills/knowledge-build/SKILL.md`

## Extension Mechanisms

**Plugin Pattern**: `base`, `dev`, and `utils` plugins are the main extension boundary.
**Hook System**: Tool self-registration plus install/build pipelines provide the dominant extension hooks.

Evidence: `plugins/base/`, `plugins/dev/`, `plugins/utils/`, `cli/src/agent-tools/work/index.ts`, `cli/src/agent-tools/worktree/index.ts`, `cli/src/agent-tools/github-pr/index.ts`
