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

## Builder-Reviewer Loop

**Builder**: task-builder implements with full context; writes implementation summary to tasks.md
**Reviewer**: task-reviewer verifies 7 dimensions: discipline, accuracy, completeness, quality, testing, commit, comments
**Output**: Explicit SUCCESS or FAILURE JSON with confidence score (0-100) and actionable feedback
**Retry**: On failure, builder retries with reviewer feedback; max 3 attempts

Evidence: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/task-reviewer.md`

## Stateless Agent Pattern

**Purpose**: Enable resumable, transparent interview workflows by externalizing state to scratch pad
**Response Types**: next_question | success | skip | error - agent returns JSON, caller handles user interaction
**Scratch Pad**: File-based state with Q&A format; removed on success, preserved on error

Evidence: `docs/concepts/stateless-agents.md`, `plugins/dev/agents/charter-interviewer.md`

## Content-Addressable Hashing

**Algorithm**: SHA-256 with sha256: prefix convention for all content hashes
**Frontmatter Handling**: Strip YAML frontmatter before hashing so metadata changes don't invalidate
**Deps Hash**: Combined hash from lexicographically sorted file hashes joined with pipe separator

Evidence: `evals/src/attestation/prompt-hash.ts`, `evals/src/attestation/deps-graph.ts`

## Two-Phase Eval Workflow

**Phase 1 (Execution)**: Run promptfoo externally via Just recipe; outputs to fixed JSON file per suite
**Phase 2 (Attestation)**: Read output, validate 100% pass, update attestation manifest (no process spawning)
**Rationale**: Prevents fork-bomb behavior when attestCommand runs with concurrency > 1

Evidence: `Justfile`, `evals/src/attestation/commands.ts`

## Motion & Animation (Web UI)

**Centralized Variants**: All framer-motion variant definitions live in `motion-config.ts` (page, stagger, card, overlay). Components import variants rather than defining inline.
**Reduced-Motion Hook**: `usePrefersReducedMotion()` wraps `useMediaQuery("(prefers-reduced-motion: reduce)")`. Decoupled from framer-motion; returns boolean.
**Conditional Variant Selection**: Components select between animated and reduced variants based on the hook: `reducedMotion ? pageVariantsReduced : pageVariants`. Reduced variants set zero duration and final-state values.
**CSS Glow Pulse**: Status glow animations use CSS `@keyframes glow-pulse` with `--glow-color` custom property for GPU-composited box-shadow cycling. `@media (prefers-reduced-motion: reduce)` disables animation with static fallback.
**Status Color Mapping**: `status-colors.ts` provides `statusBorderColors` and `statusGlowColors` Record<RunStatus, string> for consistent status-to-visual mapping across components.

Evidence: `cli/web-ui/src/lib/motion-config.ts`, `cli/web-ui/src/hooks/usePrefersReducedMotion.ts`, `cli/web-ui/src/lib/status-colors.ts`

## Framer-Motion + Radix Dialog Integration

**Pattern**: Keep Radix Dialog for accessibility (focus-trap, aria, Escape-to-close). Override built-in CSS animations with framer-motion via `forceMount` on Portal/Overlay/Content + `AnimatePresence` wrapping.
**Implementation**: Custom `AnimatedCommandDialog` composes Radix Dialog primitives directly with `motion.div` wrappers. Backdrop uses `overlayBackdropVariants` (150ms fade); panel uses `overlayPanelVariants` (scale 0.95->1.0 + opacity). Results list uses `staggerContainer`/`staggerItem` with `delayChildren` after panel animation.
**Glass Effect**: Applied via `.glass` CSS utility class on dialog surfaces. Combined with framer-motion scale animation using flexbox centering (not translate-based) to avoid transform conflicts.

Evidence: `cli/web-ui/src/components/v2/CommandPalette.tsx`, `cli/web-ui/src/components/v2/ShortcutHelpOverlay.tsx`

## Declarative State Machine (Embedded + Validation)

**Embedded Convention**: Skills and agents opt in to state management by adding a `## STATE-MACHINE` section with a `stateDiagram-v2` mermaid block directly in their markdown file (SKILL.md or agent .md). Presence of this section is the sole opt-in; absence means no state tracking, no validation, no dashboard visibility.
**Two-Layer State Model**: StatusValue (activity: started, in_progress, waiting-input, needs-review, completed, failed) and WorkflowState (phase: e.g., requirements, design, build) are orthogonal dimensions. StatusValue is unchanged; WorkflowState is carried in the `step` field, validated against the embedded state diagram.
**Extraction**: `extractStateMachineMermaid(markdownContent)` finds `## STATE-MACHINE` section, extracts first `stateDiagram-v2` mermaid fence block. Returns content or null.
**Parse Pipeline**: `raw text -> mermaid-ast parseStateDiagram() -> transformAstToStateMachine() -> StateMachine`. Transform rejects unsupported features (nested states, fork/join). Returns `Either<CLIError, StateMachine>`.
**Transition Validation**: CLI `--workflow` flag loads the state machine; adapter's `validateTransition()` checks edge existence; invalid transitions are rejected with error listing valid next states. First update must target an initial state.
**Agent State Machines**: `--agent` flag routes validation to the named agent's state machine. `--task` flag enables per-task state tracking where each task progresses independently through the agent's state diagram.
**Run Isolation**: `--run-id` (UUID) groups status updates per workflow invocation. `--ttl` (default 28800s/8h) sets `expires_at` on each row. Expired rows are filtered on read (on-read pruning), not deleted automatically. Manual cleanup via `rp1 agent-tools work cleanup`.
**STATE-MACHINE Section**: Contains the embedded mermaid state diagram and a CLI command template instructing agents to generate a run-id UUID and report transitions via `work update --workflow --run-id --step --status`.
**Dynamic Step Derivation**: v2 API loads state machines via loader, calls `deriveOrderedSteps()` (BFS from initial states) to replace hardcoded step arrays. New skills/agents with embedded state machines appear in dashboard automatically. Agent sub-states are grouped within parent workflow steps.

Evidence: `cli/src/agent-tools/state-machine/`, `plugins/dev/skills/build/SKILL.md`, `cli/web-ui/src/server/routes/v2-api.ts`

## Terse Prompt Authoring

**Structure-First**: Sections over prose; tables for decision matrices
**Compression-by-Default**: Every word must earn its place
**Safe Abbreviations**: req, impl, cfg, ctx, msg, fn, var, auth, config, env, ref, src

Evidence: `plugins/utils/skills/prompt-writer/SKILL.md`
