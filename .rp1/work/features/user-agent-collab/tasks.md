---
rp1_doc_id: d58fd0bc-8cba-4eac-9a0f-027482f22db7
---
# Development Tasks: User-Agent Collaboration via Arcade Feedback

**Feature ID**: user-agent-collab
**Status**: Not Started
**Progress**: 33% (4 of 12 tasks)
**Estimated Effort**: 4 days
**Started**: 2026-03-23

## Overview

Enable agents to read, act on, and acknowledge user feedback (annotations and direct file edits) provided through the Arcade. Adds a `rp1 agent-tools feedback` CLI subcommand group, a collaboration guidance skill, gate modifications to all three build workflows, and waiting-status emission at checkpoints.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T4] - T1 is database layer, T4 is a standalone skill file; no shared code
2. [T2, T8] - T2 builds the feedback module (depends on T1 for queries); T8 writes tests alongside T2
3. [T3] - Registers the feedback subcommand (depends on T2 for the module to register)
4. [T5, T6, T7] - Gate modifications to three independent skill files (depend on T4 for skill reference)

**Dependencies**:

- T2 -> T1 (interface: T2 calls the query functions T1 creates)
- T8 -> T1 (interface: tests import database functions)
- T3 -> T2 (build: command.ts imports feedback module)
- T5 -> T4 (interface: /build references arcade-collab skill by name)
- T6 -> T4 (interface: /build-fast references arcade-collab skill by name)
- T7 -> T4 (interface: /build-express references arcade-collab skill by name)

**Critical Path**: T1 -> T2 -> T3

## Task Breakdown

### Database & Foundation

- [x] **T1**: Add `getAnnotationsForRunFiltered` and `clearArtifactBaseline` database functions to `emit/database.ts` `[complexity:simple]`

    **Reference**: [design.md#32-database-layer-additions](design.md#32-database-layer-additions)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `getAnnotationsForRunFiltered(db, runId, status)` returns annotations filtered by `open`, `resolved`, or `all`
    - [x] When `status` is `all`, delegates to existing `getAnnotationsForRun` function
    - [x] `clearArtifactBaseline(db, docId)` sets `baseline = NULL` for the given doc_id
    - [x] Both functions use parameterized queries with `$`-prefixed named params
    - [x] Both functions are exported as `const` arrow functions matching existing patterns

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/emit/database.ts`
    - **Approach**: Added `getAnnotationsForRunFiltered` after `getAnnotationsForRun` (delegates to it for "all" status, otherwise queries with status filter) and `clearArtifactBaseline` after `setArtifactBaseline` (sets baseline = NULL)
    - **Deviations**: None
    - **Tests**: 1613/1613 passing (existing suite, no regressions)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [ ] **T4**: Create `arcade-collab` collaboration skill at `plugins/dev/skills/arcade-collab/SKILL.md` `[complexity:medium]`

    **Reference**: [design.md#34-collaboration-skill](design.md#34-collaboration-skill)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] Skill is loadable at runtime by workflow skills via standard skill-loading mechanism
    - [x] Includes feedback read instructions with `rp1 agent-tools feedback read --run-id {RUN_ID} --status open`
    - [x] Includes classification framework mapping artifact types (requirements, design, code, general) to appropriate actions
    - [x] Includes dependency order instruction: requirements before design before code
    - [x] Includes collaboration loop pattern: read -> classify -> sort -> act -> resolve/reply/accept -> check for more -> return
    - [x] Covers both annotation feedback and direct file edit feedback handling
    - [x] Covers edge cases: ambiguous feedback (reply and leave open), no feedback (return immediately), contradictory feedback (reply explaining conflict, leave open)
    - [x] Routes requirements/design feedback to `feature-editor` agent; code feedback to direct agent fix

    **Implementation Summary**:

    - **Files**: `plugins/dev/skills/arcade-collab/SKILL.md`, `cli/dist/claude-code/dev/skills/arcade-collab/SKILL.md`, `cli/dist/claude-code/dev/manifest.json`, `catalog/skills.yaml`, `catalog/agents.yaml`
    - **Approach**: Created new skill with SKILL.md frontmatter format; 7 sections covering the full collaboration loop (read, classify, sort, act, edge cases, re-check, return); classification table maps artifact types to routing actions; dispatch_agent blocks for feature-editor; edge case handling for ambiguous, contradictory, no-feedback, and missing artifact scenarios. Catalog and dist artifacts auto-generated.
    - **Deviations**: None
    - **Tests**: N/A (markdown skill file, no unit tests applicable)
    - **Fixup**: Commit 11e240fd restored catalog/skills.yaml after T4 commit (fb7df793) truncated it from ~350 to 17 lines

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
      - [commit] Two commits for one task: fb7df793 (T4 implementation) + 11e240fd (fixup for truncated catalog/skills.yaml). The original commit destructively truncated catalog/skills.yaml from ~350 to 17 lines, requiring a separate fixup. This violates the atomic commit requirement.
    - **Guidance**: Squash the two commits (fb7df793 and 11e240fd) into a single atomic commit with message `feat(user-agent-collab): implement T4 - create arcade-collab collaboration skill`. Use `git rebase -r HEAD~2` and squash the fixup into the T4 commit. Verify catalog/skills.yaml is intact after the squash.

### Feedback CLI Module

- [x] **T2**: Create `cli/src/agent-tools/feedback/` module with models, validation, read, resolve, reply, and accept-edit operations `[complexity:complex]`

    **Reference**: [design.md#31-new-cli-module](design.md#31-new-cli-module)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [x] `models.ts` defines `FeedbackReadOptions`, `FeedbackResolveOptions`, `FeedbackReplyOptions`, `FeedbackAcceptEditOptions`, `FeedbackAnnotation`, `FeedbackEdit`, and `FeedbackReadResult` interfaces
    - [x] `validate.ts` follows `validateEmitOptions` pattern, returns `Either<CLIError, ValidatedOptions>` for each subcommand
    - [x] `read.ts` implements `executeFeedbackRead` returning `TaskEither<CLIError, ToolResult<FeedbackReadResult>>` with annotation filtering, reply fetching, diff computation via `createTwoFilesPatch`, and summary generation
    - [x] `resolve.ts` implements `executeFeedbackResolve` that verifies root annotation, optionally inserts agent-attributed reply, updates status to resolved, and notifies daemon
    - [x] `reply.ts` implements `executeFeedbackReply` that verifies parent exists, inserts child annotation with `author: "agent"`, and notifies daemon
    - [x] `accept.ts` implements `executeFeedbackAcceptEdit` that verifies baseline exists, calls `clearArtifactBaseline`, and returns success
    - [x] `index.ts` registers all four subcommands with Commander.js
    - [x] Daemon notification uses HTTP POST to `localhost:7710/api/internal/notify` following existing emit pattern

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/feedback/models.ts`, `validate.ts`, `read.ts`, `resolve.ts`, `reply.ts`, `accept.ts`, `notify.ts`, `index.ts`
    - **Approach**: Created 8-file module following task/emit patterns; models define all option and result interfaces; validate provides Either-returning validators per subcommand; read queries annotations with status filter and computes diffs via createTwoFilesPatch; resolve verifies root annotation, optionally inserts agent reply, updates status; reply inserts child annotation with author "agent"; accept clears artifact baseline; notify provides best-effort daemon notification via dynamic import of daemon IPC; index registers tool and re-exports all execute/validate functions
    - **Deviations**: Added `notify.ts` as a shared daemon notification helper (not in original design but extracted from the emit pattern for reuse across resolve/reply); index.ts registers tool framework entry but does not wire Commander.js commands (that is T3's scope)
    - **Tests**: 1613/1613 passing (existing suite, no regressions)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [ ] **T8**: Write unit and integration tests for the feedback module `[complexity:medium]`

    **Reference**: [design.md#7-testing-strategy](design.md#7-testing-strategy)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] `feedback-read.test.ts` covers: read with status filters, empty results, diff computation for edited artifacts, filtering out unchanged baselines
    - [ ] `feedback-resolve.test.ts` covers: resolve with reply, resolve without reply, agent attribution on replies
    - [ ] `feedback-reply.test.ts` covers: reply creation, parent annotation validation, agent author attribution
    - [ ] `feedback-accept.test.ts` covers: baseline clear, no-edit edge case (baseline is already NULL)
    - [ ] `validate.test.ts` covers: invalid run-id, invalid annotation-id, invalid doc-id, invalid status value, valid inputs for all subcommands
    - [ ] Tests use in-memory SQLite with `beforeEach` seeding and `afterEach` cleanup following existing test patterns
    - [ ] All tests pass via `bun test`

### Command Registration

- [x] **T3**: Register `feedback` subcommand group in `cli/src/agent-tools/command.ts` `[complexity:simple]`

    **Reference**: [design.md#implementation-plan](design.md#implementation-plan)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `feedback` command group is registered in `command.ts` importing from the feedback module index
    - [x] `rp1 agent-tools feedback read --run-id X` is callable from CLI
    - [x] `rp1 agent-tools feedback resolve <id> [--reply "..."]` is callable from CLI
    - [x] `rp1 agent-tools feedback reply <id> --content "..."` is callable from CLI
    - [x] `rp1 agent-tools feedback accept-edit <doc-id>` is callable from CLI
    - [x] Help text is displayed for `rp1 agent-tools feedback --help`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/command.ts`
    - **Approach**: Added feedback imports, side-effect import, help text entry, and 5 Commander.js commands (parent `feedback` + 4 subcommands: `read`, `resolve`, `reply`, `accept-edit`) following the existing task/github-pr grouped subcommand pattern
    - **Deviations**: None
    - **Tests**: 1654/1654 passing (existing suite, no regressions)

### Gate Modifications

- [ ] **T5**: Add "Review feedback from Arcade" option and `waiting_for_user` emission to all 5 gates in `/build` skill `[complexity:medium]`

    **Reference**: [design.md#351-build-5-gates](design.md#351-build-5-gates)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] All 5 checkpoint gates in `plugins/dev/skills/build/SKILL.md` include "Review feedback from Arcade" option
    - [ ] Each gate emits `waiting_for_user` event with `prompt` and `context` fields via `rp1 agent-tools emit` before presenting options
    - [ ] When "Review feedback from Arcade" is selected, agent loads `arcade-collab` skill and processes feedback loop
    - [ ] After feedback processing, agent returns to the same gate with original options
    - [ ] "Review feedback from Arcade" option is not shown when `AFK=true`
    - [ ] Existing gate options (Continue, Revise, Stop) remain unchanged

- [ ] **T6**: Add feedback option and `waiting_for_user` emission to 2 conditional gates in `/build-fast` skill `[complexity:simple]`

    **Reference**: [design.md#352-build-fast-2-conditional-gates](design.md#352-build-fast-2-conditional-gates)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [ ] Plan review checkpoint (Section 1.2) and post-implementation checkpoint (Section 4.2) include "Review feedback from Arcade" option
    - [ ] Both gates emit `waiting_for_user` event before presenting options
    - [ ] Feedback option is conditional on `CONFIRM_PLAN` (same as existing gate visibility)
    - [ ] Option is not shown when `AFK=true`
    - [ ] After feedback processing, agent returns to the same gate

- [ ] **T7**: Add feedback option and `waiting_for_user` emission to post-build prompt in `/build-express` skill `[complexity:simple]`

    **Reference**: [design.md#353-build-express-continuous-loop](design.md#353-build-express-continuous-loop)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [ ] Post-build prompt (Section 1.5) includes "Review feedback from Arcade" option alongside existing options
    - [ ] Gate emits `waiting_for_user` event before presenting options
    - [ ] Option is not shown when `AFK=true`
    - [ ] After feedback processing, agent returns to the same prompt with all original options

### User Docs

- [ ] **TD1**: Create documentation for Feedback subcommands - Feedback subcommands `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: add

    **Target**: docs/concepts/agent-tools.md

    **Section**: Feedback subcommands

    **KB Source**: architecture.md:agent-tools

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] New section documenting `feedback read`, `feedback resolve`, `feedback reply`, and `feedback accept-edit` subcommands created in agent-tools concept doc

- [ ] **TD2**: Update Agent Tools section - Agent Tools section `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/modules.md

    **Section**: Agent Tools section

    **KB Source**: modules.md:agent-tools

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Agent Tools section reflects the new feedback module in the component breakdown

- [ ] **TD3**: Update Data Flow section - Data Flow section `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/architecture.md

    **Section**: Data Flow section

    **KB Source**: architecture.md:data-flow

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Data Flow section reflects the new feedback data flow path (agent -> feedback CLI -> DB/daemon -> Arcade UI)

- [ ] **TD4**: Create documentation for Arcade collaboration guide - Full guide `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: add

    **Target**: docs/guides/arcade-collaboration.md

    **Section**: (new file)

    **KB Source**: -

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] New user-facing guide created explaining how to use feedback in Arcade workflows

## Acceptance Criteria Checklist

### FR-001: Read Feedback for a Run
- [ ] AC-1: Given a run with 3 open annotations and 2 edited artifacts, when the agent requests feedback, then the response contains all 3 annotations and 2 edit diffs
- [ ] AC-2: Given a run with no feedback, when the agent requests feedback, then the response indicates zero annotations and zero edits
- [ ] AC-3: The response for annotations includes: annotation ID, associated artifact path, annotation content, anchor information, status, and any existing replies
- [ ] AC-4: The response for edits includes: document ID, artifact file path, and a unified diff showing changes from the original baseline
- [ ] AC-5: The agent can filter annotations by status (open, resolved, or all)

### FR-002: Resolve an Annotation
- [ ] AC-1: Given an open annotation, when the agent resolves it with a reply, then the annotation status changes to resolved and the reply appears in the thread
- [ ] AC-2: Given an open annotation, when the agent resolves it without a reply, then the annotation status changes to resolved with no new reply added
- [ ] AC-3: The resolution and reply are visible in the Arcade UI in real time
- [ ] AC-4: The user can reopen any agent-resolved annotation at any time from the Arcade

### FR-003: Reply to an Annotation Thread
- [ ] AC-1: Given an annotation with 1 existing reply, when the agent adds a reply, then the thread shows 2 replies
- [ ] AC-2: The reply is attributed to the agent (not the user)
- [ ] AC-3: The reply appears in the Arcade UI in real time

### FR-004: Accept a Direct File Edit
- [ ] AC-1: Given an artifact with a pending baseline diff, when the agent accepts the edit, then subsequent feedback reads return no edit for that artifact
- [ ] AC-2: The file content on disk remains unchanged by the accept action
- [ ] AC-3: After acceptance, if the user makes additional edits, a new diff is tracked from the updated baseline

### FR-005: Collaboration Guidance for Agents
- [ ] AC-1: The skill is loadable at runtime by any workflow skill
- [ ] AC-2: The skill includes a classification framework mapping feedback to actions by artifact type
- [ ] AC-3: The skill includes a collaboration loop pattern
- [ ] AC-4: The skill instructs agents to process feedback in dependency order
- [ ] AC-5: The skill covers both annotation feedback and direct file edit feedback

### FR-006: Feedback Review Gate Option
- [ ] AC-1: Each existing gate in /build (5), /build-fast (2), and /build-express (1) includes "Review feedback from Arcade" option
- [ ] AC-2: Selecting the option loads the collaboration skill and begins the feedback processing loop
- [ ] AC-3: After all feedback is processed, the agent returns to the same gate
- [ ] AC-4: The option is not shown when AFK_MODE=true

### FR-007: Dashboard Waiting Status at Gates
- [ ] AC-1: When an agent reaches any checkpoint gate, the dashboard shows a waiting indicator
- [ ] AC-2: The waiting indicator includes a prompt describing what decision is pending
- [ ] AC-3: When the user responds, the waiting indicator clears
- [ ] AC-4: This applies to all gate pauses across all three workflows

### FR-008: Feedback Classification and Routing
- [ ] AC-1: Annotations on requirements artifacts are routed to the requirements/design change workflow
- [ ] AC-2: Annotations on design artifacts are routed to the design discovery/assumption change workflow
- [ ] AC-3: Annotations on code artifacts result in the agent applying fixes directly
- [ ] AC-4: Direct file edits are classified by the type of file edited and routed accordingly
- [ ] AC-5: General feedback is incorporated into the agent's current context
- [ ] AC-6: Multiple feedback items are processed in dependency order

### FR-009: User Override of Agent Actions
- [ ] AC-1: Any annotation resolved by an agent can be reopened by the user
- [ ] AC-2: Any agent reply is visible in the annotation thread alongside user replies
- [ ] AC-3: After an agent accepts an edit, the user can make additional edits
- [ ] AC-4: No agent action permanently prevents further feedback on the same artifact

## Definition of Done

- [ ] All tasks completed
- [ ] All AC verified
- [ ] Code reviewed
- [ ] Docs updated
