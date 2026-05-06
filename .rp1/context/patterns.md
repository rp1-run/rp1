# Implementation Patterns

**Repository**: rp1
**Current Project**: `.`
**Last Updated**: 2026-05-06

## Naming & Organization

**Files**: Hybrid feature/layer layout. CLI tools live under `agent-tools/<tool>/index.ts`; build filters/tags are one extension per file; web-ui hooks/routes are grouped by surface; prompt assets use kebab-case skill folders with `SKILL.md` plus agent markdown.

**Functions**: camelCase verbs dominate. React hooks use `use*`; boundary helpers use `parse*`, `validate*`, `resolve*`; tool entrypoints export `execute` and register with `registerTool`.

**Imports**: Relative TypeScript imports keep `.js` suffixes; web UI uses `@/` aliases; prompt frontmatter uses kebab-case names and UPPER_SNAKE_CASE arguments.

Evidence: `cli/src/agent-tools/workflow-bootstrap/index.ts`, `cli/src/build/filters/allowed-tools.ts`, `cli/web-ui/src/hooks/useNotifications.ts`, `plugins/dev/skills/build/SKILL.md`

## Type & Data Modeling

**Data Representation**: String-literal unions with parallel `VALID_*` arrays and discriminated payload unions model shared events. DB rows map through explicit record mappers into readonly domain records.

**Type Strictness**: Boundary data enters as `unknown`, JSON, or YAML, then narrows with record guards and field validators before typed use. Optional persisted fields are normalized to null/undefined in row mappers.

**Immutability**: Readonly interfaces/arrays and `as const`/`satisfies` preserve stable contracts; mutable state is explicit in Maps, refs, and SQLite rows.

Evidence: `cli/shared/events.ts`, `cli/src/agent-tools/emit/database.ts`, `cli/src/build/parser.ts`

## Error Handling

**Strategy**: CLI and agent-tools prefer `Either`/`TaskEither<CLIError, A>`; web server routes and React hooks use native try/catch at HTTP/UI boundaries.

**Propagation**: Validation fails early with usage/parse/runtime errors. Async I/O is wrapped in `TE.tryCatch`; non-critical daemon notifications and legacy cleanup are best-effort.

**Common Types**: `UsageError`, `ParseError`, `RuntimeError`, `NotFoundError`, `ToolError`, `RuntimeManifestError`, `UnsupportedArcadeHostModeError`.

Evidence: `cli/src/agent-tools/build-task-plan/index.ts`, `cli/src/agent-tools/emit/index.ts`, `cli/web-ui/src/server/runtime-contract.ts`

## Validation & Boundaries

**Location**: Validation sits at command/tool/API boundaries: workflow bootstrap verifies project initialization, schema/name match, workflow metadata, identity args, and resolved args; emit validates event type, payload shape, project path, and storage root.

**Method**: Manual guards plus enum tables, JSON/YAML parse checks, path containment checks, and state-machine transition validation.

**Normalization**: Namespaced subagent steps bypass parent workflow validation by design; artifact paths are normalized through explicit `storageRoot`.

Evidence: `cli/src/agent-tools/emit/validate.ts`, `cli/src/agent-tools/emit/step-validation.ts`, `cli/src/agent-tools/workflow-bootstrap/index.ts`

## Observability

**Logging**: Durable observability is the run/event/notification DB stream. Console logging is reserved for warnings, migrations, reconciliation, and route notification failures.

**Metrics**: No Prometheus/statsd metrics detected; the system exposes DB-backed summaries and projections for activity, attention, and notifications.

**Tracing**: Correlation flows through `runId`, `projectId`, `projectRoot`, `workIdentity`, `eventId`, source ids, and artifact `docId`.

Evidence: `cli/src/agent-tools/emit/index.ts`, `cli/src/agent-tools/emit/database.ts`, `cli/web-ui/src/server/routes/v2-api.ts`

## Testing Idioms

**Organization**: Bun tests live under `cli/src/__tests__` and `cli/web-ui/src/__tests__`, mirroring source areas for build filters, agent-tools, hooks, and server routes.

**Fixtures**: Tests isolate temp dirs and env vars (`RP1_DB`, `HOME`), seed SQLite records directly, use repo/worktree helpers, mock modules/fetch/WebSocket callbacks, and use renderHook/act/waitFor for hooks.

**Levels**: Pure functions get unit tests; workflow bootstrap, SQLite-backed APIs, and hook recovery paths use integration-style tests with real DB/file setup and mocked unstable boundaries.

Evidence: `cli/src/__tests__/build/filters/allowed-tools.test.ts`, `cli/src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts`, `cli/web-ui/src/__tests__/hooks/useNotifications.test.ts`

## I/O & Integration

**Database**: SQLite via `bun:sqlite` is the primary persistence layer. The emit DB uses WAL, busy timeout, foreign keys, migrations, and singleton connection; work-search caches per-db instances; registry/work-search/Socratic Duel use transactions for consistency.

**HTTP Clients**: The web UI fetches `/api/v2/*` with URLSearchParams and `response.ok` checks; routes return `jsonResponse`/`errorResponse` and broadcast WebSocket updates after lifecycle changes.

**File I/O**: Artifacts, manifests, templates, and runtime manifests use `fs/promises` and `Bun.file`/`Bun.write`; artifact paths are resolved by explicit `storageRoot` and reconciled by `rp1_doc_id` scans when moved.

Evidence: `cli/src/agent-tools/emit/database.ts`, `cli/src/agent-tools/work-search/database.ts`, `cli/web-ui/src/server/routes/artifacts-api.ts`

## Concurrency & Async

**Async Usage**: The codebase mixes synchronous SQLite calls inside async/TaskEither wrappers with async file/network work; daemon modules are dynamically imported only when needed.

**Parallelism**: UI hooks use request ids, refs, and AbortController to suppress stale fetches; reconnect recovery merges REST results with `LiveRunIndex`; DB `BEGIN IMMEDIATE` transactions guard lock/index updates; bulk notification dismiss uses `Promise.all`.

**Safety**: Shared mutable frontend state is isolated behind hooks/providers; backend write contention is managed through SQLite transactions and Socratic Duel lease locks.

Evidence: `cli/web-ui/src/hooks/useFeed.ts`, `cli/web-ui/src/hooks/useNotifications.ts`, `cli/src/agent-tools/socratic-duel/database.ts`

## Dependency & Configuration

**DI Pattern**: No container detected. Dependencies are passed as explicit contexts, overrides, platform definitions, registry hooks, and test-only module loader setters.

**Config Loading**: Config comes from skill/agent frontmatter metadata, platform registries, settings defaults, env vars, runtime manifests, and deterministic rp1 root resolution.

**Initialization**: Initialization is lazy or guarded: database singletons, registry hydration promise, dev runtime manifest fallback, and dynamic daemon loader.

Evidence: `cli/web-ui/src/server/routes/artifacts-api.ts`, `cli/src/agent-tools/resolve-args/resolver.ts`, `cli/web-ui/src/server/registry.ts`

## Extension Mechanisms

**Plugin Pattern**: Agent tools self-register through `registerTool`; CLI commands use Commander; the build pipeline uses `PlatformDefinition` registries, hooks, filters, and semantic Liquid tags.

**Prompt Assets**: Skills and agents declare structured arguments, sub_agents, workflow run policy, and Mermaid state machines; catalog parsing filters scope/user invocability and renders discovery entries.

Evidence: `cli/src/agent-tools/build-task-plan/index.ts`, `cli/src/build/command.ts`, `cli/src/build/tags/dispatch-agent.ts`, `cli/src/catalog/registry.ts`, `plugins/base/skills/artifact-templates/SKILL.md`
