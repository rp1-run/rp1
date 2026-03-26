# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-03-26

## Naming & Organization

**Files**: snake_case module files (models.ts, command.ts, database.ts); feature directories group related modules (emit/, state-machine/, task/)
**Functions**: camelCase verbs: executeEmit, insertRun, validateReadOptions; factory constructors: usageError(), createLogger()
**Imports**: fp-ts via cli/shared/fp.ts facade with suffix convention (mapTE, chainTE, foldO, mapA); absolute imports with .js extensions; barrel re-exports via index.ts

Evidence: cli/shared/fp.ts, cli/shared/errors.ts, cli/src/agent-tools/emit/models.ts

## Type & Data Modeling

**Data Representation**: Readonly interfaces with readonly fields; separate Row interfaces (snake_case DB) mapped to Record interfaces (camelCase domain) via pure mapper functions; generic ToolResult<T> envelope for all agent tool output
**Type Strictness**: Discriminated unions using _tag (CLIError) and type (EventPayload); as const assertions for constant arrays (VALID_STATUSES, PLUGIN_NAMES); ReadonlyMap for state machine states
**Immutability**: All model interfaces use readonly modifier; DB row-to-record mappers create new objects; readonly arrays in interface definitions

Evidence: cli/shared/errors.ts:12-38, cli/src/agent-tools/models.ts:10-15, cli/shared/events.ts:18-25

## Error Handling

**Strategy**: fp-ts Either<CLIError, A> for sync, TaskEither<CLIError, A> for async; CLIError is a discriminated union with _tag field and 14 factory functions; tryCatchTE wraps Promise into TaskEither
**Propagation**: Validate at command boundary with E.left early return; TE.Do + TE.bind for multi-field validation pipelines; formatError() at output boundary; TE.orElse for fallback chains; withGitHubErrorHandling wraps API calls with status-code dispatch
**Common Types**: UsageError, NotFoundError, ConfigError, RuntimeError, ParseError, TransformError, ValidationError, GenerationError, PrerequisiteError, InstallError, BackupError, VerificationError, StrictModeError, PortInUseError

Evidence: cli/shared/errors.ts, cli/src/agent-tools/github-pr/client.ts:62-131

## Validation & Boundaries

**Location**: CLI option parsing layer (validateEmitOptions, validateReadOptions, parseBuildArgs); each returns Either<CLIError, ValidatedInput>; two-tier L1/L2 build validation; step validation against state machine graphs
**Method**: Manual validation with early E.left returns; TE.Do/TE.bind for composing validations; per-event-type payload shape validation via switch dispatch; TTY-aware prompts with non-TTY defaults

Evidence: cli/src/agent-tools/emit/validate.ts:36-50, cli/src/agent-tools/emit/validate.ts:287-318

## Observability

**Logging**: consola-based Logger via createLogger() factory; level-mapped (trace=5 through error=1); ANSI color formatting for CLI error output
**Metrics**: Derived from persisted run data (deriveRunStatus, getProjectRunStats)
**Tracing**: None; local SQLite event store with sequential IDs serves as audit trail

Evidence: cli/shared/errors.ts:179-238

## Testing Idioms

**Organization**: Tests under cli/src/__tests__/ mirror source structure; describe/test blocks with bun:test
**Fixtures**: beforeEach creates temp directories via createTempDir(); afterEach cleans with rm(); DB singleton reset (closeDatabase + resetInstance) between tests; clearCache() for state machine isolation
**Levels**: E2E integration tests exercising full pipeline (executeEmit through DB); helper functions like expectTaskRight unwrap TaskEither

Evidence: cli/src/__tests__/agent-tools/emit/emit.test.ts

## I/O & Integration

**Database**: bun:sqlite with singleton pattern; WAL mode + busy_timeout pragmas; schema versioning with additive migrations; parameterized queries with $-prefixed named params; RETURNING * for insert-then-read; CHECK constraints mirror TypeScript union types
**HTTP Clients**: React hooks fetch from /api/v2/ REST endpoints; WebSocket with subscription-based event notification; Octokit wrapper with status-code-aware error mapping (401/403/404/422 dispatch)

Evidence: cli/src/agent-tools/emit/database.ts:1-80, cli/src/agent-tools/github-pr/client.ts:31-131

## Concurrency & Async

**Async Usage**: TaskEither for async CLI operations wrapping Promise-based code; React hooks with useCallback/useEffect for async data fetching; useRef for mutable state across renders
**Patterns**: Debounced refetch on WebSocket events (setTimeout 500ms); optimistic UI updates via setRun functional updaters; reconnection reconciliation refetches full state; primitive destructuring for stable useCallback dependencies

Evidence: cli/web-ui/src/hooks/useRunDetail.ts:63-207, cli/web-ui/src/hooks/useRuns.ts:49-96

## Dependency & Configuration

**DI Pattern**: Manual wiring: singleton DB via getEmitDatabase(); interface + factory function pattern; React Context for WebSocket/Annotations; useContext hooks as dependency access
**Config Loading**: Environment variables (RP1_DB, RP1_ROOT, GITHUB_TOKEN); findRp1Root walks directory tree with git worktree fallback; schema version migration for config evolution

Evidence: cli/src/agent-tools/emit/database.ts:23-24, cli/shared/config.ts:20-131

## Extension Mechanisms

**Plugin Pattern**: Multi-platform build pipeline via LiquidJS templates + platform registries; Map-based registerTool/getTool/listTools pattern for agent tools
**Discovery**: State machine loading via cache -> bundle -> filesystem chain with TE.orElse fallback; Codex TOML must use literal strings (''') not basic strings

Evidence: cli/src/agent-tools/command.ts:68-74
