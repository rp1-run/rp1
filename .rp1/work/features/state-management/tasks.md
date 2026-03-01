# Development Tasks: Declarative State Machine Workflow Management

**Feature ID**: state-management
**Status**: In Progress
**Progress**: 65% (13 of 20 tasks)
**Estimated Effort**: 9 days
**Started**: 2026-03-01

## Overview

Introduces declarative state machines co-located with skills as the single source of truth for workflow structure. Replaces hardcoded step arrays and metadata hacks with a generic mechanism that dynamically loads, parses, and validates workflow definitions from `state.mmd` files. Uses the mermaid-ast library for stateDiagram-v2 parsing with a thin transform layer to produce typed domain models. Covers the full stack: state machine module (models, transform, adapter, loader), CLI transition validation with TTL-based expiry, API dynamic loading with stale row filtering, dashboard integration, WebSocket events, and asset bundling.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. **[T1, T2]** -- Models/transform module and state.mmd files are independent authoring tasks
2. **[T3, T12, T14]** -- Loader, asset bundling, and adapter depend on T1 (models/transform) but not each other
3. **[T4, T5, T6, T10]** -- CLI validation, API refactor, SKILL.md pattern, and DB migration all depend on upstream (T3, T14) but are independent of each other
4. **[T7, T9, T15]** -- Workflows API, WebSocket push, and cleanup command depend on T5/T4/T10 respectively but are independent of each other
5. **[T8, T11]** -- Dashboard integration depends on T7; expanded coverage depends on T6
6. **[T13]** -- Visual diagram depends on T7 and T8

**Dependencies**:

- T3 -> T1 (loader uses transform to convert parsed AST to domain model)
- T12 -> T1 (bundling includes files the transform will consume)
- T14 -> T1 (adapter operates on domain model interfaces from models.ts)
- T4 -> [T3, T14, T10] (CLI validation needs loader + adapter + run_id/expires_at columns)
- T5 -> [T3, T14] (API dynamic loading needs loader + adapter for step derivation)
- T6 -> T2 (SKILL.md sections reference co-located state.mmd files)
- T7 -> T3 (workflows API uses loader to list/serve state machines)
- T8 -> T7 (dashboard consumes workflows API)
- T9 -> T4 (WebSocket events emitted after validated transitions)
- T11 -> T6 (expanded skills follow the established pattern)
- T13 -> [T7, T8] (visual diagram builds on API + dashboard)
- T15 -> T10 (cleanup command queries expires_at column from migration 003)

**Critical Path**: T1 -> T3 -> T4 -> T9 (models/transform -> loader -> CLI validation -> WebSocket)

## Task Breakdown

### Foundation

- [x] **T1**: Implement state machine models and mermaid-ast transform layer `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/state-machine/models.ts`, `cli/src/agent-tools/state-machine/transform.ts`, `cli/src/agent-tools/state-machine/index.ts`, `cli/src/__tests__/agent-tools/state-machine/transform.test.ts`, `cli/package.json`
    - **Approach**: Created typed domain interfaces (SMState, SMTransition, StateMachine, TransitionValidation, OrderedStep) in models.ts. Implemented transform.ts with parseAndTransform() pipeline (raw text -> mermaid-ast parseStateDiagram -> transformAstToStateMachine -> StateMachine). Transform extracts states, transitions, initial/terminal markers from AST, auto-creates implicitly referenced states, and rejects unsupported features (fork, join, nested, notes). Added mermaid-ast@0.6.1 dependency.
    - **Deviations**: None
    - **Tests**: 21/21 passing

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

    **Reference**: [design.md#31-data-model](design.md#31-data-model), [design.md#32-mermaid-ast-integration](design.md#32-mermaid-ast-integration)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Create `cli/src/agent-tools/state-machine/models.ts` with SMState, SMTransition, StateMachine, TransitionValidation, and OrderedStep interfaces
    - [x] Create `cli/src/agent-tools/state-machine/transform.ts` implementing `transformAstToStateMachine(id, ast)` that converts mermaid-ast's stateDiagram AST into the StateMachine domain model, returning `Either<CLIError, StateMachine>`
    - [x] Install `mermaid-ast` npm package; import `parseStateDiagram` from `mermaid-ast/parser` subpath
    - [x] Transform handles: initial transitions `[*] -> state`, terminal transitions `state -> [*]`, simple transitions, labeled transitions, state declarations with labels, and comments
    - [x] Transform validates that parsed AST contains only supported constructs; returns ParseError via `E.left` if unsupported features are detected (nested states, fork/join, concurrent regions, notes, direction)
    - [x] Transform auto-creates states referenced in transitions but not explicitly declared
    - [x] Create `cli/src/agent-tools/state-machine/index.ts` exporting public API
    - [x] Unit tests in `cli/src/__tests__/agent-tools/state-machine/transform.test.ts` covering: valid AST-to-StateMachine conversion, initial/terminal marker extraction, state label mapping, rejection of unsupported AST node types with descriptive errors, edge cases (empty diagram, single state, cycles)
    - [x] Pipeline: raw text -> mermaid-ast parse() -> AST -> transformAstToStateMachine() -> StateMachine

- [x] **T2**: Create state.mmd files for build, build-fast, and pr-review skills `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `plugins/dev/skills/build/state.mmd`, `plugins/dev/skills/build-fast/state.mmd`, `plugins/dev/skills/pr-review/state.mmd`
    - **Approach**: Created three Mermaid stateDiagram-v2 files co-located with SKILL.md in each skill directory. State IDs match existing BUILD_WORKFLOW_STEPS and BUILD_FAST_WORKFLOW_STEPS task field values. All files verified through mermaid-ast + transform pipeline.
    - **Deviations**: None
    - **Tests**: All 1083 existing tests passing; all 3 files parse successfully through T1 pipeline

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

    **Reference**: [design.md#38-example-statemmd-files](design.md#38-example-statemmd-files)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] Create `plugins/dev/skills/build/state.mmd` with states: requirements, design, tasks, build, verify, archive and transitions including verify->build retry loop
    - [x] Create `plugins/dev/skills/build-fast/state.mmd` with states: plan, build, review
    - [x] Create `plugins/dev/skills/pr-review/state.mmd` with states: split, review, synthesize, post
    - [x] All files use valid Mermaid stateDiagram-v2 syntax
    - [x] State IDs match the task field values currently used in work update commands
    - [x] All files parse successfully through the mermaid-ast + transform pipeline from T1

### Core Module Layer

- [x] **T3**: Implement state machine loader with filesystem, bundle, and cache support `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/state-machine/loader.ts`, `cli/src/agent-tools/state-machine/index.ts`, `cli/src/__tests__/agent-tools/state-machine/loader.test.ts`
    - **Approach**: Created loader with three-tier discovery (cache -> bundled assets -> filesystem). Filesystem scans `plugins/*/skills/{name}/state.mmd` relative to project root derived from `import.meta.url`. Bundle path checks for optional `stateMachines` array on BundledPlugin (forward-compatible with T12). In-memory Map cache with process-lifetime scope. Parse pipeline delegates to `parseAndTransform()` from transform module.
    - **Deviations**: None
    - **Tests**: 9/9 passing (30/30 total across state-machine module)

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

    **Reference**: [design.md#34-state-machine-loader](design.md#34-state-machine-loader)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Create `cli/src/agent-tools/state-machine/loader.ts` with loadStateMachine, listWorkflows, and clearCache functions
    - [x] loadStateMachine returns `TE.TaskEither<CLIError, StateMachine>` following fp-ts patterns
    - [x] Loader checks in-memory cache (Map<string, StateMachine>) first before filesystem/bundle reads
    - [x] Filesystem discovery scans `plugins/*/skills/{workflowName}/state.mmd` relative to project root or RP1_ROOT
    - [x] Bundle discovery reads from `BundledAssets.plugins.*.stateMachines` when running as compiled binary
    - [x] Parse pipeline: read raw text -> mermaid-ast parseStateDiagram() -> transformAstToStateMachine() -> cache and return
    - [x] listWorkflows enumerates all skills with state.mmd files
    - [x] Cached lookup completes under 1ms
    - [x] Unit tests in `cli/src/__tests__/agent-tools/state-machine/loader.test.ts` covering filesystem loading, cache hit/miss, nonexistent workflow error, and listWorkflows enumeration

- [x] **T12**: Update asset bundling to include state.mmd files `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `cli/src/build/models.ts`, `cli/src/assets/reader.ts`, `cli/src/build/command.ts`, `cli/scripts/generate-asset-imports.ts`, `cli/src/agent-tools/state-machine/loader.ts`
    - **Approach**: Added `stateMachines` field to both build-time (`BundlePluginAssets`) and runtime (`BundledPlugin`) interfaces. Build pipeline discovers and copies co-located `state.mmd` files during plugin builds, records them in bundle-manifest.json. `generate-asset-imports.ts` reads the manifest and generates static imports with `{ type: "file" }` for Bun bundler embedding. Loader updated to use typed `stateMachines` field directly instead of type assertion.
    - **Deviations**: None
    - **Tests**: 1092/1092 passing

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

    **Reference**: [design.md#313-asset-bundling](design.md#313-asset-bundling)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] Update `generate-asset-imports.ts` to discover and include `state.mmd` files in skill asset entries
    - [x] Add `stateMachines: AssetEntry[]` array to the BundledPlugin interface
    - [x] state.mmd files are accessible via BundledAssets at runtime in compiled binary
    - [x] Existing SKILL.md and agent bundling remains unaffected

- [x] **T14**: Implement graph query adapter with transition validation, BFS ordering, and reachability `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/state-machine/adapter.ts`, `cli/src/agent-tools/state-machine/index.ts`, `cli/src/__tests__/agent-tools/state-machine/adapter.test.ts`
    - **Approach**: Created adapter.ts with five pure functions operating on the StateMachine domain model. getTransitionsFrom/getValidNextStates filter transitions by sourceId. validateTransition returns TransitionValidation with error message listing valid next states. deriveOrderedSteps uses BFS from initial states with visited-set for cycle handling, producing OrderedStep[] with sequential indices. isReachable uses BFS to check graph connectivity. Updated index.ts to export all adapter functions.
    - **Deviations**: None
    - **Tests**: 35/35 passing

    **Reference**: [design.md#33-graph-query-adapter](design.md#33-graph-query-adapter)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Create `cli/src/agent-tools/state-machine/adapter.ts` with getTransitionsFrom, getValidNextStates, validateTransition, deriveOrderedSteps, and isReachable functions
    - [x] getTransitionsFrom returns all outgoing transitions from a given state
    - [x] getValidNextStates returns list of valid next state IDs from current state
    - [x] validateTransition returns TransitionValidation result with valid flag, current/target states, valid next states, and optional error message
    - [x] deriveOrderedSteps performs BFS from initial states producing linear step ordering; handles cycles via visited-set; returns OrderedStep[] with index
    - [x] isReachable checks if target state is reachable from source state via graph traversal
    - [x] Unit tests in `cli/src/__tests__/agent-tools/state-machine/adapter.test.ts` covering: getValidNextStates for each state, validateTransition valid/invalid, deriveOrderedSteps for linear/branching/cyclic graphs, initial/terminal detection, isReachable for connected and disconnected nodes

### Integration Layer

- [x] **T10**: Create database migration 003 adding run_id and expires_at columns `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/work/migrations/003_add_run_id_and_expires_at.sql`, `cli/src/agent-tools/work/database.ts`, `cli/src/agent-tools/work/models.ts`
    - **Approach**: Created migration 003 SQL with two ALTER TABLE ADD COLUMN statements and two CREATE INDEX statements. Bumped CURRENT_SCHEMA_VERSION to 3. Updated SCHEMA_SQL for fresh databases to include run_id, expires_at columns and their indexes. Extended StatusUpdateInput with runId/workflow/expiresAt optional fields and StatusUpdateRecord with runId/expiresAt nullable fields. Updated all SELECT queries and row-to-record mapping to include the new columns. Updated INSERT to pass run_id and expires_at.
    - **Deviations**: None
    - **Tests**: 1127/1127 passing (all existing tests pass with no regressions)

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

    **Reference**: [design.md#31-data-model](design.md#31-data-model)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] Create migration 003: `ALTER TABLE status_updates ADD COLUMN run_id TEXT` and `ALTER TABLE status_updates ADD COLUMN expires_at TEXT`
    - [x] Create index: `CREATE INDEX idx_status_run_id ON status_updates(project_path, feature, run_id)`
    - [x] Create index: `CREATE INDEX idx_status_expires_at ON status_updates(expires_at)`
    - [x] Migration follows existing migration pattern (version 3)
    - [x] Existing records with NULL run_id and NULL expires_at remain valid and queryable (backward compatible)
    - [x] NULL expires_at means the row never expires (pre-state-management rows unaffected)
    - [x] Migration runs automatically on first access

- [x] **T4**: Extend work update CLI with --workflow, --run-id, and --ttl flags and transition validation `[complexity:complex]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/work/update.ts`, `cli/src/agent-tools/work/database.ts`, `cli/src/agent-tools/work/index.ts`, `cli/src/agent-tools/command.ts`, `cli/src/__tests__/agent-tools/work/update-validation.test.ts`, `cli/src/__tests__/agent-tools/work/expires-at.test.ts`
    - **Approach**: Extended `UpdateCommandOptions` with workflow/runId/ttl fields. Added `validateWorkflowUpdate()` pipeline: loads state machine via loader, validates task is a known state, queries current state from DB with stale-row filtering (expires_at pruning), validates transition via adapter, computes expires_at from TTL. Added `detectStateMachineConflict()` for FR-006 heuristic detection. Added `getCurrentWorkflowState()` DB query with run-id isolation and on-read pruning. Updated CLI command with --workflow/-w, --run-id, and --ttl flags.
    - **Deviations**: None
    - **Tests**: 26/26 passing (14 update-validation + 12 expires-at)

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

    **Reference**: [design.md#35-cli-transition-validation-flow](design.md#35-cli-transition-validation-flow)

    **Effort**: 12 hours

    **Acceptance Criteria**:

    - [x] Add `--workflow` string flag to work update command specifying which skill's state machine to validate against
    - [x] Add `--run-id` string flag to work update command for run isolation
    - [x] Add `--ttl` number flag (seconds) with default 28800 (8 hours) for expires_at computation
    - [x] When `--workflow` is provided: load state machine via loader, compute `expires_at` as current UTC time + TTL seconds (`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+N seconds')`), query current state from DB with stale filtering (`WHERE project_path=? AND feature=? AND (run_id=? OR run_id IS NULL) AND (expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') OR expires_at IS NULL) ORDER BY created_at DESC LIMIT 1`), validate transition via adapter
    - [x] If no state.mmd exists for the specified workflow, return error: "No state machine defined for workflow '{name}'"
    - [x] First update (no current state) validates that `--task` is an initial state in the state machine
    - [x] Invalid transitions rejected with error: "Invalid transition from '{current}' to '{target}'. Valid next states: {list}"
    - [x] Each new status update for a run sets a fresh `expires_at`, effectively refreshing the TTL on every valid transition
    - [x] FR-006: When `--workflow` is omitted but task matches a state-machine-enabled workflow's state, reject with error directing user to specify `--workflow`
    - [x] Insert status update with run_id and expires_at when provided/computed
    - [x] Update StatusUpdateInput interface with optional `runId`, `workflow`, and `expiresAt` fields
    - [x] Update StatusUpdateRecord interface with optional `runId` and `expiresAt` fields
    - [x] Integration tests in `cli/src/__tests__/agent-tools/work/update-validation.test.ts` covering: full valid pipeline, invalid transition rejection, --run-id isolation, FR-006 detection, and first-update-must-be-initial-state
    - [x] Integration tests in `cli/src/__tests__/agent-tools/work/expires-at.test.ts` covering: default 8h TTL applied, --ttl flag overrides default, expired rows excluded from current-state queries, NULL expires_at rows always included, stale run invisible to new updates (treated as first update)
    - [x] Transition validation adds under 10ms overhead to command execution

- [x] **T5**: Refactor v2-api.ts to use dynamic state machine loading for step derivation with stale row filtering `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/server/routes/v2-api.ts`, `cli/web-ui/src/__tests__/server/v2-api-workflows.test.ts`
    - **Approach**: Replaced hardcoded BUILD_WORKFLOW_STEPS/BUILD_FAST_WORKFLOW_STEPS arrays and per-workflow functions with generic state-machine-driven alternatives. Added commandToWorkflowName() to map command strings to skill names. Created deriveWorkflowStepsFromMachine() that uses adapter's deriveOrderedSteps + buildTaskRecordMap for generic step derivation. Created deriveWorkflowRunStatus() that checks terminal states from the machine instead of hardcoded final step IDs. Made deriveSteps() and buildDetailedRun() async to support dynamic loadStateMachine() calls. Added filterNonExpiredRecords() for on-read stale row pruning applied to run list, attention, and detail API queries. Removed 8 legacy functions/constants (BUILD_WORKFLOW_STEPS, BUILD_FAST_WORKFLOW_STEPS, isBuildWorkflow, isBuildFastWorkflow, deriveBuildWorkflowSteps, deriveBuildFastWorkflowSteps, deriveBuildRunStatus, deriveBuildFastRunStatus).
    - **Deviations**: None
    - **Tests**: 29/29 passing

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

    **Reference**: [design.md#39-v2-apits-refactoring](design.md#39-v2-apits-refactoring)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Replace hardcoded BUILD_WORKFLOW_STEPS and BUILD_FAST_WORKFLOW_STEPS arrays with dynamic loading from state.mmd via the loader
    - [x] Implement generic `deriveWorkflowSteps(records, machine)` function that calls adapter's deriveOrderedSteps, merges with DB records via buildTaskRecordMap, and marks steps as completed/running/pending/failed
    - [x] Implement `commandToWorkflowName()` mapping: `/build` -> `build`, `/build-fast` -> `build-fast`, `/pr-review` -> `pr-review`
    - [x] When no state.mmd exists for a command, fall back to deriveTaskBasedSteps (existing behavior)
    - [x] Remove legacy per-workflow derivation functions (deriveBuildWorkflowSteps, deriveBuildFastWorkflowSteps, deriveBuildRunStatus, deriveBuildFastRunStatus)
    - [x] API queries that determine active runs and current run status filter out rows where `expires_at < now()` (stale runs from crashed agents do not appear in dashboard)
    - [x] Step ordering from state machine matches expected workflow progression
    - [x] API tests verify dynamic step derivation matches legacy hardcoded output for build and build-fast workflows
    - [x] API tests verify stale runs are excluded from dashboard API responses

- [x] **T6**: Define STATE-MACHINE section pattern and update skill files `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `plugins/dev/skills/build/SKILL.md`, `plugins/dev/skills/build-fast/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`
    - **Approach**: Defined standard STATE-MACHINE section template (13 lines of instruction) following design.md section 3.7. Added to all three skills, replacing §SKILL-LOADING sections and removing all scattered Report status directives. Removed build-fast metadata command hack (`{"command":"/build-fast"}`). For pr-review (no prior status reporting), added section before §ARCH with FEATURE_ID derivation note for PR branch/number.
    - **Deviations**: None
    - **Tests**: 1153/1153 passing (no regressions)

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

    **Reference**: [design.md#37-state-machine-section-pattern](design.md#37-state-machine-section-pattern)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] Define the standard STATE-MACHINE section template (under 15 lines) that instructs agents to read state.mmd, generate a run-id UUID, report transitions via `rp1 agent-tools work update --workflow --run-id --task --status`, and follow failure transitions
    - [x] Add STATE-MACHINE section to `plugins/dev/skills/build/SKILL.md` replacing scattered Report status directives
    - [x] Add STATE-MACHINE section to `plugins/dev/skills/build-fast/SKILL.md` replacing scattered Report status directives
    - [x] Add STATE-MACHINE section to `plugins/dev/skills/pr-review/SKILL.md` replacing scattered Report status directives
    - [x] Removed all superseded scattered Report status directives from the three adopted skills

### API and Events

- [x] **T7**: Implement workflows API endpoints `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/server/routes/v2-api.ts`, `cli/web-ui/src/server/http.ts`, `cli/web-ui/src/__tests__/server/v2-api-workflows.test.ts`
    - **Approach**: Added handleV2WorkflowsListRequest() using listWorkflows() + loadStateMachine() to return name/stateCount/description for each state-machine-enabled workflow. Added handleV2WorkflowDetailRequest() that loads a state machine, derives ordered steps via adapter, and serializes states/transitions/orderedSteps as JSON. Added routing in http.ts for GET /api/v2/workflows and GET /api/v2/workflows/:name. Returns 404 for nonexistent workflows. Leverages loader's in-memory cache for sub-100ms response times on repeated requests.
    - **Deviations**: None
    - **Tests**: 37/37 passing (8 new tests for workflows API endpoints)

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

    **Reference**: [design.md#310-workflows-api-endpoints](design.md#310-workflows-api-endpoints)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Implement `GET /api/v2/workflows` returning list of state-machine-enabled workflows with name, stateCount, and description
    - [x] Implement `GET /api/v2/workflows/:name` returning full state machine definition as JSON: states (id, label, isInitial, isTerminal), transitions (sourceId, targetId, label), and orderedSteps (id, label, index)
    - [x] Return 404 for nonexistent or non-state-machine workflows
    - [x] Endpoint caches parsed state machines (leveraging loader cache)
    - [x] Response time under 100ms
    - [x] API tests in `cli/web-ui/src/__tests__/v2-api-workflows.test.ts` covering listing, detail, and 404 scenarios

- [x] **T9**: Wire WebSocket push for state transition events `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/work/models.ts`, `cli/src/agent-tools/work/update.ts`, `cli/src/agent-tools/work/index.ts`, `cli/web-ui/src/daemon/ipc.ts`, `cli/web-ui/src/daemon/index.ts`, `cli/web-ui/src/server/websocket.ts`, `cli/web-ui/src/server/routes/api.ts`
    - **Approach**: Added transient `previousState` field to StatusUpdateInput (not persisted). Extended notifyDaemon() to accept WorkflowNotifyContext with workflow, runId, previousState, newState. Extended daemon IPC notifyStatusChange() to forward workflow context in HTTP POST body. Added RunStatusMessage/RunStepMessage types and broadcastRunStatus()/broadcastRunStep() methods to WebSocketHub. Extended handleStatusNotifyRequest() to broadcast run:step and run:status events when workflow context is present, with mapStatusToRunStatus() and mapStatusToStepStatus() helper functions for status mapping.
    - **Deviations**: None
    - **Tests**: All 1161 existing tests passing (no regressions)

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

    **Reference**: [design.md#311-websocket-integration](design.md#311-websocket-integration)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] After validated state transition insertion, extend notifyDaemon() call to include runId, workflow, previousState, and newState in payload
    - [x] Daemon broadcasts `run:step` message: `{ runId, stepId: newState, status: stepStatus, timestamp }`
    - [x] Daemon broadcasts `run:status` message: `{ runId, status: derivedRunStatus, currentStep: newState, timestamp }`
    - [x] Uses existing RunStatusMessage and RunStepMessage types (no new WebSocket message types)
    - [x] WebSocket events are only emitted for state-machine-enabled workflows
    - [x] Polling fallback continues to work when WebSocket is unavailable

- [x] **T15**: Implement work cleanup command for stale row deletion `[complexity:simple]`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/work/database.ts`, `cli/src/agent-tools/work/index.ts`, `cli/src/agent-tools/command.ts`, `cli/src/__tests__/agent-tools/work/cleanup.test.ts`
    - **Approach**: Added CleanupResult interface, countExpiredRuns() for dry-run reporting, and deleteExpiredRuns() for actual deletion to database.ts. Both use SQL with `WHERE run_id IS NOT NULL AND expires_at IS NOT NULL AND expires_at < strftime(...)` ensuring NULL run_id and NULL expires_at rows are never touched. Added CleanupOptions interface and executeCleanup() to index.ts using ToolResult envelope pattern. Added cleanup subcommand to command.ts with --dry-run and --older-than flags. Created 8 integration tests covering all acceptance criteria.
    - **Deviations**: None
    - **Tests**: 8/8 passing (cleanup tests); all 1161 tests passing

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

    **Reference**: [design.md#36-work-cleanup-command](design.md#36-work-cleanup-command)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] Create `rp1 agent-tools work cleanup` subcommand with `--dry-run` (boolean, default false) and `--older-than` (number of hours, default 0) flags
    - [x] Cleanup deletes entire runs (all rows sharing a run_id) when the latest row for that run has expired, not individual expired rows
    - [x] SQL: `DELETE FROM status_updates WHERE run_id IN (SELECT DISTINCT run_id FROM status_updates WHERE run_id IS NOT NULL AND expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-N hours'))`
    - [x] `--dry-run` reports stale rows and affected runs without deleting
    - [x] `--older-than` filters to only delete rows whose expires_at is at least N hours in the past (0 = any expired)
    - [x] Runs with NULL expires_at are never touched by cleanup
    - [x] Output follows existing agent-tools pattern: `ToolResult<{ deletedRows: number; affectedRuns: number }>`
    - [x] Integration tests in `cli/src/__tests__/agent-tools/work/cleanup.test.ts` covering: cleanup deletes all rows of expired runs, --dry-run reports without deleting, --older-than filters correctly, non-expired runs untouched, runs with NULL expires_at untouched

### Dashboard and Expansion

- [x] **T8**: Integrate StepTimeline with state machine API `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/hooks/useWorkflowSteps.ts`, `cli/web-ui/src/hooks/useRunDetail.ts`, `cli/web-ui/src/pages/v2/RunDetailPage.tsx`
    - **Approach**: Created useWorkflowSteps hook that fetches workflow definitions from /api/v2/workflows/:name with module-level Map cache. Added commandToWorkflowName utility for command-to-workflow mapping. Enhanced useRunDetail to subscribe to status_changed WebSocket events via onStatusChange, triggering refetch when matching feature/project status changes arrive (handles runId format mismatch between WebSocket broadcasts and frontend composite IDs). RunDetailPage uses useMemo to merge workflow ordered steps with run step records via mergeWorkflowSteps(), which uses the workflow definition as the authoritative step list and fills in status/timestamps from run data. Steps not yet seen are marked pending. Falls back to run.steps when no workflow definition exists.
    - **Deviations**: None
    - **Tests**: All 1161 CLI tests + 172 web-ui tests passing (no regressions)

    **Reference**: [design.md#312-dashboard-steptimeline-changes](design.md#312-dashboard-steptimeline-changes)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] Create `useWorkflowSteps(workflowName)` React hook that fetches state machine from `/api/v2/workflows/:name`
    - [x] Run detail page calls hook using the run's `command` field to resolve workflow name
    - [x] Steps are constructed by merging ordered state machine steps with the run's status records
    - [x] Current state is visually highlighted; completed states show timestamps; pending states are distinguishable
    - [x] Handles branching workflows correctly (e.g., verify->build retry loop)
    - [x] When no workflow is available (no state.mmd), gracefully falls back to existing behavior (no step timeline or task-based grouping)
    - [x] Dashboard step timeline updates under 100ms after WebSocket event

- [ ] **T11**: Create state.mmd files for additional multi-phase skills `[complexity:simple]`

    **Reference**: [design.md#5-implementation-plan](design.md#5-implementation-plan)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [ ] Create state.mmd files for at least 2 additional skills (e.g., blueprint, code-audit, code-investigate, deep-research, or build-express)
    - [ ] Add STATE-MACHINE sections to the corresponding SKILL.md files
    - [ ] All new state.mmd files use valid stateDiagram-v2 syntax and parse successfully through the mermaid-ast + transform pipeline
    - [ ] New skills become visible in the dashboard automatically without API or UI code changes
    - [ ] Total dashboard-visible skills reaches at least 5 (success metric target)

### Visual Enhancement

- [ ] **T13**: Implement optional visual state machine diagram component `[complexity:medium]`

    **Reference**: [design.md#312-dashboard-steptimeline-changes](design.md#312-dashboard-steptimeline-changes)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] Create MermaidDiagram component (or extend existing) with current state highlighting
    - [ ] Run detail page includes an expandable section showing the full Mermaid state diagram
    - [ ] Current state node is highlighted with distinct color/border
    - [ ] Completed states are visually distinguished from pending states
    - [ ] Section is not shown for runs from workflows without state.mmd
    - [ ] Diagram renders the raw state.mmd content fetched from the workflows API

### User Docs

- [ ] **TD1**: Create documentation for state machine module in KB `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: add

    **Target**: .rp1/context/modules.md

    **Section**: State Machine module

    **KB Source**: modules.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] New State Machine module section added to modules.md describing models, mermaid-ast transform layer, adapter, loader, and their responsibilities
    - [ ] Module dependencies documented (consumed by work/, v2-api.ts, skills at runtime)

- [ ] **TD2**: Update patterns KB with State Machine Pattern `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/patterns.md

    **Section**: State Machine Pattern

    **KB Source**: patterns.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Section reflects the co-location pattern (state.mmd alongside SKILL.md) and transition validation pattern

- [ ] **TD3**: Update architecture KB with data layer changes `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/architecture.md

    **Section**: Data Layer

    **KB Source**: architecture.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Section reflects run_id and expires_at column additions, on-read pruning semantics, and state machine integration with the data layer

- [ ] **TD4**: Create user-facing state machines concept guide `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: add

    **Target**: docs/concepts/state-machines.md

    **Section**: (new file)

    **KB Source**: -

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] New file created covering: what state machines are, how to create a state.mmd, the STATE-MACHINE section pattern, and how skills opt in to state tracking

- [ ] **TD5**: Update AGENTS.md with STATE-MACHINE section pattern `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: AGENTS.md

    **Section**: Development Patterns

    **KB Source**: AGENTS.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Development Patterns section includes the STATE-MACHINE section pattern guidance for new skills

## Acceptance Criteria Checklist

### Functional Requirements

- [ ] FR-001: state.mmd files co-located with SKILL.md are recognized as opt-in; skills without state.mmd are unaffected
- [ ] FR-002: mermaid-ast + transform layer produces typed domain model with states, transitions, initial/terminal detection, reachability, and error reporting
- [ ] FR-003: StatusValue (activity) and WorkflowState (phase) are orthogonal, independently queryable dimensions
- [ ] FR-004: v2 API derives step sequences dynamically from state.mmd; hardcoded arrays removed; stale runs filtered on read
- [ ] FR-005: CLI `--workflow` flag loads state.mmd and validates transitions; invalid transitions rejected with valid-next-states error
- [ ] FR-006: Status updates targeting state-machine-enabled workflows without `--workflow` flag are rejected
- [ ] FR-007: `--run-id` flag enables per-invocation isolation; concurrent runs tracked independently; `--ttl` flag configures expires_at
- [ ] FR-008: STATE-MACHINE section in SKILL.md instructs agents to read state.mmd and report transitions
- [ ] FR-009: GET /api/v2/workflows lists available workflows; GET /api/v2/workflows/:name returns full definition; 404 for missing
- [ ] FR-010: StepTimeline renders dynamically from state machine API data; current state highlighted
- [ ] FR-011: Optional visual state diagram with current state highlighting on run detail page
- [ ] FR-012: WebSocket broadcasts run:step and run:status events on validated state transitions
- [ ] FR-013: Manual developer transitions via CLI subject to same validation rules as agent transitions

### Non-Functional Requirements

- [ ] State.mmd parsing under 50ms for diagrams with up to 30 states
- [ ] Transition validation adds under 10ms to work update command
- [ ] Cached state machine lookup under 1ms
- [ ] Workflows API response under 100ms
- [ ] Dashboard update under 100ms after WebSocket event
- [ ] No cloud-service dependencies; offline-capable parsing (mermaid-ast is local npm package)
- [ ] STATE-MACHINE section under 20 lines of instruction

### Business Rules

- [ ] BR-001: StatusValue and WorkflowState are orthogonal dimensions
- [ ] BR-002: state.mmd presence is the sole opt-in mechanism
- [ ] BR-003: State IDs match task field values in work update commands
- [ ] BR-004: Transition validation is mandatory for state-machine-enabled workflows
- [ ] BR-005: Initial/terminal states determined by [*] transitions
- [ ] BR-006: Transition labels are informational; validation operates on state-to-state edges
- [ ] BR-007: No run-id falls back to latest-by-timestamp
- [ ] BR-008: Manual and agent transitions have identical validation
- [ ] BR-009: No errors/warnings for workflows without state.mmd

## Definition of Done

- [ ] All 20 tasks completed
- [ ] All acceptance criteria verified
- [ ] Code reviewed
- [ ] Unit tests passing (transform, adapter, loader)
- [ ] Integration tests passing (CLI transition validation, expires_at handling, cleanup command)
- [ ] API tests passing (workflows endpoints, dynamic step derivation, stale row filtering)
- [ ] DB migration 003 applied and backward compatible (run_id + expires_at columns)
- [ ] Docs updated (KB files, user guide, AGENTS.md)
