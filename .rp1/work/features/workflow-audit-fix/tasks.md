# Development Tasks: Workflow State Management Audit Fixes

**Feature ID**: workflow-audit-fix
**Status**: Not Started
**Progress**: 100% (13 of 13 tasks completed)
**Estimated Effort**: 5 days
**Started**: 2026-03-17

## Overview

Consolidate all workflow state persistence onto the single `rp1.db` database, remove the legacy `status.db` system, add a `--workflow` flag to the emit command, update all plugin templates to include workflow context, and fix the deep-research parameter reference error.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3, T5] - Independent CLI, schema, import, and markdown changes with no data or interface dependencies
2. [T4] - Plugin template updates require T1's --workflow flag definition to write correct syntax
3. [T6] - Removal requires all migrations complete so no code references deleted files
4. [T7] - Documentation updates should reflect final state after removal

**Dependencies**:

- T4 -> T1 (interface: templates must reference --workflow flag that T1 defines)
- T6 -> [T1, T2, T3, T4] (build: removing work/ requires all code that imported from it to be migrated)
- T7 -> T6 (sequential workflow: docs describe the post-removal state)

**Critical Path**: T1 -> T4 -> T6 -> T7

## Task Breakdown

### Independent Foundation (Parallel Group 1)

- [x] **T1**: Add --workflow required flag to emit CLI command with validation and threading `[complexity:medium]`

    **Reference**: [design.md#31-add---workflow-flag-to-emit-command](design.md#31-add---workflow-flag-to-emit-command)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `emitCommand` in `cli/src/agent-tools/command.ts` includes `.requiredOption("--workflow <name>", ...)` between `--run-id` and `--step`
    - [x] `EmitCommandOptions` in `validate.ts` includes a required `workflow` string field
    - [x] `validateWorkflow` function rejects empty strings with a clear error message including example usage
    - [x] Validated workflow value is injected into `EmitInput.data.workflow` so `insertRun()` stores it in the `flow` column
    - [x] `rp1 agent-tools emit --workflow build --type status_change --run-id test --step test --data '{"status":"running"}'` stores `flow = "build"` in the runs table
    - [x] Calling emit without `--workflow` produces a clear Commander.js required-option error

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/command.ts`, `cli/src/agent-tools/emit/validate.ts`, `cli/src/agent-tools/emit/models.ts`, `cli/src/__tests__/agent-tools/emit/validate.test.ts`
    - **Approach**: Added `--workflow` as `.requiredOption` on emit command between `--run-id` and `--step`. Added `workflow` field to `EmitCommandOptions`, created `validateWorkflow` with clear error message and example usage, injected validated workflow into `EmitInput.data.workflow` so `insertRun()` stores it in the `flow` column. Updated help text and examples.
    - **Deviations**: None
    - **Tests**: 1817/1817 passing

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
      - [commit] Commit `ab6a4fed` bundled T1, T3, T5 files into a single commit.
    - **Guidance**: Split into separate atomic commits per task.

    **Review Feedback** (Attempt 2):
    - **Status**: PASS
    - **Resolution**: Soft-reset bundled commit `ab6a4fed`, created 3 separate atomic commits: T1 (`a3a11bc7`), T3 (`57f8fabf`), T5 (`a93c424b`), then re-committed T2 (`8b86ea7d`).

- [x] **T2**: Add subflow column to emit artifacts table with schema migration v3 `[complexity:medium]`

    **Reference**: [design.md#32-add-subflow-column-to-emit-artifacts-table](design.md#32-add-subflow-column-to-emit-artifacts-table)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `applyMigrations()` in `emit/database.ts` includes a v2-to-v3 migration that adds `subflow INTEGER NOT NULL DEFAULT 0` to the artifacts table
    - [x] `SCHEMA_SQL` CREATE TABLE for artifacts includes the `subflow` column and initial schema version is bumped to 3
    - [x] `ArtifactInput` interface includes optional `subflow?: boolean`
    - [x] `ArtifactRow` interface includes `subflow: number`
    - [x] `ArtifactRecord` interface includes `subflow: boolean`
    - [x] `artifactRowToRecord` maps `subflow: !!row.subflow`
    - [x] `upsertArtifact` INSERT statement includes the `subflow` column
    - [x] `emit/index.ts` reads `input.data.subflow` and passes it to `upsertArtifact`
    - [x] New test cases cover the migration, and artifact upsert with `subflow=true`

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/emit/database.ts`, `cli/src/agent-tools/emit/index.ts`, `cli/web-ui/src/server/routes/v2-api.ts`, `cli/src/__tests__/agent-tools/emit/database.test.ts`
    - **Approach**: Added subflow column to SCHEMA_SQL and v2-to-v3 migration; updated ArtifactInput/Row/Record types and upsertArtifact INSERT; wired input.data.subflow through handleArtifactRegistration; mapped subflow in v2-api artifactRecordToArtifact for frontend consumption
    - **Deviations**: Also updated v2-api artifactRecordToArtifact to map the new subflow field to the frontend Artifact type, necessary for getSubflowDiagrams to work
    - **Tests**: 138/138 passing (added 4 new test cases: schema version check, subflow column existence, v2-to-v3 migration, artifact upsert with subflow=true/false)

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

- [x] **T3**: Migrate task system database import from work/database to emit/database `[complexity:simple]`

    **Reference**: [design.md#33-migrate-task-system-to-rp1db](design.md#33-migrate-task-system-to-rp1db)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `cli/src/agent-tools/task/database.ts` imports `getEmitDatabase` from `../emit/database.js` instead of `getDatabase` from `../work/database.js`
    - [x] All `getDatabase(dbPath)` calls in `task/database.ts` are replaced with `getEmitDatabase(dbPath)`
    - [x] Test files (`database.test.ts`, `execute.test.ts`, `validation.test.ts`) import from `emit/database` using `getEmitDatabase` / `resetInstance`
    - [x] All existing task system tests pass after the import swap

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/task/database.ts`, `cli/src/__tests__/agent-tools/task/database.test.ts`, `cli/src/__tests__/agent-tools/task/execute.test.ts`, `cli/src/__tests__/agent-tools/task/validation.test.ts`
    - **Approach**: Swapped import from `work/database.js` (`getDatabase`/`closeDatabase`/`resetDatabaseInstance`) to `emit/database.js` (`getEmitDatabase`/`closeDatabase`/`resetInstance`); updated docstring references from `status.db` to `rp1.db`
    - **Deviations**: None
    - **Tests**: 1817/1817 passing

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
        - [commit] T3 files were bundled into T1 commit `ab6a4fed`.
    - **Guidance**: Create separate atomic commit for T3.

    **Review Feedback** (Attempt 2):
    - **Status**: PASS
    - **Resolution**: Atomic commit `57f8fabf` created with only T3-scoped files.

- [x] **T5**: Fix deep-research skill artifact registration parameter reference `[complexity:simple]`

    **Reference**: [design.md#35-fix-deep-research-parameter-reference](design.md#35-fix-deep-research-parameter-reference)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [x] `plugins/base/skills/deep-research/SKILL.md` artifact registration uses `"research"` as the feature value instead of `{FEATURE_ID}`
    - [x] The emit call uses `--workflow deep-research` and `--type artifact_registered`
    - [x] No references to undefined parameters remain in the artifact registration block

    **Implementation Summary**:

    - **Files**: `plugins/base/skills/deep-research/SKILL.md`, `cli/dist/claude-code/base/skills/deep-research/SKILL.md`, `cli/dist/claude-code/base/manifest.json`
    - **Approach**: Replaced `work artifact` call with `emit --type artifact_registered --workflow deep-research`; replaced undefined `{FEATURE_ID}` with fixed `"research"` value; added `--workflow deep-research` to state-machine emit template
    - **Deviations**: None
    - **Tests**: N/A (markdown skill file)

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
        - [commit] T5 files were bundled into T1 commit `ab6a4fed`.
    - **Guidance**: Create separate atomic commit for T5.

    **Review Feedback** (Attempt 2):
    - **Status**: PASS
    - **Resolution**: Atomic commit `a93c424b` created with only T5-scoped files.

### Plugin Template Updates (Parallel Group 2)

- [x] **T4**: Update all plugin emit templates with --workflow flag and convert work artifact calls `[complexity:medium]`

    **Reference**: [design.md#34-update-plugin-emit-templates](design.md#34-update-plugin-emit-templates)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] All 12 `work artifact` call sites across 10 plugin files are converted to `emit --type artifact_registered` with `--data` JSON payloads containing path, feature, and step
    - [x] The 2 call sites using `--subflow` (in `feature-tasker.md` and `build-fast/SKILL.md`) include `"subflow": true` in the data payload
    - [x] All 9 plugin files with existing emit calls include `--workflow {WORKFLOW_NAME}` with the correct workflow value per the mapping table in design.md
    - [x] Top-level skills use literal workflow names (e.g., `build`, `pr-review`); subagents use the `{WORKFLOW}` template variable from their parent
    - [x] Feature context `"feature": "{FEATURE_ID}"` is included in `--data` for `status_change` events where the workflow operates on a feature
    - [x] No emit call site omits the `--workflow` flag

    **Implementation Summary**:

    - **Files**: `plugins/dev/skills/build/SKILL.md`, `plugins/dev/skills/build-fast/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`, `plugins/dev/skills/blueprint/SKILL.md`, `plugins/dev/agents/task-builder.md`, `plugins/dev/agents/task-reviewer.md`, `plugins/dev/agents/feature-verifier.md`, `plugins/dev/agents/hypothesis-tester.md`, `plugins/dev/agents/feature-tasker.md`, `plugins/dev/agents/feature-architect.md`, `plugins/dev/agents/feature-requirement-gatherer.md`, `plugins/dev/agents/build-fast-planner.md`
    - **Approach**: Converted all `work artifact` calls to `emit --type artifact_registered` with `--data` JSON payloads; added `--workflow` to every emit call (literal names for top-level skills, `{WORKFLOW}` variable for subagents); added `"feature": "{FEATURE_ID}"` to status_change data payloads; added `"subflow": true` to data for feature-tasker and task-builder subflow artifacts; updated example sequences to include --workflow
    - **Deviations**: None
    - **Tests**: N/A (markdown skill/agent files)

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

### Legacy Removal (Parallel Group 3)

- [x] **T6**: Remove legacy work command group source files, test files, and CLI registration `[complexity:medium]`

    **Reference**: [design.md#36-remove-legacy-work-command-group](design.md#36-remove-legacy-work-command-group)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] Source files deleted: `work/database.ts`, `work/index.ts`, `work/models.ts`, `work/update.ts`
    - [x] Test files deleted: all 8 test files in `cli/src/__tests__/agent-tools/work/`
    - [x] `command.ts` has no imports from `./work/index.js` or `./work/models.js`
    - [x] The `work` command group (update, artifact, cleanup) is no longer registered in the CLI
    - [x] `VALID_ARTIFACT_TYPES` is moved inline or to `emit/models` if still needed
    - [x] `closeDatabase()` call removed from `cleanupAndExit` (only `closeEmitDatabase()` remains)
    - [x] `bun run build` in `cli/` succeeds with no dangling imports
    - [x] `bun test` passes with no failures related to removed files

    **Implementation Summary**:

    - **Files**: `cli/src/agent-tools/command.ts`, `cli/src/agent-tools/work/` (deleted), `cli/src/__tests__/agent-tools/work/` (deleted)
    - **Approach**: Deleted all 4 source files and 8 test files in work/ directories; removed work imports, side-effect import, and closeDatabase() call from command.ts; removed entire work command group registration (work, cleanup, artifact subcommands, classifyArtifactType helper); removed unused VALID_ARTIFACT_TYPES import (already exists in emit/models via shared/events)
    - **Deviations**: None
    - **Tests**: 1692/1692 passing (125 work tests removed)

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

### Documentation and Configuration (Parallel Group 4)

- [x] **T7**: Update documentation, Justfile, evals, and KB references for consolidated database `[complexity:medium]`

    **Reference**: [design.md#37-update-documentation-and-configuration](design.md#37-update-documentation-and-configuration)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `docs/concepts/state-machines.md` references `rp1.db` and uses `emit` syntax for artifact examples
    - [x] `docs/reference/cli/work.md` is deleted or replaced with a redirect note
    - [x] `.rp1/context/architecture.md` Mermaid diagram no longer shows `status.db`; dual persistence note is updated
    - [x] `plugins/base/skills/task/SKILL.md` references `rp1.db` instead of `status.db`
    - [x] `Justfile` `db-clean` and `db-reset` recipes target `~/.rp1/rp1.db`
    - [x] `evals/suites/shared/extension.ts` uses `RP1_DB` instead of `RP1_STATUS_DB`

    **Implementation Summary**:

    - **Files**: `docs/concepts/state-machines.md`, `docs/reference/cli/work.md` (deleted), `.rp1/context/architecture.md`, `plugins/base/skills/task/SKILL.md`, `Justfile`, `evals/suites/shared/extension.ts`, `cli/src/agent-tools/command.ts`, `mkdocs.yml`, `cli/dist/claude-code/base/skills/task/SKILL.md`, `cli/dist/SKILL-e1et6s14.md`, `cli/dist/SKILL-jsc582ht.md`, `cli/dist/SKILL-s0f41nht.md`
    - **Approach**: Updated all artifact registration examples from `work artifact` to `emit --type artifact_registered`; added `--workflow` flag to all emit examples; removed stale cleanup section referencing deleted `work cleanup` command; deleted `docs/reference/cli/work.md` and its mkdocs nav entry; updated architecture diagram to remove `status.db` node and changed "Dual local persistence" to "Unified local persistence"; updated task skill and dist copies to reference `rp1.db`; rewrote Justfile `db-clean` to target `rp1.db` tables and `db-reset` to target `rp1.db` file; changed `RP1_STATUS_DB` to `RP1_DB` in evals extension; fixed help text in `command.ts`
    - **Deviations**: Also updated `mkdocs.yml` nav entry, `command.ts` task help text, and 3 dist skill files that referenced `status.db` -- all directly related to the consolidation goal
    - **Tests**: 1692/1692 passing

### User Docs

- [x] **TD1**: Update documentation for state-machines.md - artifact examples `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: docs/concepts/state-machines.md

    **Section**: artifact examples

    **KB Source**: architecture.md:Architectural Patterns

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section reflects updated artifact registration syntax from `work artifact` to `emit --type artifact_registered`

- [x] **TD2**: Remove deprecated work.md CLI reference `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: remove

    **Target**: docs/reference/cli/work.md

    **Section**: (entire file)

    **KB Source**: architecture.md:Layers

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] File removed, no broken links reference it

- [x] **TD3**: Update architecture.md system diagram and patterns `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/architecture.md

    **Section**: System Diagram, Architectural Patterns

    **KB Source**: architecture.md:Overview

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section reflects removal of status.db and updated persistence architecture

- [x] **TD4**: Update task skill database reference `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: plugins/base/skills/task/SKILL.md

    **Section**: database reference

    **KB Source**: patterns.md:I/O and Integration

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section reflects task system using rp1.db instead of status.db

- [x] **TD5**: Update Justfile database recipes `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: Justfile

    **Section**: db-clean, db-reset

    **KB Source**: patterns.md:I/O and Integration

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section reflects targeting rp1.db instead of status.db

- [x] **TD6**: Update evals extension environment variable `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: evals/suites/shared/extension.ts

    **Section**: env var

    **KB Source**: patterns.md:Dependency and Configuration

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [x] Section reflects use of RP1_DB instead of RP1_STATUS_DB

## Acceptance Criteria Checklist

- [ ] All 12 plugin artifact call sites use the `emit --type artifact_registered` syntax (REQ-001)
- [ ] Artifact data (path, feature, step, subflow) is passed via the `--data` JSON payload (REQ-001)
- [ ] Registered artifacts appear in the Web UI dashboard via the v2-api (REQ-001)
- [ ] The `artifacts` table in `rp1.db` includes a `subflow` column (REQ-002)
- [ ] A schema migration adds the subflow column to existing databases (REQ-002)
- [ ] Artifact records correctly reflect subflow status when queried by the Web UI (REQ-002)
- [ ] Task creation, listing, updating, and querying all operate against `rp1.db` (REQ-003)
- [ ] Existing task system tests pass after the migration (REQ-003)
- [ ] No imports reference `work/database` in the task system code (REQ-003)
- [ ] `rp1 agent-tools emit --workflow build ...` correctly stores `flow = "build"` on the run record (REQ-004)
- [ ] The `--workflow` flag is required; calls without it produce a clear error message (REQ-004)
- [ ] The Web UI displays the workflow name instead of "Unknown" (REQ-004)
- [ ] All emit call sites across 9 plugin files include `--workflow {WORKFLOW_NAME}` (REQ-005)
- [ ] No emit call site uses `--data` without the workflow flag (REQ-005)
- [ ] Deep-research artifact registration uses a valid, resolvable value for the feature field (REQ-006)
- [ ] The `work` command group is no longer registered in the CLI (REQ-007)
- [ ] Source and test files in `work/` directories are deleted (REQ-007)
- [ ] No remaining imports reference work/ modules (REQ-007)
- [ ] The CLI build succeeds without the removed files (REQ-007)
- [ ] Documentation and configuration references updated to rp1.db and emit syntax (REQ-008)

## Definition of Done

- [ ] All tasks completed
- [ ] All AC verified
- [ ] Code reviewed
- [ ] Docs updated
