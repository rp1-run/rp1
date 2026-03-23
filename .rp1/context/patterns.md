# Implementation Patterns

**Repository**: rp1
**Current Project**: . (monorepo root)
**Last Updated**: 2026-03-23

## Naming & Organization

**Files**: snake_case module files (`models.ts`, `command.ts`, `database.ts`); feature directories group related modules (`emit/`, `state-machine/`, `task/`, `feedback/`)
**Functions**: camelCase verbs: `executeEmit`, `insertRun`, `executeFeedbackRead`, `validateReadOptions`; factory constructors: `usageError()`, `runtimeError()`, `createTemplateEngine()`, `createLogger()`
**Imports**: fp-ts imported as namespace aliases (`E` for Either, `TE` for TaskEither, `O` for Option); re-exported via `cli/shared/fp.ts` facade; absolute imports with `.js` extensions

Evidence: `cli/shared/fp.ts`, `cli/shared/errors.ts`, `cli/src/agent-tools/feedback/index.ts`

## Type & Data Modeling

**Data Representation**: Readonly interfaces with `readonly` fields for all domain models; separate Row interfaces (snake_case DB) mapped to Record interfaces (camelCase domain) via pure mapper functions
**Type Strictness**: Discriminated unions using `_tag` field for `CLIError` and `type` field for `EventPayload`; generic `ToolResult<T>` envelope; `as const` assertions for constant arrays (`VALID_STATUSES`, `VALID_STATUS_FILTERS`, `PLUGIN_NAMES`)
**Immutability**: All model interfaces use `readonly` modifier; DB row-to-record mappers create new objects; React state updates use spread operator

Evidence: `cli/shared/errors.ts:12-38`, `cli/src/agent-tools/feedback/models.ts:34-38`, `cli/src/build/template-context.ts`

## Error Handling

**Strategy**: fp-ts `Either<CLIError, A>` for sync operations, `TaskEither<CLIError, A>` for async; `CLIError` is a discriminated union with `_tag` field and factory functions; `tryCatchTE` helper wraps Promise into TaskEither
**Propagation**: Validate at command boundary with `E.left` early return; compose with `TE.Do` + `TE.bind` for multi-field validation pipelines; format errors at output boundary with `formatError()`; each CLI action checks `E.isLeft` and exits with `createErrorResponse`
**Common Types**: UsageError, NotFoundError, ConfigError, RuntimeError, ParseError, TransformError, ValidationError, GenerationError, PrerequisiteError, InstallError, StrictModeError

Evidence: `cli/shared/errors.ts`, `cli/src/agent-tools/feedback/validate.ts:47-70`, `cli/src/build/validator.ts`

## Validation & Boundaries

**Location**: CLI option parsing layer (`validateEmitOptions`, `validateReadOptions`, `parseBuildArgs`); each returns `Either<CLIError, ValidatedInput>`; build artifacts get two-tier L1 (syntax) + L2 (schema) validation
**Method**: Manual validation with early `E.left` returns; `TE.Do`/`TE.bind` for composing multiple validations; per-event-type payload shape validation via switch dispatch; `parseInt` with `isNaN` guards for numeric args

Evidence: `cli/src/agent-tools/feedback/validate.ts:76-96`, `cli/src/agent-tools/emit/validate.ts:35-316`, `cli/src/build/validator.ts:59-296`

## Observability

**Logging**: consola-based Logger interface via `createLogger()` factory; level-mapped (trace=5 through error=1); ANSI color formatting for CLI error output via `formatError()`
**Metrics**: Derived from persisted run data (`deriveRunStatus`, `getProjectRunStats`); build summaries aggregate counts
**Tracing**: None detected; local SQLite event store with sequential IDs serves as audit trail

Evidence: `cli/shared/logger.ts:1-63`, `cli/shared/errors.ts:179-238`

## Testing Idioms

**Organization**: Tests under `cli/src/__tests__/` mirror source structure; `describe`/`test` blocks with `bun:test`
**Fixtures**: `beforeEach` creates temp directories via `createTempDir()`; `afterEach` cleans up with `rm()`; DB singleton reset (`closeDatabase` + `resetInstance`) between tests; `clearCache()` for state machine test isolation
**Levels**: E2E integration tests exercising full pipeline (`executeEmit` through DB); helper functions like `expectTaskRight` unwrap TaskEither for assertions

Evidence: `cli/src/__tests__/agent-tools/emit/emit.test.ts`, `cli/src/agent-tools/state-machine/loader.ts:104-106`

## I/O & Integration

**Database**: `bun:sqlite` with singleton pattern via module-level `dbInstance`; WAL mode + `busy_timeout` pragmas; schema versioning with additive migrations via `applyMigrations`; parameterized queries with `$`-prefixed named params; `RETURNING *` for insert-then-read
**HTTP Clients**: React hooks fetch from `/api/v2/` REST endpoints (the `/v2/` prefix is an internal implementation detail, not user-facing); WebSocket for real-time event push with exponential backoff reconnection (2s initial, 30s max, factor 2); optimistic UI updates via setState before server reconciliation

Evidence: `cli/src/agent-tools/emit/database.ts:1-120`, `cli/web-ui/src/hooks/useRunDetail.ts:30-56`, `cli/web-ui/src/providers/WebSocketProvider.tsx:47-50`

## Concurrency & Async

**Async Usage**: TaskEither for async CLI operations wrapping Promise-based code; React hooks with `useCallback`/`useEffect` for async data fetching; WebSocket provider manages connection lifecycle
**Patterns**: Debounced refetch on WebSocket events (`setTimeout` 500ms); optimistic UI updates; exponential backoff for WS reconnection; reconnection reconciliation refetches full state on WS reconnect

Evidence: `cli/web-ui/src/hooks/useRunDetail.ts:63-217`, `cli/web-ui/src/providers/WebSocketProvider.tsx:47-50`

## Dependency & Configuration

**DI Pattern**: Manual wiring: singleton DB via `getEmitDatabase()`; interface + factory function pattern (`createTemplateEngine`, `createLogger`); React Context for WebSocket and Annotations; `useContext` hooks as dependency access
**Config Loading**: Environment variables (`RP1_DB`, `RP1_ROOT`, `GITHUB_TOKEN`); `findRp1Root` walks directory tree with git worktree fallback; `BuildConfig`/`ArcadeConfig` parsed from CLI args with Either returns

Evidence: `cli/src/agent-tools/emit/database.ts:23-24`, `cli/shared/config.ts:20-131`, `cli/src/build/template-engine.ts:54-89`

## Extension Mechanisms

**Plugin System**: Multi-platform build pipeline: same markdown source transformed via LiquidJS templates + platform registries (`claudeCodeRegistry`, `codexRegistry`, `defaultRegistry`); preprocessor handles platform conditionals before template render
**Loader Chain**: State machine loader uses cache -> bundle -> filesystem discovery chain with `TE.orElse` fallback

Evidence: `cli/src/build/claude-code/registry.ts`, `cli/src/build/preprocessor.ts:1-11`, `cli/src/agent-tools/state-machine/loader.ts:69-85`
