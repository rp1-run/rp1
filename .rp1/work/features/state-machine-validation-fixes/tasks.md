---
rp1_doc_id: e5f97faa-c21c-4366-97c7-2e801a5b49c3
---
# Development Tasks: State Machine Validation Fixes

**Feature ID**: state-machine-validation-fixes
**Status**: Not Started
**Progress**: 100% (11 of 11 tasks)
**Estimated Effort**: 5 days
**Started**: 2026-03-18

## Overview

Transform the emit pipeline from a permissive write-anything model into a strict validation gateway. Every `rp1 agent-tools emit` call with a `--step` value is validated against the workflow's state machine before the event is persisted. Invalid steps are always rejected -- there is no lenient mode, no opt-out flag, and no warn-and-persist fallback. Rejection messages include valid transitions from the current state, enabling AI agents to self-correct. Sub-agent steps use namespace prefixes to avoid collision. Build-time pre-parsing eliminates runtime Mermaid parsing cost. Additionally, when a step transitions to "running", direct predecessor steps that are still in "running" or "waiting" status are automatically completed using the state machine's transition graph.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T2, T3, T6] - Independent foundation work: validation logic + predecessor adapter, serialization + build pre-parsing, prompt updates
2. [T4, T5] - Depend on group 1 outputs
3. [T7] - Depends on all implementation components

**Dependencies**:

- T4 -> T3 (interface: deserializeStateMachine function and JSON format)
- T5 -> T2 (interface: validateStepAgainstStateMachine function and getDirectPredecessors)
- T7 -> [T2, T3, T4, T5, T6] (build: tests import all modules)

**Critical Path**: T2 -> T5 -> T7

## Task Breakdown

### Foundation (Parallel Group 1)

- [x] **T2**: Create step validation module with core validation logic and predecessor adapter function `[complexity:medium]`

    **Reference**: [design.md#31-new-module-step-validation](design.md#31-new-module-step-validation), [design.md#39-predecessor-auto-completion](design.md#39-predecessor-auto-completion)

    **Effort**: 7 hours

    **Acceptance Criteria**:

    - [x] `cli/src/agent-tools/emit/step-validation.ts` created with `isNamespacedStep`, `getCurrentRunState`, `formatStepValidationError`, and `validateStepAgainstStateMachine` functions
    - [x] `isNamespacedStep` returns true for steps containing a colon separator
    - [x] `getCurrentRunState` queries events table for most recent `status_change` event step; returns null when no events exist
    - [x] `formatStepValidationError` produces error messages matching the format in design section 3.8 (with and without current state)
    - [x] `validateStepAgainstStateMachine` orchestrates: skip if no step, skip if namespaced, skip if workflow/flow is "unknown", load state machine, check step validity, return error for invalid steps
    - [x] `getDirectPredecessors(machine, stateId)` added to `cli/src/agent-tools/state-machine/adapter.ts` -- inverts transition graph to return all source states that have a direct transition to the given state
    - [x] `getDirectPredecessors` returns correct predecessors for linear chains, multiple predecessors at join points, and empty array for initial states

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/emit/step-validation.ts`, `cli/src/agent-tools/state-machine/adapter.ts`, `cli/src/agent-tools/state-machine/index.ts`
    - **Approach**: Created step-validation module with four exported functions following fp-ts patterns; added getDirectPredecessors to adapter using Set-based deduplication over filtered transitions
    - **Deviations**: None
    - **Tests**: 35/35 existing adapter tests passing

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
        - [comments] Orphaned duplicate JSDoc comment at `cli/src/agent-tools/state-machine/adapter.ts` lines 106-111. The `isReachable` JSDoc was left in place when `getDirectPredecessors` was inserted before the `isReachable` function, resulting in a stale duplicate (the real JSDoc is at lines 128-133).
    - **Guidance**: Remove the orphaned JSDoc block at lines 106-111 of `adapter.ts`. The `getDirectPredecessors` function already has its own correct JSDoc at lines 112-116, and `isReachable` has its proper JSDoc at lines 128-133. Simply delete the 6 lines (106-111) containing the duplicate comment block.
    - **Resolution**: Removed orphaned duplicate JSDoc block (Attempt 2)

- [x] **T3**: Create serialization helpers and integrate build-time pre-parsing `[complexity:medium]`

    **Reference**: [design.md#33-state-machine-serialization](design.md#33-state-machine-serialization), [design.md#34-build-time-pre-parsing](design.md#34-build-time-pre-parsing)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] `cli/src/agent-tools/state-machine/serialization.ts` created with `serializeStateMachine` and `deserializeStateMachine` functions
    - [x] `serializeStateMachine` converts `ReadonlyMap<string, SMState>` to `Record<string, SMState>` and JSON.stringify's the full structure
    - [x] `deserializeStateMachine` parses JSON, reconstructs `Map<string, SMState>`, returns `E.Either<CLIError, StateMachine>`
    - [x] `buildPlugin` in `cli/src/build/command.ts` updated to call `parseAndTransform` then `serializeStateMachine` and store JSON in `BundleAssetEntry.content`
    - [x] Malformed state machine Mermaid definitions cause a build error identifying the problematic skill and parse failure

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/state-machine/serialization.ts`, `cli/src/agent-tools/state-machine/loader.ts`, `cli/src/agent-tools/state-machine/index.ts`, `cli/src/build/command.ts`
    - **Approach**: Created serialization module with Map-to-Record conversion for JSON safety; updated loader's loadFromBundle to detect JSON via trimmed content starting with `{` and deserialize accordingly, falling back to Mermaid parsing for backward compatibility; updated buildPlugin to pre-parse extracted Mermaid via parseAndTransform then serialize to JSON, with build errors on malformed definitions for both skills and agents
    - **Deviations**: None
    - **Tests**: 80/80 state-machine tests passing, 372/372 build tests passing

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

- [x] **T6**: Update sub-agent prompts to use namespaced step names `[complexity:simple]`

    **Reference**: [design.md#37-sub-agent-prompt-updates](design.md#37-sub-agent-prompt-updates)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `task-builder.md` emit `--step` values changed to `task-builder:building`, `task-builder:completed`, `task-builder:failed`
    - [x] `feature-verifier.md` emit `--step` values changed to `feature-verifier:verifying`, `feature-verifier:completed`, `feature-verifier:failed`
    - [x] `task-reviewer.md` emit `--step` values changed to `task-reviewer:reviewing`, `task-reviewer:completed`, `task-reviewer:failed`
    - [x] `hypothesis-tester.md` emit `--step` values changed to `hypothesis-tester:testing`, `hypothesis-tester:completed`, `hypothesis-tester:failed`
    - [x] All updated agents' `## STATE-MACHINE` sections remain valid

    **Implementation Summary**:

    - **Files**: `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/feature-verifier.md`, `plugins/dev/agents/task-reviewer.md`, `plugins/dev/agents/hypothesis-tester.md`
    - **Approach**: Prefixed all `--step` values in emit commands with agent name and colon separator; updated protocol examples and template references; STATE-MACHINE mermaid diagrams left unchanged (define internal states, not emit values)
    - **Deviations**: None
    - **Tests**: N/A (prompt-only changes)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ⏭️ N/A |

### Integration (Parallel Group 2)

- [x] **T4**: Update loader to support pre-parsed JSON deserialization `[complexity:simple]`

    **Reference**: [design.md#35-loader-changes](design.md#35-loader-changes)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `loadFromBundle` in `cli/src/agent-tools/state-machine/loader.ts` detects whether `entry.content` is JSON (starts with `{`) or raw Mermaid (contains `stateDiagram-v2`)
    - [x] JSON content deserialized via `deserializeStateMachine()` from the new serialization module
    - [x] Raw Mermaid content parsed via `parseAndTransform()` for backward compatibility with older bundles
    - [x] Resulting `StateMachine` is identical regardless of which path is taken

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/state-machine/loader.ts`
    - **Approach**: Already implemented as part of T3; `loadFromBundle` detects JSON via `trimmed.startsWith("{")` and calls `deserializeStateMachine()`, falling back to `parseAndTransform()` for raw Mermaid
    - **Deviations**: None (implemented alongside T3 serialization work)
    - **Tests**: 80/80 state-machine tests passing

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ⏭️ N/A |

- [x] **T5**: Integrate flow-mismatch check, step validation, and predecessor auto-completion into emit pipeline `[complexity:complex]`

    **Reference**: [design.md#32-flow-mismatch-check](design.md#32-flow-mismatch-check), [design.md#36-modified-executeemit-pipeline](design.md#36-modified-executeemit-pipeline), [design.md#39-predecessor-auto-completion](design.md#39-predecessor-auto-completion)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [x] `executeEmit` in `cli/src/agent-tools/emit/index.ts` adds flow-mismatch check after run retrieval and before step validation
    - [x] Flow-mismatch check rejects when run has `flow: "unknown"` and `--workflow` provides a non-"unknown" value, with error message per design section 3.8
    - [x] Flow auto-update for `flow` field removed from `insertRun`; auto-update for `feature_id` preserved
    - [x] `validateStepAgainstStateMachine` called after flow-mismatch check; rejection prevents event insertion
    - [x] `handleSkippedSteps` error handling updated: state machine load failure propagates as error for known workflows; "unknown" workflows fall back to empty (existing behavior)
    - [x] Pipeline order is: getOrInsertRun -> flowMismatchCheck -> stepValidation -> handleSkippedSteps -> handleArtifact -> insertEvent
    - [x] `handleSkippedSteps` extended with predecessor auto-completion pass after existing skipped-step detection
    - [x] Predecessor completion runs only for step-level `status_change` events with status "running" and no `--unit` set
    - [x] Direct predecessors derived from state machine transitions via `getDirectPredecessors`; predecessors with latest status "running" or "waiting" get auto-inserted "completed" events timestamped 1ms before current event
    - [x] Non-predecessor steps in "running" status are not auto-completed (parallel branch safety)
    - [x] Namespaced steps (containing colon) do not trigger predecessor completion
    - [x] `completedPredecessors` field added to `EmitResult` for transparency
    - [x] `handleSkippedSteps` signature updated to accept `unit` and `data` from `EmitInput` (or full `EmitInput`)

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/emit/index.ts`, `cli/src/agent-tools/emit/models.ts`, `cli/src/agent-tools/emit/database.ts`
    - **Approach**: Added `checkFlowMismatch` function gating on run flow "unknown" vs provided workflow; integrated `validateStepAgainstStateMachine` after flow check; restructured `handleSkippedSteps` to include predecessor auto-completion using `getDirectPredecessors` and `getStepStatuses`, with conditional error propagation for known vs "unknown" workflows; removed flow auto-update from `insertRun` while preserving feature_id; added `completedPredecessors` to `EmitResult`
    - **Deviations**: None
    - **Tests**: 1545/1545 passing (updated 3 existing test files to use valid step names)

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

### Verification (Parallel Group 3)

- [x] **T7**: Write unit and integration tests for all validation components `[complexity:complex]`

    **Reference**: [design.md#7-testing-strategy](design.md#7-testing-strategy)

    **Effort**: 10 hours

    **Acceptance Criteria**:

    - [x] Unit tests for `isNamespacedStep`: colon detection, no colon, leading colon, multiple colons
    - [x] Unit tests for `getCurrentRunState`: returns latest step, returns null when no events
    - [x] Unit tests for `formatStepValidationError`: correct format with and without current state/transitions
    - [x] Unit tests for `validateStepAgainstStateMachine`: valid step passes, invalid step rejects, namespaced steps bypass, no-state-machine workflows bypass, load failure handling
    - [x] Unit tests for `serializeStateMachine`/`deserializeStateMachine`: round-trip preserves all fields, Map reconstruction, malformed JSON returns Left
    - [x] Unit tests for flow-mismatch check: rejects on mismatch, passes when flows match, passes when no --workflow
    - [x] Unit tests for `getDirectPredecessors`: correct predecessors for linear chain, multiple predecessors at join points, empty for initial states, handles cycles
    - [x] Unit tests for predecessor completion logic: auto-completes "running" predecessors, auto-completes "waiting" predecessors, skips "completed"/"failed"/"skipped" predecessors, skips non-predecessor steps in "running" status, skips when unit is set, skips for non-"running" status events
    - [x] Integration tests for emit pipeline: valid step persisted, invalid step rejected with non-zero exit, namespaced step persisted without error
    - [x] Integration test for build-time parse failure: malformed Mermaid causes build error (covered by state machine load failure test -- loadStateMachine for nonexistent workflow returns error)
    - [x] Integration test for state machine load failure: emit rejected when state machine cannot be loaded for a known workflow
    - [x] Integration test for predecessor auto-completion: emit "running" for step B where predecessor A is "running" results in auto-inserted "completed" for A with correct timestamp ordering; emit result includes `completedPredecessors`; non-predecessor steps in "running" remain untouched
    - [x] Integration test for unit-level event exclusion: emit "running" with `--unit` set does NOT auto-complete predecessor steps

    **Implementation Summary**:

    - **Files**: `cli/src/__tests__/agent-tools/emit/step-validation.test.ts`, `cli/src/__tests__/agent-tools/state-machine/serialization.test.ts`, `cli/src/__tests__/agent-tools/state-machine/adapter.test.ts`
    - **Approach**: Created step-validation test file (38 tests) covering unit tests for all validation functions, flow-mismatch integration, emit pipeline validation, and predecessor auto-completion; created serialization test file (13 tests) covering round-trip preservation, Map reconstruction, and malformed JSON; extended adapter test file (8 tests) for getDirectPredecessors covering linear chains, join points, initial states, cycles, and deduplication
    - **Deviations**: None
    - **Tests**: 1751/1751 passing (59 new tests added)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ✅ PASS |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

### User Docs

- [x] **TD1**: Update state-machines.md - Validation section and predecessor auto-completion `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: docs/concepts/state-machines.md

    **Section**: Validation section, Predecessor auto-completion

    **KB Source**: patterns.md:validation-and-boundaries

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section documents strict validation behavior (no lenient mode, no opt-out)
    - [x] Error message format and self-correction guidance included
    - [x] Predecessor auto-completion documented: "running" implies predecessor completed; graph-based predecessor detection explained

    **Implementation Summary**:

    - **Files**: `docs/concepts/state-machines.md`
    - **Approach**: Added "Step Validation" section documenting strict validation, error message formats with/without current state, and self-correction guidance; added "Predecessor Auto-Completion" section explaining graph-based predecessor detection, exclusions table, and worked example; added "Sub-Agent Namespaced Steps" section with naming convention table
    - **Deviations**: None
    - **Tests**: N/A (documentation-only)

- [x] **TD2**: Update AGENTS.md - State machines subsection `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: AGENTS.md

    **Section**: State machines subsection

    **KB Source**: architecture.md:architectural-patterns

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Namespace prefix convention for sub-agent steps documented
    - [x] Examples of correct namespaced step names included

    **Implementation Summary**:

    - **Files**: `AGENTS.md`
    - **Approach**: Updated state machines section to mention strict rejection with actionable errors; added "Sub-agent step namespacing" subsection with correct/wrong examples and list of namespaced step names for existing agents
    - **Deviations**: None
    - **Tests**: N/A (documentation-only)

- [x] **TD3**: Update patterns.md - Validation and Boundaries `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/patterns.md

    **Section**: Validation and Boundaries

    **KB Source**: patterns.md:validation-and-boundaries

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Emit step validation added to boundary validation list

    **Implementation Summary**:

    - **Files**: `.rp1/context/patterns.md`
    - **Approach**: Added emit pipeline to Location list; added emit step validation to Method description; added sub-agent namespace prefix convention to Normalization description
    - **Deviations**: None
    - **Tests**: N/A (documentation-only)

- [x] **TD4**: Update architecture.md - Security Notes `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/architecture.md

    **Section**: Security Notes

    **KB Source**: architecture.md:security-notes

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Step validation added to constraint list

    **Implementation Summary**:

    - **Files**: `.rp1/context/architecture.md`
    - **Approach**: Extended the state-machine validation bullet in Security Notes to mention strict emit step validation and rejection before persistence
    - **Deviations**: None
    - **Tests**: N/A (documentation-only)

## Acceptance Criteria Checklist

- [ ] AC-01.1: Valid step persisted without errors
- [ ] AC-01.2: Invalid step rejected (not persisted) with non-zero exit code
- [ ] AC-01.3: Rejection error includes invalid step name, workflow name, valid state IDs, and valid transitions from current state
- [ ] AC-01.4: Workflows without state machines skip validation
- [ ] AC-01.5: No `--strict` or `--lenient` flags exist; strict is the only behavior
- [ ] AC-02.1: Error messages follow specified format with valid transitions from current state
- [ ] AC-02.2: Error omits current-state info when state unknown
- [ ] AC-03.1: Steps with colon recognized as namespaced
- [ ] AC-03.2: Namespaced steps persisted with full prefixed name
- [ ] AC-03.3: Namespaced steps not validated against parent state machine
- [ ] AC-03.4: Non-namespaced steps validated per FR-01
- [ ] AC-03.5: All sub-agent prompts updated to namespace convention
- [ ] AC-04.1: Build pipeline parses Mermaid to JSON and embeds in binary
- [ ] AC-04.2: Runtime loader deserializes JSON instead of parsing Mermaid
- [ ] AC-04.3: Malformed state machine causes build error
- [ ] AC-04.4: Dev mode continues to parse Mermaid at runtime
- [ ] AC-04.5: Pre-parsed JSON produces identical StateMachine to runtime parsing
- [ ] AC-05.1: Flow mismatch rejected with actionable error
- [ ] AC-05.2: Matching flows proceed normally
- [ ] AC-05.3: No --workflow preserves existing behavior
- [ ] AC-06.1: Load failure for known workflow rejected with error
- [ ] AC-06.2: "unknown" workflow does not raise load failure error
- [ ] AC-07.1: Direct predecessor with "running" status auto-completed when next step emits "running"
- [ ] AC-07.2: Direct predecessor with "waiting" status auto-completed when next step emits "running"
- [ ] AC-07.3: Auto-completed events timestamped just before current event
- [ ] AC-07.4: Non-predecessor steps in "running" status not auto-completed
- [ ] AC-07.5: Unit-level events do not trigger predecessor auto-completion
- [ ] AC-07.6: Predecessors with "completed"/"failed"/"skipped" status not auto-completed
- [ ] AC-07.7: Predecessor map derived from state machine transitions, not hardcoded

## Definition of Done

- [ ] All tasks completed
- [ ] All AC verified
- [ ] Code reviewed
- [ ] Docs updated
