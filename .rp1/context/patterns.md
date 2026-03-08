# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-03-08

## Naming & Organization

**Files**: kebab-case for TypeScript modules and agent .md files; SKILL.md as canonical entry point
**Functions**: camelCase for functions (executeCreate, deriveSteps, mapStatusValueToRunStatus); PascalCase for interfaces/types (CLIError, ToolResult, StateMachine, WebSocketHub)
**Imports**: Absolute with .js extension; fp-ts namespace imports: `import * as E from 'fp-ts/lib/Either.js'`; shared module re-exports in cli/shared/fp.ts

Evidence: cli/shared/fp.ts, cli/src/agent-tools/work/database.ts, cli/web-ui/src/server/routes/v2-api.ts

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with readonly properties throughout; discriminated unions with _tag field for CLIError (14 variants); string literal unions for status enums (StatusValue, RunStatus, StepStatus); ReadonlyMap and readonly arrays for collection types
**Type Strictness**: Strict typing everywhere; all interface fields use readonly; const assertions on arrays (as const)
**Immutability**: Enforced on every interface field across models (ToolResult, StatusUpdateRecord, SMState, V2Project, Run, Step, Artifact); mutable state only for singleton DB connection (documented deviation)

Evidence: cli/shared/errors.ts:12-38, cli/src/agent-tools/models.ts, cli/src/agent-tools/work/models.ts, cli/src/agent-tools/state-machine/models.ts, cli/web-ui/src/types/runs.ts

## Error Handling

**Strategy**: Functional Either/TaskEither from fp-ts; no thrown exceptions in business logic; errors are values in Left channel; factory functions for each error variant (usageError, runtimeError, parseError, etc.)
**Propagation**: Composed via pipe() with TE.chain (happy path); caught at CLI boundary with formatError() + process.exit(getExitCode(error)); web API boundary catches with try/catch returning errorResponse()
**Common Types**: ParseError, TransformError, ValidationError, GenerationError, InstallError, BackupError, PrerequisiteError, RuntimeError, UsageError, StrictModeError, VerificationError, NotFoundError, ConfigError, PortInUseError

Evidence: cli/shared/errors.ts, cli/src/agent-tools/command.ts:146-200, cli/web-ui/src/server/routes/v2-api.ts:48-57

## Validation & Boundaries

**Location**: Two-level: L1 (syntax/frontmatter) then L2 (schema/required fields) in build pipeline; CLI boundary validation for agent-tools (project path, feature name regex, status enum)
**Method**: Either-returning validation functions; regex patterns for feature names (^[a-z0-9-]+$); CHECK constraints in SQLite schema; VALID_STATUSES/VALID_ARTIFACT_TYPES const arrays for enum validation

Evidence: cli/src/agent-tools/work/database.ts:34-41, cli/src/agent-tools/command.ts:871-889, cli/src/agent-tools/work/models.ts:21-28

## Observability

**Logging**: createLogger with LogLevel enum (TRACE, DEBUG, INFO); optional logger injection via logger?: { debug: (msg: string) => void }; console.log for WebSocket connection events
**Metrics**: None detected - no prometheus/statsd integration
**Tracing**: Silent execution with <thinking> tags in agents; TTY-aware output (process.stdout.isTTY); spinner-based progress for CLI

Evidence: cli/src/main.ts:14,127-138, cli/web-ui/src/server/websocket.ts:129-136

## Testing Idioms

**Organization**: Tests in cli/src/__tests__/ mirroring src/ structure
**Fixtures**: Helper functions (getFixturePath, createTempDir, writeFixture); realistic test data with temp dir isolation; resetDatabaseInstance() for test cleanup
**Levels**: Unit tests dominant (1062 CLI tests); integration tests for full lifecycle; promptfoo-based evals for agent quality

Evidence: cli/src/__tests__/, cli/src/agent-tools/work/database.ts:689-691

## I/O & Integration

**Database**: SQLite via Bun native (bun:sqlite); singleton connection with WAL mode; migration-based schema with inline SQL (MIGRATIONS map, not filesystem); version tracked via PRAGMA user_version; prepared statements with parameterized queries ($-prefixed params); on-read pruning for expired rows
**HTTP Clients**: Bun.serve for web server; WebSocket via Bun native ServerWebSocket; dynamic route imports for lazy loading API handlers; JSON envelope responses via jsonResponse/errorResponse helpers

Evidence: cli/src/agent-tools/work/database.ts:90-193, cli/web-ui/src/server/http.ts:50-98, cli/web-ui/src/server/routes/v2-api.ts:48-57

## Concurrency & Async

**Async Usage**: async/await throughout CLI and server; TaskEither for composable async chains in business logic; WebSocketHub class manages concurrent client connections with Map-based state
**Patterns**: Sequential execution in CLI tool commands; setTimeout chaining (not setInterval) for serial status polling; heartbeat intervals for WebSocket keepalive with stale connection pruning

Evidence: cli/web-ui/src/server/websocket.ts:277-327, cli/src/agent-tools/work/database.ts:227-263
