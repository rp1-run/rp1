# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-03-09

## Naming & Organization

**Files**: kebab-case for TypeScript modules and agent .md files; SKILL.md as canonical entry point
**Functions**: camelCase for functions (executeCreate, deriveSteps); PascalCase for interfaces/types (CLIError, ToolResult, StateMachine)
**Imports**: Absolute with .js extension; fp-ts namespace imports: `import * as E from 'fp-ts/lib/Either.js'`; shared re-exports in cli/shared/fp.ts

Evidence: cli/shared/fp.ts, cli/src/agent-tools/work/database.ts, cli/src/agent-tools/git.ts

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with readonly properties; discriminated unions with `_tag` field for CLIError (14 variants); string literal unions for status enums; ReadonlyMap and readonly arrays for collection types; discriminated union ServerMessage/ClientMessage for WebSocket protocol
**Type Strictness**: Strict typing everywhere; all interface fields use readonly; const assertions on arrays (`as const`); explicit return type annotations
**Immutability**: Enforced on every interface field; mutable state only for singleton DB connection and WebSocketHub client Map (documented deviations)

Evidence: cli/shared/errors.ts:12-38, cli/src/agent-tools/models.ts, cli/web-ui/src/server/websocket.ts:83-97

## Error Handling

**Strategy**: Functional Either/TaskEither from fp-ts; no thrown exceptions in business logic; errors are values in Left channel; factory functions for each variant (usageError, runtimeError, parseError, etc.); tryCatchTE helper wraps async
**Propagation**: Composed via `pipe()` with `TE.chain` (happy path); caught at CLI boundary with `formatError()` + `process.exit(getExitCode(error))`; web API boundary catches with try/catch returning error Response; rollback-on-failure pattern in installer (`TE.orElse` triggers restore)
**Common Types**: ParseError, TransformError, ValidationError, GenerationError, InstallError, BackupError, PrerequisiteError, RuntimeError, UsageError, StrictModeError, VerificationError, NotFoundError, ConfigError, PortInUseError

Evidence: cli/shared/errors.ts, cli/src/agent-tools/command.ts:146-200, cli/src/install/installer.ts:991-1055

## Validation & Boundaries

**Location**: Two-level: L1 (syntax/frontmatter) then L2 (schema/required fields) in build pipeline; CLI boundary validation for agent-tools (project path, feature name regex, status enum); database CHECK constraints as final guard
**Method**: Either-returning validation functions; regex patterns for feature names (`^[a-z0-9-]+$`); CHECK constraints in SQLite schema; VALID_STATUSES/VALID_ARTIFACT_TYPES const arrays with `as const`; isValidFeatureName guard before dynamic SQL

Evidence: cli/src/agent-tools/work/database.ts:34-41, cli/src/agent-tools/command.ts:871-889

## Observability

**Logging**: createLogger with LogLevel enum (TRACE, DEBUG, INFO); optional logger injection via `logger?: { debug: (msg: string) => void }`; TTY-aware color output
**Metrics**: None detected
**Tracing**: Silent execution with `<thinking>` tags in agents; TTY-aware output (process.stdout.isTTY); spinner-based progress for CLI

Evidence: cli/src/main.ts:14,127-138, cli/web-ui/src/server/websocket.ts:128-137

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring `src/` structure
**Fixtures**: Helper functions (getFixturePath, createTempDir, writeFixture); realistic test data with temp dir isolation; resetDatabaseInstance() for test cleanup
**Levels**: Unit tests dominant (1062 CLI tests); integration tests for full lifecycle; promptfoo-based evals for agent quality

Evidence: cli/src/__tests__/, cli/src/agent-tools/work/database.ts:664-666

## I/O & Integration

**Database**: SQLite via Bun native (bun:sqlite); singleton connection with WAL mode; migration-based schema with inline SQL (MIGRATIONS Record<number, string>); version tracked via PRAGMA user_version; prepared statements with $-prefixed params; on-read pruning for expired rows; window functions for batch queries (ROW_NUMBER OVER PARTITION)
**HTTP Clients**: Bun.serve for web server; WebSocket via Bun native ServerWebSocket; dynamic route imports for lazy loading API handlers; JSON envelope responses via successResult/errorResult helpers; lazy module loading for heavy dependencies

Evidence: cli/src/agent-tools/work/database.ts:90-193, cli/web-ui/src/server/http.ts:50-98, cli/src/main.ts:30-33

## Concurrency & Async

**Async Usage**: async/await throughout CLI and server; TaskEither for composable async chains in business logic; WebSocketHub manages concurrent client connections with Map-based state; TE.Do/TE.bind for sequential async dependency resolution
**Patterns**: Sequential execution in CLI tool commands; setTimeout chaining for serial status polling; heartbeat intervals for WebSocket keepalive with stale connection cleanup (90s threshold); atomic staging with rename fallback for installation

Evidence: cli/web-ui/src/server/websocket.ts:277-327, cli/src/agent-tools/git.ts:211-223, cli/src/install/installer.ts:772-864
