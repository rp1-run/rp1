# Implementation Patterns

**Project**: rp1 Plugin System
**Last Updated**: 2025-12-27

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

Evidence: `cli/src/init/models.ts`, `cli/src/build/models.ts`

## Error Handling

**Strategy**: Functional Either/TaskEither pattern via fp-ts; no thrown exceptions in business logic
**Propagation**: Errors lifted to Either and composed through pipe(); caught at CLI boundary with formatError
**Common Types**: ParseError, ValidationError, InstallError, BackupError, RuntimeError, UsageError, NotFoundError

Evidence: `cli/src/install/installer.ts:76-180`

## Validation & Boundaries

**Location**: API boundary validation in CLI; fail-fast with Left returns
**Method**: Two-level validation: fencing validation (syntax) then field validation (schema); TE.tryCatch wraps async operations

Evidence: `cli/src/init/index.ts`, `cli/src/agent-tools/mmd-validate/validator.ts`

## Observability

**Logging**: Custom Logger with LogLevel enum (TRACE, DEBUG, INFO); TTY-aware color formatting
**Metrics**: Confidence scoring (0-100) in agents for verification quality
**Tracing**: Silent execution with `<thinking>` tags in agents; progress callbacks (onProgress, onOverwrite) in installers

Evidence: `cli/src/main.ts:51-61`, `plugins/dev/agents/task-reviewer.md`

## Testing Idioms

**Organization**: Tests in `cli/src/__tests__/` mirroring src/ structure
**Fixtures**: Helper functions (getFixturePath, createTempDir); realistic test data
**Levels**: Unit tests dominant; integration tests for CLI flows
**Discipline**: 13 rules in task-builder for testing rigor

Evidence: `cli/src/__tests__/`, `plugins/dev/agents/task-builder.md:103-122`

## I/O & Integration

**Filesystem**: Node.js fs/promises with async/await; TE.tryCatch wraps all I/O
**File Operations**: Recursive operations (findFiles, copyDir) with chmod for permissions
**HTTP Clients**: fetch API in React hooks; WebSocket with reconnect backoff strategy

Evidence: `cli/src/install/installer.ts:30-70`, `cli/web-ui/src/providers/WebSocketProvider.tsx`

## Concurrency & Async

**Async Usage**: Async/await throughout CLI; TaskEither for composable async with error handling
**Parallelism**: Sequential loops in installers; parallel via A.sequence(TE.ApplicativePar) for batch operations

Evidence: `cli/src/agent-tools/mmd-validate/validator.ts:107-121`

## Command-Agent Pattern

**Commands**: Thin wrappers (50-100 lines): parse parameters, load context, spawn agent via Task tool
**Agents**: Autonomous workers (200-350 lines): constitutional structure, anti-loop directives, output contracts
**Separation**: Commands handle user interface/routing; agents handle business logic/workflow execution

Evidence: `docs/concepts/command-agent-pattern.md`, `plugins/base/agents/kb-spatial-analyzer.md`

## Constitutional Prompting

**Structure**: YAML frontmatter + Parameters table (Section 0) + Numbered workflow sections + Anti-loop + Output contract
**Execution**: Single-pass with anti-loop: "Do NOT ask for clarification or wait for feedback"
**Workflow Sections**: Context Loading -> Analysis -> Implementation -> Output

Evidence: `docs/concepts/constitutional-prompting.md`, `plugins/dev/agents/task-builder.md`

## Progressive KB Loading

**Entry Point**: index.md serves as jump-off point; agents read index.md first always
**Selective Loading**: Load additional files based on task:
- Code review -> patterns.md
- Bug investigation -> architecture.md, modules.md
- Feature implementation -> modules.md, patterns.md
- Strategic analysis -> ALL files
**Subagent Constraint**: Use Read tool directly in subagents; SlashCommand causes early exit

Evidence: `docs/concepts/knowledge-aware-agents.md`, AGENTS.md

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

## Module Exports

**Pattern**: Barrel exports via index.ts; grouped by type (Command, Models, Functions)
**Type Exports**: Use 'export type' for interface re-exports; functions exported directly

Evidence: `cli/src/build/index.ts`, `cli/src/install/index.ts`

## Tool Registration

**Pattern**: Registry pattern with Map; registerTool at module load; getTool/listTools for access
**Tool Result**: Standard ToolResult<T> envelope with success, tool, data, errors fields

Evidence: `cli/src/agent-tools/index.ts:39-64`, `cli/src/agent-tools/models.ts`

## Path References

**Variable Usage**: Always use {RP1_ROOT} for paths; defaults to .rp1/ if not set
**Rationale**: Supports custom root directories; maintains consistency across prompts

Evidence: `plugins/base/agents/kb-spatial-analyzer.md:24-26`

## Stateless Agent Pattern

**Purpose**: Enable resumable, transparent, and robust agent workflows by externalizing state to a visible scratch pad.

**Benefits**:
- **Resumability**: Interrupted sessions continue from scratch pad state
- **Transparency**: Users see accumulated Q&A during interviews
- **Robustness**: State survives AI session crashes; file-based persistence

**Architecture**:

| Role | Responsibility |
|------|----------------|
| Caller (Orchestrator) | Manages state persistence, handles user interaction (AskUserQuestion), parses agent responses, loops until terminal state |
| Stateless Agent | Reads all state from scratch pad (no memory), analyzes state to determine next action, returns structured JSON response, never interacts with user directly |

**Response Protocol Schema**:

```typescript
interface StatelessAgentResponse {
  type: "next_question" | "success" | "skip" | "error";
  next_question?: string;   // Present when type = "next_question"
  message?: string;         // Present for success/skip/error
  charter_complete?: boolean;
  metadata?: {
    question_number?: number;
    total_questions?: number;
    gaps_remaining?: string[];
  };
}
```

**Response Types**:

| Type | When Used | Caller Action |
|------|-----------|---------------|
| `next_question` | Agent needs more information | AskUserQuestion, write Q&A to scratch pad, re-invoke agent |
| `success` | All required information gathered | Remove scratch pad, finalize document |
| `skip` | Question can be skipped | Record skip in scratch pad, continue loop |
| `error` | Unrecoverable issue | Display error, preserve state for retry |

**Scratch Pad Format**:

```markdown
## Scratch Pad

<!-- Interview state - will be removed upon completion -->
<!-- Mode: CREATE | UPDATE | RESUME -->
<!-- Started: 2025-12-27T10:30:00Z -->

### Q1: Brain Dump
**Asked**: Tell me everything about this project...
**Answer**: We're building a task management app...

### Q2: Target Users
**Asked**: Who are the primary users?
**Skipped**: Already covered in brain dump response.

<!-- End scratch pad -->
```

**Scratch Pad Rules**:
1. Heading: Always `## Scratch Pad`
2. Metadata: Mode, start timestamp in HTML comments
3. Q&A Format: `### Q{N}: {Topic}` with `**Asked**:` and `**Answer**:` or `**Skipped**:`
4. Termination: Removed entirely upon successful completion
5. Preservation: Kept on error for retry/resume

**When to Use**: Multi-turn interview workflows requiring resumability. Standard agents suffice for single-pass workflows.

Evidence: `plugins/dev/agents/charter-interviewer.md`, `plugins/dev/commands/blueprint.md`
