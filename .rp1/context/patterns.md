# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-04-03

## Naming & Organization

**Files**: snake_case module files (models.ts, command.ts); feature directories group related modules (emit/, state-machine/, task/)
**Functions**: camelCase verbs: executeEmit, insertRun, validateReadOptions; factory constructors: usageError(), createLogger(); pure helpers: toKebabCase, renderHintToken
**Imports**: fp-ts via cli/shared/fp.ts facade with suffix convention (mapTE, chainTE, foldO, mapA); absolute imports with .js extensions; barrel re-exports via index.ts

Evidence: `cli/shared/fp.ts`, `cli/src/build/index.ts`, `cli/src/main.ts`

## Type & Data Modeling

**Data Representation**: Readonly interfaces with separate Row (snake_case DB) and Record (camelCase domain) interfaces connected by pure mapper functions; generic ToolResult<T> envelope for all agent tool output
**Type Strictness**: Discriminated unions using _tag (CLIError) and type (EventPayload, ServerMessage); as const assertions for constant arrays; ReadonlyMap for state machine states
**Immutability**: All model interfaces use readonly modifier including readonly arrays; DB row-to-record mappers create new objects

Evidence: `cli/shared/errors.ts`, `cli/shared/events.ts`, `cli/src/agent-tools/models.ts`, `cli/src/agent-tools/state-machine/models.ts`

## Error Handling

**Strategy**: fp-ts Either<CLIError, A> for sync, TaskEither<CLIError, A> for async; CLIError is a discriminated union with _tag field and 14 factory functions; tryCatchTE wraps Promise into TaskEither
**Propagation**: Validate at command boundary with E.left early return; TE.Do + TE.bind for multi-field validation pipelines; formatError() at output boundary with ANSI color; TE.orElse for fallback chains; ExitCode enum maps _tag to numeric codes
**Common Types**: UsageError, NotFoundError, ConfigError, RuntimeError, ParseError, TransformError, ValidationError, GenerationError, PrerequisiteError, InstallError, BackupError, VerificationError, StrictModeError, PortInUseError

Evidence: `cli/shared/errors.ts`, `cli/shared/config.ts`

## Validation & Boundaries

**Location**: CLI option parsing layer (validateEmitOptions, validateReadOptions, parseBuildArgs); each returns Either<CLIError, ValidatedInput>; two-tier L1/L2 build validation; lint rules as pure functions returning LintDiagnostic[]
**Method**: Manual validation with early E.left returns; TE.Do/TE.bind for composing; per-event-type payload shape validation via switch dispatch; TTY-aware prompts with non-TTY defaults

Evidence: `cli/shared/config.ts:30-40`, `cli/src/init/index.ts:124-132`

## Observability

**Logging**: consola-based Logger via createLogger() factory; level-mapped (trace=5 through error=1); ANSI color formatting
**Metrics**: Derived from persisted run data (deriveRunStatus, getProjectRunStats)
**Tracing**: Local SQLite event store with sequential IDs serves as audit trail; OpenTelemetry in evals package only

Evidence: `cli/src/main.ts:137-148`

## Testing Idioms

**Organization**: Tests under cli/src/__tests__/ mirror source structure; describe/test blocks with bun:test
**Fixtures**: beforeEach creates temp directories via createTempDir(); afterEach cleans with rm(); DB singleton reset (closeDatabase + resetInstance) between tests; clearCache() for state machine isolation
**Levels**: E2E integration tests exercising full pipeline (executeEmit through DB); helper functions like expectTaskRight unwrap TaskEither

Evidence: `cli/src/__tests__/`

## I/O & Integration

**Database**: bun:sqlite with singleton pattern; WAL mode + busy_timeout pragmas; schema versioning with additive migrations; parameterized queries with $-prefixed named params; RETURNING * for insert-then-read; CHECK constraints mirror TypeScript unions
**HTTP Clients**: React hooks fetch from /api/v2/ REST endpoints; WebSocket with discriminated union message types and reconnection recovery (state:snapshot + event:replay); Octokit wrapper with status-code-aware error mapping
**HTTP Server**: Bun.serve with regex-based route matching and lazy dynamic imports per route handler; most-specific-route-first ordering; WebSocket upgrade at /ws path

Evidence: `cli/web-ui/src/server/http.ts`, `cli/web-ui/src/server/websocket.ts`

## Concurrency & Async

**Async Usage**: TaskEither for async CLI operations wrapping Promise-based code; React hooks with useCallback/useEffect for async data fetching; dynamic imports for lazy loading (inquirer prompts, route handlers, agent-tools module)
**Parallelism**: Promise.all for parallel independent checks (detectTools + checkRp1Readiness); debounced refetch on WebSocket events (setTimeout 500ms); optimistic UI updates via functional updaters; process signal handlers (SIGTERM/SIGINT) for graceful cleanup

Evidence: `cli/src/init/index.ts:492-496`, `cli/src/main.ts:101-109`

## Dependency & Configuration

**DI Pattern**: Manual wiring: singleton DB via getEmitDatabase(); Map-based tool registry (registerTool/getTool/listTools) populated at module load time; React Context for WebSocket/Annotations
**Config Loading**: Environment variables (RP1_DB, GITHUB_TOKEN); project discovery via two-phase resolution: git worktree check then walk-up for .rp1/project_id; settings via TOML at global (~/.config/rp1/settings.toml) and project (.rp1/settings.toml) levels; runtime detection (Bun vs Node.js)

Evidence: `cli/shared/directory-resolution.ts`, `cli/shared/config.ts`

## Extension Mechanisms

**Build Pipeline**: Multi-platform via LiquidJS templates + PlatformDefinition registries; custom Liquid filters (pure functions) registered via registerFilters() and custom tags via registerTags(); post-render transforms (injectEmitHarness) per platform
**State Machine Loading**: cache -> bundle -> filesystem chain with TE.orElse fallback
**Identity**: CanonicalName with parse/format functions for plugin:artifact identity across platforms
**Lint Rules**: Pure functions aggregated into rule registry; (content, platform, file) => LintDiagnostic[]

Evidence: `cli/src/build/index.ts`, `docs/concepts/skill-format.md`
