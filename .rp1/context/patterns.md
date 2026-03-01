# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-03-01

## Naming & Organization

**Files**: kebab-case (TypeScript modules, agent .md files, skill directories); `SKILL.md` canonical entry
**Functions**: camelCase for functions (copyArtifacts, parseBuildArgs); PascalCase for interfaces (CLIError, ToolResult)
**Imports**: Absolute with .js extension; fp-ts namespace: `import * as E from 'fp-ts/lib/Either.js'`, `import { pipe } from 'fp-ts/lib/function.js'`
**Directory**: By-layer in CLI (build/, install/, agent-tools/); by-plugin in prompts (plugins/{name}/skills/, agents/)

Evidence: cli/src/build/command.ts, cli/shared/errors.ts

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with `readonly` properties throughout; discriminated unions with `_tag` field for error types (CLIError: 13 variants)
**Type Strictness**: Strict typing; all interface fields use `readonly`; `readonly string[]` for collections
**Immutability**: Enforced on every interface field (InstallResult, BackupManifest, ToolResult); no mutable model types
**Result Envelopes**: `ToolResult<T>` with `{success, tool, data, errors?}` for agent tool output

Evidence: cli/shared/errors.ts:12-38, cli/src/agent-tools/models.ts

## Error Handling

**Strategy**: Functional Either/TaskEither from fp-ts; no thrown exceptions in business logic; errors are values in Left channel
**Propagation**: Composed via `pipe()` with `TE.chain` (happy path), `TE.orElse` (recovery); caught at CLI boundary with `formatError()`
**Common Types**: ParseError, TransformError, ValidationError, GenerationError, InstallError, BackupError, PrerequisiteError, RuntimeError, UsageError, StrictModeError, VerificationError
**Recovery**: Installer uses `TE.orElse` for automatic rollback: on failure → restoreFromBackup → re-throw original

Evidence: cli/shared/errors.ts, cli/src/install/installer.ts:970-1022

## Validation & Boundaries

**Location**: Two-level in build pipeline: L1 (syntax/frontmatter) then L2 (schema/required fields); fail-fast with `E.left`
**Method**: YAML frontmatter extraction returning Either; field-level schema checks; generated output re-validated before write

Evidence: cli/src/build/validator.ts, cli/src/build/parser.ts

## Observability

**Logging**: Optional logger injection via `logger?: { debug: (msg: string) => void }`; progress callbacks via `onProgress?: (message: string) => void`
**Tracing**: Silent execution with `<thinking>` tags in agents; spinner-based progress for TTY-aware output

Evidence: cli/src/install/installer.ts:91-97

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring `src/` structure
**Fixtures**: Helper functions (getFixturePath, createTempDir, writeFixture); realistic test data with temp dir isolation
**Levels**: Unit tests dominant (1062 CLI tests); integration tests for full lifecycle; promptfoo-based evals for agent quality

Evidence: cli/src/__tests__/

## I/O & Integration

**Filesystem**: All fs operations wrapped in `TE.tryCatch()`; recursive helpers (findFiles, copyDir, countFiles); atomic rename via `fs.rename` with copy+delete fallback
**Database**: SQLite (Bun native) for work status tracking; migration-based schema; no ORM

Evidence: cli/src/install/installer.ts:42-82, cli/src/assets/extractor.ts:39-53

## Concurrency & Async

**Async Usage**: async/await throughout CLI; TaskEither for composable async chains; sequential loops for installers
**Parallelism**: Parallel agent spawning in prompt orchestrators (single message with multiple Task calls); sequential in TypeScript CLI code

Evidence: plugins/dev/skills/build/SKILL.md:325-331

## Build Pipeline (rp1-specific)

**Stages**: parse → transform → generate → validate. Each stage returns `Either<CLIError, T>`; errors collected, pipeline continues for other files
**Namespace Rewriting**: Build prepends `rp1-` prefix to skill directories; updates name field in generated frontmatter
**Bundle Embedding**: `generate-asset-imports.ts` reads bundle-manifest.json → generates `embedded.ts` with `{ type: "file" }` imports for Bun bundler

Evidence: cli/src/build/command.ts:396-501, cli/scripts/generate-asset-imports.ts

## Atomic Installation (rp1-specific)

**Pattern**: backup existing → stage to `.rp1-staging` → verify contents → commit via atomic rename → cleanup. On failure: restore from backup + re-throw
**Namespace Safety**: Only `rp1-*` artifacts installed/removed; user files preserved. Check: `entry.name.startsWith('rp1-')`
**Legacy Cleanup**: Removes old singular-form dirs (command/, agent/, skill/) during install

Evidence: cli/src/install/installer.ts:522-828, cli/src/assets/extractor.ts

## Constitutional Agent (rp1-specific)

**Structure**: YAML frontmatter → Parameters table → Numbered workflow sections → Anti-loop directives → Output contract (JSON)
**Anti-Loop**: Every agent ends with: "Do NOT ask for clarification", "Execute ONCE", "STOP after output"
**Silent Execution**: Work in `<thinking>` tags; output ONLY final JSON; parent orchestrator handles user communication

Evidence: plugins/base/agents/kb-spatial-analyzer.md, plugins/dev/skills/build/SKILL.md

## Tool Registry (rp1-specific)

**Pattern**: `Map<string, ToolEntry>` with registerTool/getTool/listTools; `ToolExecutor<T>` returns `TE.TaskEither<CLIError, ToolResult<T>>`
**Lazy Loading**: Agent-tools module lazily loaded only when `agent-tools` subcommand invoked to avoid puppeteer at startup

Evidence: cli/src/agent-tools/index.ts, cli/src/agent-tools/models.ts
