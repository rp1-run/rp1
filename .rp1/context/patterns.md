# Implementation Patterns

**Project**: rp1 Plugin System
**Last Updated**: 2026-02-20

## Naming & Organization

**Files**: kebab-case for all files (commands, agents, skills, TypeScript modules)
**Functions**: camelCase for functions/methods; PascalCase for interfaces/types
**Imports**: Absolute imports with .js extension; fp-ts uses namespace pattern (E, TE, pipe)
**Agents**: kebab-case with descriptive suffixes (kb-spatial-analyzer, task-builder)

Evidence: `cli/src/main.ts`, `plugins/base/agents/kb-spatial-analyzer.md`

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with readonly properties; discriminated unions for errors (_tag field)
**Type Strictness**: Strict typing throughout CLI; all interfaces use readonly modifiers
**Immutability**: Enforced via readonly arrays and readonly properties on all model interfaces
**Type Guards**: Union types use `_tag` discriminant with named guard functions (isFallback, isResult)

Evidence: `cli/src/agent-tools/models.ts`, `cli/src/agent-tools/transform-args/plugin-locator.ts`

## Error Handling

**Strategy**: Functional Either/TaskEither pattern via fp-ts; no thrown exceptions in business logic
**Propagation**: Errors lifted to Either and composed through pipe(); caught at CLI boundary with formatError
**Fallback Chains**: TE.orElse for composable resolution fallback; TE.fold to convert errors to fallback values
**Common Types**: ParseError, ValidationError, PrerequisiteError, RuntimeError, PluginLookupError

Evidence: `cli/src/agent-tools/command.ts`, `cli/src/agent-tools/transform-args/plugin-locator.ts`

## Validation & Boundaries

**Location**: API boundary validation in CLI; fail-fast with Left returns
**Method**: Two-level validation: fencing validation (syntax) then field validation (schema); TE.tryCatch wraps async

Evidence: `cli/src/build/parser.ts`

## Observability

**Logging**: Custom Logger with LogLevel enum (TRACE, DEBUG, INFO); TTY-aware color formatting
**Metrics**: Confidence scoring (0-100) in agents for verification quality
**Tracing**: Silent execution with `<thinking>` tags in agents; progress callbacks in installers

Evidence: `cli/src/main.ts`, `plugins/dev/agents/task-reviewer.md`

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring src/ structure
**Fixtures**: Helper functions (getFixturePath, createTempDir); realistic test data
**Levels**: Unit tests dominant; integration tests for CLI flows
**Evals**: Promptfoo-based instruction-following tests with custom provider for tool call capture

Evidence: `cli/src/__tests__/`, `evals/providers/claude-with-tools.ts`

## I/O & Integration

**Filesystem**: Node.js fs/promises + Bun APIs; TE.tryCatch wraps all I/O; Bun.file() for reads
**Git Operations**: Shared git.ts utilities with GitContext pattern; getIsolatedGitEnv() clears env vars
**Worktree Safety**: Always use GitContext.repoRoot for mutations; cwd for read-only queries
**Process Spawning**: Bun spawn() with stdout:'pipe' for capture; exit code for success/failure

Evidence: `cli/src/agent-tools/git.ts`, `evals/src/attestation/commands.ts`

## Concurrency & Async

**Async Usage**: Async/await throughout CLI; TaskEither for composable async with error handling
**Parallelism**: Sequential loops in installers; parallel via A.sequence(TE.ApplicativePar) for batch operations

Evidence: `cli/src/agent-tools/mmd-validate/validator.ts`

## Command-Agent Pattern

**Commands**: Thin wrappers (50-100 lines): parse parameters, load context, spawn agent via Task tool
**Agents**: Autonomous workers (200-350 lines): constitutional structure, anti-loop directives, output contracts
**Separation**: Commands handle user interface/routing; agents handle business logic/workflow execution

## Constitutional Prompting

**Structure**: YAML frontmatter + Parameters table (Section 0) + Numbered workflow sections + Anti-loop + Output contract
**Execution**: Single-pass with anti-loop: "Do NOT ask for clarification or wait for feedback"
**Workflow Sections**: Context Loading -> Analysis -> Implementation -> Output

## Progressive KB Loading

**Entry Point**: index.md serves as jump-off point; agents read index.md first always
**Selective Loading**: Load additional files based on task: code review->patterns.md, bug->architecture.md+modules.md
**Subagent Constraint**: Use Read tool directly in subagents; SlashCommand causes early exit

## Map-Reduce Orchestration

**KB Generation**: Spatial analyzer maps files -> 4 parallel agents -> Orchestrator merges + writes files
**PR Review**: Splitter segments diff -> N sub-reviewers analyze -> Synthesizer produces judgment

## Builder-Reviewer Loop

**Builder**: task-builder implements with full context; writes implementation summary to tasks.md
**Reviewer**: task-reviewer verifies 7 dimensions: discipline, accuracy, completeness, quality, testing, commit, comments
**Output**: Explicit SUCCESS or FAILURE JSON with confidence score (0-100)
**Retry**: On failure, builder retries with reviewer feedback; max 3 attempts

## Feature Detection & Platform Abstraction

**Probe-on-First-Call**: First real operation doubles as availability check; result cached in boolean flag
**No-Op Guard**: When unavailable, all operations silently return null/empty -- zero errors, zero output
**Sub-Agent Delegation**: Orchestrator detects availability; sub-agents receive TASK_ID only when available
**Skill Loading**: Commands load platform skills at step boundaries via `§SKILL-LOADING` section

Evidence: `plugins/base/skills/task-coordination/SKILL.md`, `plugins/dev/commands/build.md`

## Shared Module Extraction

**Pattern**: Cross-cutting utilities extracted to `cli/src/shared/` for single-source-of-truth reuse
**Example**: getClaudePluginDirs in shared/paths.ts consumed by plugin-locator and verification modules
**Convention**: Pure functions with dependency injection (home dir parameter) for testability

Evidence: `cli/src/shared/paths.ts`, `cli/src/init/steps/verification.ts`

## Content-Addressable Hashing

**Algorithm**: SHA-256 with `sha256:` prefix convention for all content hashes
**Frontmatter Handling**: Strip YAML frontmatter before hashing so metadata changes don't invalidate
**Deps Hash**: Combined hash from lexicographically sorted file hashes joined with pipe separator

## Two-Phase Eval Workflow

**Phase 1 (Execution)**: Run promptfoo externally via Just recipe; outputs to fixed JSON file per suite
**Phase 2 (Attestation)**: Read output, validate 100% pass, update attestation manifest (no process spawning)

## Terse Prompt Authoring

**Structure-First**: Sections over prose; tables for decision matrices
**Compression-by-Default**: Every word must earn its place
**Safe Abbreviations**: req, impl, cfg, ctx, msg, fn, var, auth, config, env, ref, src
