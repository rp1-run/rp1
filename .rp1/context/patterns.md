# Implementation Patterns

**Project**: rp1 Plugin System
**Last Updated**: 2025-12-31

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

Evidence: `cli/src/agent-tools/rp1-root-dir/models.ts`, `cli/src/agent-tools/worktree/models.ts`

## Error Handling

**Strategy**: Functional Either/TaskEither pattern via fp-ts; no thrown exceptions in business logic
**Propagation**: Errors lifted to Either and composed through pipe(); caught at CLI boundary with formatError
**Common Types**: ParseError, ValidationError, PrerequisiteError, RuntimeError, UsageError, NotFoundError

Evidence: `cli/src/agent-tools/command.ts:127-158`, `cli/src/agent-tools/worktree/create.ts`

## Validation & Boundaries

**Location**: API boundary validation in CLI; fail-fast with Left returns
**Method**: Two-level validation: fencing validation (syntax) then field validation (schema); TE.tryCatch wraps async operations

Evidence: `cli/src/agent-tools/rp1-root-dir/resolver.ts:37-81`

## Observability

**Logging**: Custom Logger with LogLevel enum (TRACE, DEBUG, INFO); TTY-aware color formatting
**Metrics**: Confidence scoring (0-100) in agents for verification quality
**Tracing**: Silent execution with `<thinking>` tags in agents; progress callbacks in installers

Evidence: `cli/src/main.ts:51-61`, `plugins/dev/agents/task-reviewer.md`

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring src/ structure
**Fixtures**: Helper functions (getFixturePath, createTempDir); realistic test data
**Levels**: Unit tests dominant; integration tests for CLI flows
**Discipline**: 13 rules in task-builder: no trivial tests, black-box assertions, deterministic, mock only external boundaries

Evidence: `cli/src/__tests__/`, `plugins/dev/agents/task-builder.md:107-127`

## I/O & Integration

**Filesystem**: Node.js fs/promises + Bun APIs with async/await; TE.tryCatch wraps all I/O
**Git Operations**: Shared git.ts utilities with GitContext pattern; getIsolatedGitEnv() clears env vars to prevent context leakage
**Worktree Safety**: Always use GitContext.repoRoot for mutations; cwd for read-only queries

Evidence: `cli/src/agent-tools/git.ts:1-57`, `cli/src/agent-tools/worktree/create.ts`

## Concurrency & Async

**Async Usage**: Async/await throughout CLI; TaskEither for composable async with error handling
**Parallelism**: Sequential loops in installers; parallel via A.sequence(TE.ApplicativePar) for batch operations

Evidence: `cli/src/agent-tools/mmd-validate/validator.ts:107-121`

## Command-Agent Pattern

**Commands**: Thin wrappers (50-100 lines): parse parameters, load context, spawn agent via Task tool
**Agents**: Autonomous workers (200-350 lines): constitutional structure, anti-loop directives, output contracts
**Separation**: Commands handle user interface/routing; agents handle business logic/workflow execution

Evidence: `docs/concepts/command-agent-pattern.md`, `plugins/dev/agents/task-builder.md`

## Constitutional Prompting

**Structure**: YAML frontmatter + Parameters table (Section 0) + Numbered workflow sections + Anti-loop + Output contract
**Execution**: Single-pass with anti-loop: "Do NOT ask for clarification or wait for feedback"
**Workflow Sections**: Context Loading -> Analysis -> Implementation -> Output

Evidence: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/feature-architect.md`

## Progressive KB Loading

**Entry Point**: index.md serves as jump-off point; agents read index.md first always
**Selective Loading**: Load additional files based on task: code review->patterns.md, bug->architecture.md+modules.md, feature->modules.md+patterns.md
**Subagent Constraint**: Use Read tool directly in subagents; SlashCommand causes early exit

Evidence: `docs/concepts/knowledge-aware-agents.md`, AGENTS.md

## Map-Reduce Orchestration

**KB Generation**: Spatial analyzer maps files -> 4 parallel agents -> Orchestrator merges + writes files
**PR Review**: Splitter segments diff -> N sub-reviewers analyze -> Synthesizer produces judgment
**Benefits**: Parallelization, scalability, specialized agents, holistic results

Evidence: `docs/concepts/map-reduce-workflows.md`

## Builder-Reviewer Loop

**Builder**: task-builder implements with full context; writes implementation summary to tasks.md
**Reviewer**: task-reviewer verifies 7 dimensions: discipline, accuracy, completeness, quality, testing, commit, comments
**Output**: Explicit SUCCESS or FAILURE JSON with confidence score (0-100) and actionable feedback
**Retry**: On failure, builder retries with reviewer feedback; max 3 attempts

Evidence: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/task-reviewer.md`

## Tool Registration

**Pattern**: Registry pattern with Map; registerTool at module load; getTool/listTools for access
**Tool Result**: Standard ToolResult<T> envelope with success, tool, data, errors fields
**Lazy Loading**: Tools lazy-loaded via import statements in command.ts

Evidence: `cli/src/agent-tools/rp1-root-dir/index.ts:38-43`, `cli/src/agent-tools/command.ts:19-21`

## Stateless Agent Pattern

**Purpose**: Enable resumable, transparent interview workflows by externalizing state to scratch pad
**Response Types**: next_question | success | skip | error - agent returns JSON, caller handles user interaction
**Scratch Pad**: File-based state with Q&A format; removed on success, preserved on error

Evidence: `docs/concepts/stateless-agents.md`, `plugins/dev/agents/charter-interviewer.md`

## Path References

**Variable Usage**: Always use {RP1_ROOT} for paths; defaults to .rp1/ if not set
**Worktree Awareness**: resolveRp1Root() detects worktrees via git-common-dir and returns main repo's .rp1/

Evidence: `cli/src/agent-tools/rp1-root-dir/resolver.ts:22-47`

## Terse Prompt Authoring

**Structure-First**: Sections over prose; tables for decision matrices
**Compression-by-Default**: Every word must earn its place
**Safe Abbreviations**: req, impl, cfg, ctx, msg, fn, var, auth, config, env, ref, src
**Preserve Normative**: Exact wording for MUST/SHOULD/DO NOT

Evidence: `plugins/utils/skills/prompt-writer/SKILL.md`
