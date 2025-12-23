# Implementation Patterns

**Project**: rp1 Plugin System
**Last Updated**: 2025-12-23

## Naming & Organization

**Files**: kebab-case for all files (commands, agents, skills, TypeScript modules)
**Functions**: camelCase for functions/methods; PascalCase for interfaces/types
**Imports**: Absolute imports with .js extension; fp-ts uses namespace pattern (E, TE, pipe)
**Agents**: kebab-case with descriptive suffixes (kb-spatial-analyzer, task-builder)

Evidence: `cli/src/build/parser.ts`, `plugins/base/agents/kb-spatial-analyzer.md`

## Type & Data Modeling

**Data Representation**: TypeScript interfaces with readonly properties; discriminated unions for errors
**Type Strictness**: Strict typing throughout CLI; all interfaces use readonly modifiers
**Immutability**: Enforced via readonly arrays and readonly properties on all model interfaces

Evidence: `cli/src/build/models.ts:10-46`, `cli/src/install/models.ts`

## Error Handling

**Strategy**: Functional Either/TaskEither pattern via fp-ts; no thrown exceptions in business logic
**Propagation**: Errors lifted to Either and composed through pipe(); caught at CLI boundary
**Common Types**: ParseError, GenerationError, ValidationError, InstallError, BackupError

Evidence: `cli/src/build/generator.ts:69-71`, `cli/src/build/parser.ts:40-43`

## Validation & Boundaries

**Location**: API boundary validation in CLI; schema validation via YAML frontmatter parsing
**Method**: Two-level: extractFrontmatter (syntax) then field validation (schema); fail-fast Left returns

Evidence: `cli/src/build/parser.ts:35-70`

## Observability

**Logging**: Custom progress callbacks (onProgress, onOverwrite) for installation; formatError for display
**Metrics**: Confidence scoring (0-100) in task-reviewer for verification quality
**Tracing**: Silent execution with `<thinking>` tags in agents; parent orchestrator handles user communication

Evidence: `plugins/dev/agents/task-reviewer.md:403-414`

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring src/ structure; fixtures in `__tests__/fixtures/`
**Fixtures**: Helper functions (getFixturePath, createTempDir); test files use realistic data
**Levels**: Unit tests dominant; integration tests for end-to-end CLI flows

Evidence: `cli/src/__tests__/`, `plugins/dev/agents/task-builder.md:103-122`

## I/O & Integration

**Filesystem**: Node.js fs/promises with async/await; TE.tryCatch wraps all I/O operations
**File Operations**: Recursive directory operations (findFilesRecursive, copyDir) with chmod for permissions
**Path Handling**: Node path module (join, relative, dirname) for cross-platform; Unix-style in agents

Evidence: `cli/src/install/installer.ts:29-70`, `cli/src/build/parser.ts:266-280`

## Concurrency & Async

**Async Usage**: Async/await throughout CLI; TaskEither for composable async operations with error handling
**Parallelism**: Sequential loops in installers; parallel agent execution via map-reduce orchestration

Evidence: `docs/concepts/map-reduce-workflows.md`, `cli/src/install/installer.ts:76-180`

## Extension Mechanisms

**Plugin Architecture**: Three-plugin system (base + dev + utils); dev depends on base for KB and skills
**Skill System**: Shared capabilities via SKILL.md files with trigger-rich descriptions in frontmatter
**Comment Fence**: `<!-- rp1:start -->` markers for updating injected content in CLAUDE.md

Evidence: `plugins/base/skills/maestro/SKILL.md`, `plugins/base/skills/mermaid/SKILL.md`

## Command-Agent Pattern

**Commands**: Thin wrappers (50-100 lines): parse parameters, load context, spawn agent via Task tool
**Agents**: Autonomous workers (200-350 lines): constitutional structure, anti-loop directives, output contracts
**Separation**: Commands handle user interface/routing; agents handle business logic/workflow execution

Evidence: `docs/concepts/command-agent-pattern.md`, `plugins/base/agents/kb-spatial-analyzer.md`

## Constitutional Prompting

**Structure**: YAML frontmatter + Parameters table + Numbered sections + Anti-loop + Output contract
**Execution**: Single-pass with anti-loop: "Do NOT ask for clarification or wait for feedback"
**Workflow Sections**: Context Loading -> Analysis -> Implementation -> Output

Evidence: `docs/concepts/constitutional-prompting.md`, `plugins/dev/agents/task-builder.md`

## Progressive KB Loading

**Entry Point**: index.md serves as jump-off point; agents read index.md first always
**Selective Loading**: Load additional files based on task: code review -> patterns.md; bugs -> architecture.md + modules.md
**Subagent Constraint**: Use Read tool directly in subagents; SlashCommand causes early exit

Evidence: `docs/concepts/knowledge-aware-agents.md`, `plugins/base/skills/knowledge-base-templates/SKILL.md:129-148`

## Map-Reduce Orchestration

**KB Generation**: Spatial analyzer maps files -> 4 parallel agents -> Orchestrator merges + writes files
**PR Review**: Splitter segments diff -> N sub-reviewers analyze -> Synthesizer produces judgment
**Benefits**: Parallelization, scalability, specialized agents, holistic results

Evidence: `docs/concepts/map-reduce-workflows.md`

## Builder-Reviewer Loop

**Builder**: task-builder implements with full context; writes implementation summary to tasks.md
**Reviewer**: task-reviewer verifies 6 dimensions: discipline, accuracy, completeness, quality, testing, comments
**Output**: Explicit SUCCESS or FAILURE JSON with confidence score (0-100) and actionable feedback
**Retry**: On failure, builder retries with reviewer feedback; max 3 attempts

Evidence: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/task-reviewer.md`

## Path References

**Variable Usage**: Always use {RP1_ROOT} for paths; defaults to .rp1/ if not set
**Rationale**: Supports custom root directories; maintains consistency across prompts

Evidence: `plugins/base/agents/kb-spatial-analyzer.md:24-26`
