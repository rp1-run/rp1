# Implementation Patterns

**Repository**: rp1 Plugin System
**Current Project**: . (monorepo root)
**Last Updated**: 2025-12-21

## Naming & Organization

**Files**: kebab-case for all files (commands, agents, TypeScript modules)
**Functions**: camelCase for functions/methods, PascalCase for interfaces/types
**Imports**: Absolute imports with .js extension; fp-ts uses namespace pattern (E, TE)
**Agents**: kebab-case with descriptive suffixes (kb-spatial-analyzer, task-builder)

Evidence: `cli/src/build/parser.ts`, `plugins/base/agents/kb-spatial-analyzer.md`

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with readonly properties; discriminated unions for errors
**Type Strictness**: Strict typing throughout CLI; all interfaces use readonly modifiers
**Immutability**: Enforced via readonly arrays and properties

Evidence: `cli/src/build/models.ts`, `cli/shared/errors.ts`

## Error Handling

**Strategy**: Functional Either/TaskEither pattern via fp-ts; no thrown exceptions in business logic
**Propagation**: Errors lifted to Either and composed through pipe(); caught at CLI boundary
**Common Types**: ParseError, TransformError, ValidationError, InstallError, PrerequisiteError

Evidence: `cli/shared/errors.ts`, `cli/src/commands/build.ts`

## Validation & Boundaries

**Location**: API boundary validation in CLI commands; schema validation in build pipeline
**Method**: Two-level validation: L1 (syntax) and L2 (schema) with separate validator functions
**Early Rejection**: Validation errors returned as Left immediately; fail-fast pattern

Evidence: `cli/src/build/validator.ts`

## Observability

**Logging**: Custom Logger interface with LogLevel enum (trace, debug, info, warn, error)
**Metrics**: Confidence scoring (0-100) for reviewer verification
**Tracing**: Silent execution with thinking tags in agents
**Output**: ANSI color codes for terminal; formatError() for consistent display

Evidence: `cli/src/main.ts`, `cli/shared/errors.ts`

## Testing Idioms

**Organization**: Tests in cli/src/__tests__/ mirroring src/ structure
**Fixtures**: Helper functions (getFixturePath, createTempDir); fixtures in __tests__/fixtures/
**Levels**: Unit tests dominant; integration tests in __tests__/integration/
**Framework**: Bun test runner with describe/test/expect; custom fp-ts helpers (expectTaskRight, expectTaskLeft)

Evidence: `cli/src/__tests__/build/parser.test.ts`, `cli/src/__tests__/helpers/`

## I/O & Integration

**Filesystem**: Node.js fs/promises with async/await; TE.tryCatch wraps all I/O
**File Operations**: Recursive directory operations with proper error handling
**Path Handling**: Node path module for cross-platform; join/relative/dirname patterns

Evidence: `cli/src/install/installer.ts`, `cli/src/build/parser.ts`

## Command-Agent Pattern

**Commands**: Thin wrappers (50-100 lines): parse parameters, load context, spawn agent via Task tool
**Agents**: Autonomous workers (200-350 lines): constitutional structure, anti-loop directives, output contracts
**Separation**: Commands handle user interface/routing; agents handle business logic/workflow execution

Evidence: `plugins/base/commands/strategize.md`, `plugins/base/agents/kb-spatial-analyzer.md`

## Constitutional Prompting

**Structure**: YAML frontmatter + Parameters table + Numbered sections + Anti-loop + Output contract
**Execution**: Single-pass with anti-loop directive: "Do NOT ask for clarification or wait for feedback"
**Workflow Sections**: Context Loading → Analysis → Implementation → Output

Evidence: `docs/concepts/constitutional-prompting.md`, agent files

## Path References

**Variable Usage**: Always use `{RP1_ROOT}` for paths instead of hardcoded `.rp1/`
**Default**: `{RP1_ROOT}` defaults to `.rp1/` if not set via environment variable
**Rationale**: Supports custom root directories; maintains consistency across prompts

**Correct**:
- `{RP1_ROOT}/context/index.md`
- `{RP1_ROOT}/work/features/{FEATURE_ID}/`
- `{RP1_ROOT}/work/pr-reviews/`

**Incorrect**:
- `.rp1/context/index.md`
- `.rp1/work/features/`

**Exceptions**:
- Parameter table default values (e.g., `| RP1_ROOT | Environment | .rp1/ |`) - OK
- "defaults to `.rp1/`" explanations - OK
- Documentation describing the default location - OK

Evidence: All agent and command files in `plugins/`

## Progressive KB Loading

**Entry Point**: index.md serves as "jump off" point with context for any agent to start
**Selective Loading**: Agents read index.md first, then selectively Read additional files
**Loading Profiles**: Code review → patterns.md; Bug investigation → architecture.md + modules.md
**Subagent Constraint**: Use Read tool directly; SlashCommand causes early exit in subagents

Evidence: `CLAUDE.md`, KB-aware agent prompts

## Map-Reduce Orchestration

**KB Generation**: Spatial analyzer maps files → 4-5 parallel agents → Orchestrator merges + writes index.md
**PR Review**: Splitter segments diff → N sub-reviewers analyze → Synthesizer produces judgment
**Benefits**: Parallelization, scalability, specialized agents, holistic results

Evidence: `plugins/base/commands/knowledge-build.md`, `plugins/dev/commands/pr-review.md`

## Builder-Reviewer Loop

**Builder**: task-builder implements assigned tasks with full context awareness
**Reviewer**: task-reviewer verifies across 4 dimensions (discipline, accuracy, completeness, quality)
**Output**: Explicit SUCCESS or FAILURE with actionable feedback
**Retry**: On failure, builder retries with reviewer feedback

Evidence: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/task-reviewer.md`

## Extension Mechanisms

**Plugin Architecture**: Two-plugin system (base + dev); dev depends on base
**Skill System**: Shared capabilities in base plugin via SKILL.md files with trigger-rich descriptions
**Skill Archetypes**: Format Handler, Code Utility, Workflow Orchestrator, Data Transformer, Analysis Tool
**Comment-Fenced Injection**: `<!-- rp1:start -->` markers for updating injected content

Evidence: `cli/src/init/comment-fence.ts`, `plugins/base/skills/maestro/PATTERNS.md`
