# Implementation Patterns

## Naming Conventions

- **files**: snake_case module files (models.ts, command.ts, database.ts); feature directories group related modules (emit/, state-machine/, task/)
- **functions**: camelCase verbs: executeEmit, insertRun, deriveRunStatus, validateTransition; factory constructors: usageError(), runtimeError()
- **imports**: fp-ts imported as namespace aliases (E for Either, TE for TaskEither, O for Option); re-exported via shared/fp.ts facade; absolute imports with .js extensions
- **Evidence**: cli/shared/fp.ts, cli/shared/errors.ts, cli/src/agent-tools/emit/database.ts

## Type Patterns

- **data_modeling**: Readonly interfaces with readonly fields for all domain models; discriminated unions using _tag field for CLIError; separate Row interfaces (snake_case DB) mapped to Record interfaces (camelCase domain) via pure mapper functions
- **type_strictness**: Strict typing throughout: generic ToolResult<T> envelope, typed EventType/Status unions, readonly arrays and ReadonlyMap in state machine models
- **immutability**: All model interfaces use readonly modifier; DB row-to-record mappers create new objects; React state updates use spread operator for immutable transitions
- **Evidence**: cli/shared/errors.ts:12-38, cli/src/agent-tools/models.ts, cli/src/agent-tools/state-machine/models.ts, cli/src/agent-tools/emit/database.ts:221-318

## Error Handling

- **strategy**: fp-ts Either<CLIError, A> for sync operations, TaskEither<CLIError, A> for async; CLIError is a discriminated union with _tag field and factory functions
- **propagation**: Validate at command boundary with E.left early return; chain operations with pipe/E.chain; format errors at output boundary with formatError(); each CLI action checks E.isLeft and exits with createErrorResponse
- **common_types**: UsageError, NotFoundError, ConfigError, RuntimeError, ParseError, ValidationError
- **Evidence**: cli/shared/errors.ts, cli/src/agent-tools/command.ts:170-206, cli/src/build/command.ts:125-214

## Validation

- **location**: CLI option parsing layer (validateEmitOptions, parseBuildArgs, parseArcadeArgs); each returns Either<CLIError, ValidatedInput>
- **method**: Manual validation with early E.left returns for invalid inputs; Commander.js requiredOption for presence checks; parseInt with isNaN guards for numeric args
- **Evidence**: cli/shared/config.ts:64-74, cli/src/build/command.ts:125-214, cli/src/agent-tools/command.ts:843-855

## Testing

- **organization**: Tests under cli/src/__tests__/ mirror source structure; describe/test blocks with bun:test
- **fixtures**: beforeEach creates temp directories via createTempDir(); afterEach cleans up with rm(); DB singleton reset pattern (closeDatabase + resetInstance) between tests
- **levels**: E2E integration tests exercising full pipeline (executeEmit through DB); helper functions like expectTaskRight unwrap TaskEither for assertions
- **Evidence**: cli/src/__tests__/agent-tools/emit/emit.test.ts

## I/O Patterns

- **database**: bun:sqlite with singleton pattern via module-level dbInstance; WAL mode + busy_timeout pragmas; schema versioning with additive migrations via applyMigrations; parameterized queries with $-prefixed named params; RETURNING * for insert-then-read
- **http_clients**: React hooks fetch from /api/v2/ REST endpoints; WebSocket for real-time event push with exponential backoff reconnection
- **Evidence**: cli/src/agent-tools/emit/database.ts:126-433, cli/web-ui/src/hooks/useRunDetail.ts:30-56, cli/web-ui/src/providers/WebSocketProvider.tsx:95-204

## Concurrency

- **async_usage**: TaskEither for async CLI operations wrapping Promise-based code; React hooks with useCallback/useEffect for async data fetching; WebSocket provider manages connection lifecycle
- **patterns**: Debounced refetch on WebSocket events (setTimeout 500ms); optimistic UI updates via setState before server reconciliation; exponential backoff for WS reconnection (2s initial, 30s max)
- **Evidence**: cli/web-ui/src/hooks/useRunDetail.ts:63-184, cli/web-ui/src/providers/WebSocketProvider.tsx:43-47

## Dependency Injection

- **injection**: Manual wiring: singleton DB via getEmitDatabase(); React Context for WebSocket (WebSocketProvider) and Annotations (AnnotationProvider); useContext hooks as dependency access
- **config**: Environment variables (RP1_DB, RP1_ROOT, GITHUB_TOKEN); findRp1Root walks directory tree with git worktree fallback; BuildConfig/ArcadeConfig parsed from CLI args
- **Evidence**: cli/src/agent-tools/emit/database.ts:23-24, cli/shared/config.ts:20-62, cli/web-ui/src/providers/WebSocketProvider.tsx:280-286

## Extension Points

- **mechanism**: Multi-platform build pipeline: same markdown source in plugins/ is transformed via LiquidJS templates + platform registries (defaultRegistry, codexRegistry, claudeCodeRegistry) to target OpenCode, Codex, and Claude Code
- **Evidence**: cli/src/build/command.ts:111-120

## Observability

- **logging**: Event-driven observability via SQLite event store; no structured logging framework; console output for CLI user feedback with ANSI color formatting
- **metrics**: Derived from persisted run data (deriveRunStatus, getProjectRunStats); build summaries aggregate counts
- **tracing**: None detected; local SQLite event store with sequential IDs serves as audit trail
- **Evidence**: cli/src/agent-tools/emit/database.ts:648-701, cli/shared/errors.ts:179-238
