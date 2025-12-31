---
name: build
version: 2.0.0
description: End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command.
argument-hint: "feature-id [requirements] [--afk] [--no-worktree] [--push] [--create-pr]"
tags:
  - core
  - feature
  - orchestration
created: 2025-12-30
author: cloud-on-prem/rp1
---

# Build Command - Consolidated Feature Workflow

6-step workflow orchestrator. Inlines all step logic. Uses Task tool for agent delegation

## §PARAMS

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| FEATURE_ID | $1 | (req) | Feature identifier |
| REQUIREMENTS | $2 | false | requirements for building the feature |
| --afk | flag | false | Non-interactive mode, auto-selects defaults |
| --no-worktree | flag | false | Disable worktree isolation |
| --push | flag | false | Push branch after build |
| --create-pr | flag | false | Create PR (implies --push) |
| RP1_ROOT | env | `.rp1/` | Root directory |

<feature_id>$1</feature_id>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Parse flags from all arg positions**:

```
AFK_MODE = "--afk" in args
USE_WORKTREE = "--no-worktree" NOT in args
PUSH_BRANCH = "--push" in args OR "--create-pr" in args
CREATE_PR = "--create-pr" in args
```

**Feature dir**: `{RP1_ROOT}/work/features/{FEATURE_ID}/`

**Validation**:

1. FEATURE_ID: Required. Error if empty.
2. REQUIREMENTS: Optional. If provided, use as initial requirements.
2. Create feature dir if missing.

## §AFK-MODE

**Global behavior when AFK_MODE = true**:

| Aspect | Behavior |
|--------|----------|
| Prompts | Skip ALL AskUserQuestion calls |
| Defaults | Auto-select based on KB ctx + codebase patterns |
| On failure | Auto-retry once, mark blocked, continue |
| Archive | Auto-archive after verification |
| Worktree dirty | Auto-commit changes |
| Follow-ups | Skip post-build prompts |

**AFK Decision Logging**:

Track all auto-selected defaults. Output at end:

```markdown
## AFK Mode: Auto-Selected Defaults

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| {point} | {choice} | {why} |
```

## §ARTIFACT-DETECTION

Check artifacts in order. First failing check -> `start_step`.

### Detection Rules

| Step | Artifact | Detection | Skip When |
|------|----------|-----------|-----------|
| 1 | requirements.md | Contains `## 5. Functional Requirements` | Section found |
| 2 | design.md | Contains `## 2. Architecture` | Section found |
| 3 | tasks.md | File exists w/ task entries | Has `- [ ]` or `- [x]` patterns |
| 4 | tasks.md | All tasks complete | No `- [ ]`, only `- [x]`/`- [X]` |
| 5 | feature_verify_report*.md | `Overall Status: VERIFIED` AND `Ready for Merge: YES` | Both present in most recent |
| 6 | N/A | Never auto-skip | Always prompt/auto-archive |

### Detection Algorithm

```
start_step = 1

Read requirements.md:
  if NOT contains "## 5. Functional Requirements": start_step = 1, STOP
  else: step 1 complete

Read design.md:
  if NOT contains "## 2. Architecture": start_step = 2, STOP
  else: step 2 complete

Read tasks.md:
  if NOT exists OR no task entries: start_step = 3, STOP
  else: step 3 complete

Check tasks.md completion:
  if has "- [ ]" patterns: start_step = 4, STOP
  else: step 4 complete

Check verify report:
  glob feature_verify_report*.md, sort by mtime desc
  if most recent NOT has "Overall Status: VERIFIED" AND "Ready for Merge: YES":
    start_step = 5, STOP
  else: step 5 complete

start_step = 6 (archive)
```

### Detection Output

```markdown
## Artifact Detection

**Feature**: {FEATURE_ID}
**Directory**: {feature_dir}

| Step | Artifact | Status | Details |
|------|----------|--------|---------|
| 1 | requirements.md | {FOUND/MISSING} | {section status} |
| 2 | design.md | {FOUND/MISSING} | {section status} |
| 3 | tasks.md | {FOUND/MISSING} | {generation status} |
| 4 | tasks.md | {N/A if step 3 missing} | {N}/{M} tasks done |
| 5 | verify report | {FOUND/MISSING} | {status} |
| 6 | archive | PENDING | Never auto-skip |

**Start Step**: {N} - {name}
**Skipping**: Steps 1-{N-1} (artifacts exist)
```

## §PROGRESS

### 6-Step Workflow

| Step | Name | Agent(s) |
|------|------|----------|
| 1 | Requirements | feature-requirement-gatherer |
| 2 | Design | feature-architect, hypothesis-tester (opt), feature-tasker |
| 3 | Tasks | feature-tasker |
| 4 | Build | task-builder, task-reviewer, comment-cleaner, scribe |
| 5 | Verify | code-checker, feature-verifier, comment-cleaner |
| 6 | Archive | feature-archiver |

### Status Symbols

| Symbol | State | When |
|--------|-------|------|
| `[ ]` | PENDING | After current step |
| `[~]` | RUNNING | Active step |
| `[x]` | COMPLETED | Success |
| `[-]` | SKIPPED | Existing artifact |
| `[!]` | FAILED | Error |
| `[R]` | RETRYING | Retry in progress |
| `[D]` | DECLINED | User declined archive |

### Progress Display

```markdown
## Workflow Progress

Step 1: Requirements   [{status}] {reason}
Step 2: Design         [{status}] {reason}
Step 3: Tasks          [{status}] {reason}
Step 4: Build          [{status}] {reason}
Step 5: Verify         [{status}] {reason}
Step 6: Archive        [{status}] {reason}

Current: Step {N} of 6
```

**Display rules**:

- Show after artifact detection
- Update after each step transition
- Include reason only for SKIPPED/FAILED/DECLINED
- Final: all 6 steps w/ states + `Result: {completed}/6 completed, {skipped} skipped`

## §ERROR-HANDLING

### Foundational Steps (CRITICAL)

**Steps 1-3 (Requirements, Design, Tasks) are foundational. If ANY fails → ABORT immediately.**

| Step | Foundational | On Failure (ANY mode) |
|------|--------------|----------------------|
| 1 - Requirements | ✅ YES | ❌ ABORT - cannot design without requirements |
| 2 - Design | ✅ YES | ❌ ABORT - cannot build without design |
| 3 - Tasks | ✅ YES | ❌ ABORT - cannot build without tasks |
| 4 - Build | ❌ NO | Retry/skip per mode |
| 5 - Verify | ❌ NO | Retry/skip per mode |
| 6 - Archive | ❌ NO | Retry/skip per mode |

**Rationale**: There is no point building something without foundational requirements and design. Early abort saves time and prevents broken state.

### Retry Behavior (Steps 4-6 only)

| Mode | On Failure |
|------|------------|
| AFK | Auto-retry once, mark blocked, continue to next step |
| Interactive (ask) | Prompt: retry/skip/abort |
| Interactive (auto) | Mark blocked, continue |

**Note**: Retry behavior only applies to non-foundational steps (4-6). Steps 1-3 always abort on failure.

### Failure Detection

Step FAILED when:

- Agent Task returns error
- Expected artifact not created/updated
- Output contains error indicators
- Timeout/crash

### AFK Retry Flow

```
if failure:
  if step in [1, 2, 3]:  # Foundational steps
    ABORT("Step {N} failed - foundational step, cannot continue")
    # No retry, no skip - immediate abort regardless of mode

  elif AFK_MODE:  # Steps 4-6 only
    if attempts < 2:
      log_failure()
      attempt++
      re-invoke agent (fresh ctx)
    else:
      mark_blocked()
      log_afk_decision("Step {N} blocked after retry")
      continue to next step
```

### Interactive Retry (MODE=ask)

On failure (AFK_MODE=false):

**Steps 1-3 (Foundational)**: ABORT immediately, no prompt. Display error and exit.

**Steps 4-6 (Non-foundational)**:

1. Display error w/ step ctx, artifacts status
2. AskUserQuestion: `How shall we proceed? [retry/skip/abort]`
3. Handle:
   - retry: re-execute step
   - skip: mark blocked, continue (warn about deps)
   - abort: output summary, preserve state

### Error Summary Format

```markdown
## Build Error

**Feature**: {FEATURE_ID}
**Directory**: {RP1_ROOT}/work/features/{FEATURE_ID}/
**Mode**: {afk|interactive}

### Failed Step

| Property | Value |
|----------|-------|
| Step | {N} - {name} |
| Attempts | {X}/{max} |
| Error | {msg} |

### Step Status

| Step | Status | Details |
|------|--------|---------|
| 1: Requirements | {status} | {reason} |
| 2: Design | {status} | {reason} |
| 3: Tasks | {status} | {reason} |
| 4: Build | {status} | {reason} |
| 5: Verify | {status} | {reason} |
| 6: Archive | {status} | {reason} |

### Artifacts Preserved

| Step | Artifact | Status |
|------|----------|--------|
| 1 | requirements.md | {COMPLETE/SKIPPED/N/A} |
| 2 | design.md | {COMPLETE/SKIPPED/N/A} |
| 3 | tasks.md | {COMPLETE/PARTIAL/N/A} |
| 4 | code changes | {COMPLETE/PARTIAL/N/A} |
| 5 | verify report | {COMPLETE/N/A} |

### Recovery

1. Resume: `/build {FEATURE_ID}` (auto-resumes from failed step)
2. Interactive: `/build {FEATURE_ID}` (w/o --afk)
3. Manual: inspect feature dir
```

### Artifact Preservation Rules

**CRITICAL**: On ANY failure:

- NEVER delete completed step artifacts
- NEVER rollback successful steps
- KEEP partial artifacts from failed step
- LOG all preserved files

## §LEG

| Abbr | Meaning |
|------|---------|
| ctx | context |
| req | required |
| opt | optional |
| dir | directory |
| env | environment variable |
| mtime | modification time |

---

## §STEP-1: Requirements

**Skip if**: `requirements.md` contains `## 5. Functional Requirements`

**Purpose**: Generate requirements specification. Delegates to feature-requirement-gatherer agent.

### §1.1 Agent Spawn

```
Task tool invocation:
  subagent_type: rp1-dev:feature-requirement-gatherer
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    AFK_MODE: {AFK_MODE}
    RP1_ROOT: {RP1_ROOT}

    Generate requirements specification for feature.
    Here are the raw requirements: <REQUIREMENTS>
```

### §1.2 Response Handling

| Response | Action |
|----------|--------|
| `status: success` | Log artifact path, update progress, proceed to Step 2 |
| `status: error` | ABORT (foundational step). Display error, output summary |

On success: `Requirements completed: {artifact_path}`

## §STEP-2: Design

**Skip if**: `design.md` contains `## 2. Architecture`

**Purpose**: Generate technical design. Delegates to feature-architect agent, then optionally hypothesis-tester, then feature-tasker.

### §2.1 Mode Detection

Check if `{RP1_ROOT}/work/features/{FEATURE_ID}/design.md` exists:

- Exists: `UPDATE_MODE = true`
- Not exists: `UPDATE_MODE = false`

### §2.2 Architect Spawn

```
Task tool invocation:
  subagent_type: rp1-dev:feature-architect
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    AFK_MODE: {AFK_MODE}
    UPDATE_MODE: {UPDATE_MODE}
    RP1_ROOT: {RP1_ROOT}

    Generate technical design from requirements.
```

### §2.3 Architect Response

| Response | Action |
|----------|--------|
| `status: success` | Extract `flagged_hypotheses`, proceed to §2.4 |
| `status: error` | ABORT (foundational step). Display error, output summary |

### §2.4 Hypothesis Testing (Conditional)

**If `flagged_hypotheses` non-empty**:

```
Task tool invocation:
  subagent_type: rp1-dev:hypothesis-tester
  prompt: "Validate hypotheses for feature {FEATURE_ID}"
```

After tester completes, incorporate findings. Update design if needed.

**Skip if**: `flagged_hypotheses` empty or all HIGH confidence.

### §2.5 Task Generation

After design finalized, spawn feature-tasker:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-tasker
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    UPDATE_MODE: {UPDATE_MODE}
    RP1_ROOT: {RP1_ROOT}
```

### §2.6 Completion

On success:

```
Design completed: {RP1_ROOT}/work/features/{FEATURE_ID}/
- design.md
- design-decisions.md
- tasks.md (generated by feature-tasker)
```

Update progress -> Step 2 COMPLETED, proceed to Step 3.

## §STEP-3: Tasks

**Skip if**: `tasks.md` exists w/ task entries (`- [ ]` or `- [x]` patterns)

**Purpose**: Generate or update task list from design. Thin spawner - delegates to feature-tasker.

### §3.1 Artifact Check

```
Read tasks.md:
  if exists AND (contains "- [ ]" OR "- [x]" OR "- [X]"):
    SKIP -> proceed to Step 4
  else:
    continue to §3.2
```

### §3.2 Task Generation

Spawn feature-tasker:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-tasker
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    UPDATE_MODE: false
    RP1_ROOT: {RP1_ROOT}
```

Wait for completion. Agent reads design, generates tasks, writes `tasks.md`.

### §3.3 Completion

On success:

```
Tasks generated: {RP1_ROOT}/work/features/{FEATURE_ID}/tasks.md
```

Update progress -> Step 3 COMPLETED, proceed to Step 4.

## §STEP-4: Build

**Skip if**: All tasks in `tasks.md` marked `[x]` or `[X]` (no `- [ ]` patterns)

**Role**: Build Orchestrator - coordinates builder-reviewer agent pairs. Does NOT load KB/design/codebase directly.

**Constraint**: Orchestration only. All impl work delegated to agents via Task tool.

### §4.1 Worktree Setup

**Skip if**: `--no-worktree` flag set

Use the Skill tool to invoke the worktree-workflow skill:

```
skill: "rp1-dev:worktree-workflow"
args: task_slug={FEATURE_ID}, agent_prefix=feature, create_pr={CREATE_PR}
```

This sets up an isolated worktree. The skill handles:

- Worktree creation and directory change
- State verification
- Dependency installation

Store the returned values:

| Variable | Value |
|----------|-------|
| `worktree_path` | Abs path to worktree |
| `branch` | Branch name for push/PR |
| `basedOn` | Base commit for validation |

**On failure**: STOP, report error, do not proceed.

### §4.2 Task Parsing

#### §4.2.1 Task File

**Path**: `{RP1_ROOT}/work/features/{FEATURE_ID}/tasks.md`

Read task file. Error if missing/empty.

#### §4.2.2 Parse Regex

```
- \[([ x!])\] \*\*([^*]+)\*\*: (.+?)(?:\s*`\[complexity:(simple|medium|complex)\]`)?$
```

**Extract**:

| Group | Field | Values |
|-------|-------|--------|
| 1 | `status` | space=pending, x=done, !=blocked |
| 2 | `task_id` | T1, T1.1, TD1, etc. |
| 3 | `description` | Task text |
| 4 | `complexity` | simple/medium/complex (default: medium) |

**Derived**:

- `is_doc_task`: true if ID starts w/ "TD"

**TD* tasks** also extract from description:

- `doc_type`: add/edit/remove
- `target`: path
- `section`: section name
- `kb_source`: KB reference

#### §4.2.3 Build Lists

| List | Filter | Purpose |
|------|--------|---------|
| `implementation_tasks` | T* prefix, status=pending | Builder/reviewer |
| `doc_tasks` | TD* prefix, status=pending | Scribe agent |

**Resume**: Filter to pending only (status=` `).

### §4.3 Builder-Reviewer Loop

#### §4.3.1 Adaptive Grouping

Group `implementation_tasks` by complexity:

```
units = [], simple_buffer = []
for task in pending_tasks:
  if task.complexity == "simple":
    simple_buffer.append(task)
    if len(simple_buffer) >= 3:
      units.append(TaskUnit(tasks=simple_buffer))
      simple_buffer = []
  else:
    if simple_buffer: units.append(TaskUnit(tasks=simple_buffer)); simple_buffer = []
    units.append(TaskUnit(tasks=[task], extra_context=(complexity=="complex")))
if simple_buffer: units.append(TaskUnit(tasks=simple_buffer))
```

**Output**: Array of TaskUnits (1-3 tasks each).

**Skip grouping if**: `--no-group` in args -> all tasks processed individually.

#### §4.3.2 Orchestration Loop

```
for unit in task_units:
  attempt = 1, max_attempts = 2, previous_feedback = null

  while attempt <= max_attempts:
    # Builder
    builder_result = spawn_builder(unit, previous_feedback)

    # Reviewer
    reviewer_result = spawn_reviewer(unit)

    if reviewer_result.status == "SUCCESS":
      report_progress(unit, "VERIFIED", attempt)
      break
    else:
      if attempt < max_attempts:
        previous_feedback = reviewer_result.feedback
        attempt++
        report_progress(unit, "RETRYING", attempt)
      else:
        handle_escalation(unit, reviewer_result)
        break

  # Collect manual_verification items (dedupe by criterion)
```

#### §4.3.3 Spawn Builder

Task tool invocation:

```
subagent_type: rp1-dev:task-builder
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {comma-separated IDs}
  RP1_ROOT: {RP1_ROOT}
  WORKTREE_PATH: {worktree_path or ""}
  PREVIOUS_FEEDBACK: {feedback or "None"}

  Implement task(s). If WORKTREE_PATH provided, cd there first.
  Load context (KB, PRD, design). Update tasks.md, mark done.
```

Wait for completion before reviewer.

#### §4.3.4 Spawn Reviewer

Task tool invocation:

```
subagent_type: rp1-dev:task-reviewer
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {comma-separated IDs}
  RP1_ROOT: {RP1_ROOT}
  WORKTREE_PATH: {worktree_path or ""}

  Verify builder work. If WORKTREE_PATH provided, verify in that directory.
  Return JSON w/ status: SUCCESS/FAILURE.
```

Parse JSON response. Invalid JSON = FAILURE.

#### §4.3.5 Escalation

**AFK_MODE=true**: Mark blocked (`- [!]`), continue. Log decision:

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| Task {ids} failed after retry | Mark blocked, continue | AFK mode - autonomous execution |

**MODE=ask (AFK_MODE=false)**: AskUserQuestion:

- "Skip" -> Mark blocked (`- [!]`), continue
- "Provide guidance" -> Bonus builder attempt (no retry count)
- "Abort" -> Output summary, exit

**MODE=auto (AFK_MODE=false)**: Mark blocked, continue.

#### §4.3.6 Progress Report

Per unit:

```markdown
## Task Unit {N}/{total}: {task_ids} ({complexity})
  Builder: {emoji} {status}
  Reviewer: {emoji} {result} (confidence: {N}%)
  Status: {VERIFIED|RETRY|BLOCKED}
```

### §4.4 Post-Build

#### §4.4.1 Comment Cleaner

Spawn after ALL implementation units complete:

```
subagent_type: rp1-dev:comment-cleaner
prompt: |
  SCOPE: {basedOn}..HEAD
  BASE_BRANCH: {basedOn}
  WORKTREE_PATH: {worktree_path or ""}
  COMMIT_CHANGES: {true if use_worktree else false}
```

**Key behavior**:

- SCOPE uses `{basedOn}..HEAD` for line-scoped filtering
- If COMMIT_CHANGES=true, commits with: `style: remove unnecessary comments`

**Failure**: Warn only, non-blocking.

#### §4.4.2 Doc Tasks (TD*)

**Skip if**: `doc_tasks` empty or all done.

**Step 1**: Build `doc_scan_results.json`:

```json
{
  "generated_at": "{ISO}",
  "style": {},
  "files": {
    "{target}": {
      "sections": [{
        "heading": "{section}",
        "line": 1,
        "scenario": "{add|fix|verify}",
        "kb_section": "{kb_source}"
      }]
    }
  },
  "summary": {"verify": N, "add": N, "fix": N}
}
```

Scenario map: add->add, edit->fix, remove->verify.

**Step 2**: Write to `{RP1_ROOT}/work/features/{FEATURE_ID}/doc_scan_results.json`

**Step 3**: Spawn scribe:

```
subagent_type: rp1-base:scribe
prompt: |
  MODE: process
  FILES: {JSON array of targets}
  SCAN_RESULTS_PATH: {path}
  STYLE: {}
```

**Step 4**: Handle result:

| Result | Action |
|--------|--------|
| Success | Mark all TD* done (`- [x]`) |
| Partial | Done for success, blocked for failed |
| Failure | Warn, mark all blocked |

**Step 5**: Add impl summary to tasks.md for each TD* task.

#### §4.4.3 Manual Verification

If items collected from reviewers:

1. Read tasks.md
2. Check for existing `## Manual Verification` section
3. **If none**: Append:

```markdown
## Manual Verification

Items requiring manual verification before merge:

- [ ] {criterion}
  *Reason*: {reason}
```

4. **If exists**: Append only non-duplicate items
5. **If no items**: Report "No manual verification required"

### §4.5 Worktree Finalize

**Skip if**: `--no-worktree` OR no `worktree_path` set

#### §4.5.1 Check Build Status

**If any tasks blocked**: Skip push/PR.

Report: "Build incomplete (blocked tasks). Branch not pushed."

#### §4.5.2 Publish (via skill)

The worktree-workflow skill handles:

- Commit ownership validation
- Push branch (if `--push` or `--create-pr`)
- Create PR (if `--create-pr`)
- Dirty state resolution (AFK: auto-commit, Interactive: prompt)
- Restore original directory
- Cleanup worktree

**Report**:

| Property | Value |
|----------|-------|
| Branch name | `{branch}` |
| Branch pushed | Yes/No |
| PR URL | {url} (if created) |
| Worktree removed | Yes/No |

### §4.6 Build Summary

```markdown
## Build Phase Summary

**Task Units**: {completed}/{total}

### Completed Tasks
- T1: [desc] - VERIFIED
- T2,T3,T4: [desc] - VERIFIED (after retry)

### Blocked Tasks
- T5: [desc] - BLOCKED (reason: {feedback})

### Comment Cleanup
- Files: {N}, Comments removed: {N}

### User Docs
- Processed: {N}, Files updated: {N}, Status: {All|Partial|Skipped}

### Manual Verification
- Items logged: {N} (or "None required")

### Worktree
- Branch: {branch}
- Pushed: {Yes/No}
- PR: {url or N/A}
```

Update progress -> Step 4 COMPLETED (or BLOCKED if tasks failed), proceed to Step 5.

## §STEP-5: Verify

**Skip if**: Most recent `feature_verify_report*.md` contains BOTH `Overall Status: VERIFIED` AND `Ready for Merge: YES`

**Role**: FeatureValidator - final pre-merge validation. Orchestrates code quality + requirements verification.

**Constraint**: Run Phases 1-3 in PARALLEL. Phase 4 sequential after verifier completes.

### §5.1 Artifact Check

```
glob feature_verify_report*.md in feature dir, sort by mtime desc
if most_recent contains "Overall Status: VERIFIED" AND "Ready for Merge: YES":
  SKIP -> proceed to Step 6
else:
  continue to §5.2
```

### §5.2 Prerequisites

| Check | Path | Action on Fail |
|-------|------|----------------|
| Feature dir | `{RP1_ROOT}/work/features/{FEATURE_ID}/` | Error, stop |
| requirements.md | feature dir | Error, stop |
| design.md | feature dir | Error, stop |
| tasks.md | feature dir | Warn, continue |

Report prereq status before spawning agents.

### §5.3 Parallel Validation (Phases 1-3)

**CRITICAL**: Invoke ALL THREE agents in SINGLE response (parallel execution).

#### Phase 1: Code Quality Check

```
Task tool invocation:
  subagent_type: rp1-dev:code-checker
  prompt: |
    Run code quality checks for feature {FEATURE_ID} on branch {branch}.
    Generate report in {RP1_ROOT}/work/features/{FEATURE_ID}/
```

**Output**: `code_check_report_N.md`
**Validates**: lint, format, tests, code quality

#### Phase 2: Feature Verification

```
Task tool invocation:
  subagent_type: rp1-dev:feature-verifier
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    MILESTONE_ID: {MILESTONE_ID or ""}
    RP1_ROOT: {RP1_ROOT}

    Verify acceptance criteria and requirement coverage on branch {branch}.
```

**Output**: `feature_verify_report_N.md`
**Validates**: AC mapping, req coverage, test-to-req traceability
**Returns**: JSON w/ `manual_items` array

#### Phase 3: Comment Check

```
Task tool invocation:
  subagent_type: rp1-dev:comment-cleaner
  prompt: |
    SCOPE: {branch}
    BASE_BRANCH: main
    MODE: check
    REPORT_DIR: {RP1_ROOT}/work/features/{FEATURE_ID}/
```

**Output**: `comment_check_report_N.md`
**Status**: PASS (no issues) | WARN (flagged comments)
**Note**: WARN is advisory, does NOT block verification

### §5.4 Phase 4: Manual Verification Collection

**After Phase 2 (feature-verifier) completes**:

1. Parse JSON output for `manual_items` array
2. **If non-empty**:
   - Read tasks.md
   - Check for existing `## Manual Verification` section
   - Append items (dedupe by criterion):

```markdown
## Manual Verification

Items requiring manual verification before merge:

- [ ] **{AC_ID}**: {description}
  *Reason*: {reason}
```

3. **If empty**: Report "No manual verification required"

### §5.5 Result Aggregation

| Phase | Result | Effect |
|-------|--------|--------|
| 1: Code Check | PASS | Continue |
| 1: Code Check | FAIL | Log, continue |
| 2: Feature Verify | PASS | Continue |
| 2: Feature Verify | FAIL | Log, continue |
| 3: Comment Check | PASS | Continue |
| 3: Comment Check | WARN | Advisory only |

**Overall Status**:

- VERIFIED: Phases 1 + 2 both PASS
- FAILED: Either Phase 1 or 2 FAIL

### §5.6 Verification Output

```markdown
## Feature Validation Status

**Feature ID**: {FEATURE_ID}
**Milestone**: {MILESTONE_ID or "all"}

### Prerequisites
{status} Feature directory: {path}
{status} Required files present

### Phases 1-3: Parallel Validation

| Phase | Agent | Status | Report |
|-------|-------|--------|--------|
| 1 | code-checker | {PASS/FAIL} | code_check_report_N.md |
| 2 | feature-verifier | {PASS/FAIL} | feature_verify_report_N.md |
| 3 | comment-cleaner | {PASS/WARN} | comment_check_report_N.md |

### Phase 4: Manual Verification
- Status: {Complete/Skipped}
- Items: {N} logged to tasks.md | None required

### Summary
- **Overall Status**: {VERIFIED/FAILED}
- **Ready for Merge**: {YES/NO}
{if WARN: "Note: {N} unnecessary comments flagged. Run `/code-clean-comments` to clean."}

### Next Steps
{if VERIFIED: "Feature ready for archive (Step 6)"}
{if FAILED: "Address failures before proceeding"}
{if manual_items: "Complete manual verification items before merge"}
```

### §5.7 Completion

On success (VERIFIED):

```
Verification passed: {RP1_ROOT}/work/features/{FEATURE_ID}/
- Reports: code_check_report_N.md, feature_verify_report_N.md, comment_check_report_N.md
- Ready for Merge: YES
```

Update progress -> Step 5 COMPLETED, proceed to Step 6.

On failure:

```
Verification failed: see reports for details
- Ready for Merge: NO
```

| Mode | Action |
|------|--------|
| AFK | Mark FAILED, continue to Step 6 (skip archive) |
| Interactive | Prompt retry/skip/abort |

### §5.8 Post-Verify Flow (Interactive Only)

**Skip if**: AFK_MODE = true (auto-proceed to Step 6)

After verification completes, show summary and offer options before archiving.

#### §5.8.1 Change Summary

Display summary of all changes made:

```markdown
## Build Summary

**Feature**: {FEATURE_ID}
**Verification Status**: {VERIFIED/PARTIAL/FAILED}

### Files Modified
{List files changed during Step 4, grouped by type}

### Tasks Completed
| Task | Status | Summary |
|------|--------|---------|
| T1 | ✅ VERIFIED | {implementation_summary} |
| T2 | ✅ VERIFIED | {implementation_summary} |

### Blocked Tasks
| Task | Reason |
|------|--------|
| T3 | {reason} |

### Verification Results
| Phase | Status |
|-------|--------|
| Code Check | {PASS/FAIL} |
| Feature Verify | {PASS/FAIL} |
| Comment Check | {PASS/WARN} |

---

**Please review the changes above.**
Inspect modified files and verify the implementation before proceeding.
```

#### §5.8.2 Post-Verify Options

Present AskUserQuestion with three options:

```yaml
questions:
  - question: "How would you like to proceed?"
    header: "Post-Verify"
    options:
      - label: "Add or change a task"
        description: "Specify a new task to implement (goes through builder-reviewer)"
      - label: "Archive"
        description: "Archive feature to work/archives/features/"
      - label: "Do nothing"
        description: "Exit workflow, keep feature in work/features/"
    multiSelect: false
```

#### §5.8.3 Option: Add or Change Task

When user selects "Add or change a task":

**Step 1**: Prompt for task description (user selects "Other" and types):

```yaml
questions:
  - question: "Describe the task to add or change:"
    header: "New Task"
    options:
      - label: "Example: Fix the edge case for empty arrays"
        description: "Select 'Other' to type your own task description"
    multiSelect: false
```

**Step 2**: Generate task ID:

- Parse tasks.md for highest T{N} ID (ignore TD* doc tasks)
- New ID = T{N+1}

**Step 3**: Append to tasks.md:

```markdown
- [ ] **T{N+1}**: {user_description} `[complexity:medium]`

    **Reference**: Post-verify addition

    **Effort**: As needed

    **Acceptance Criteria**:

    - [ ] Task completed as described
```

**Step 4**: Spawn builder:

```
Task tool invocation:
  subagent_type: rp1-dev:task-builder
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    TASK_IDS: T{N+1}
    RP1_ROOT: {RP1_ROOT}
    WORKTREE_PATH: {worktree_path or ""}
    PREVIOUS_FEEDBACK: None

    Implement the post-verify task.
```

**Step 5**: Spawn reviewer:

```
Task tool invocation:
  subagent_type: rp1-dev:task-reviewer
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    TASK_IDS: T{N+1}
    RP1_ROOT: {RP1_ROOT}
    WORKTREE_PATH: {worktree_path or ""}
```

**Step 6**: Handle result:

- SUCCESS: Mark task done, update summary
- FAILURE: Retry once with feedback, mark blocked if still fails

**Step 7**: Loop back to §5.8.1 (show updated summary, present options again)

#### §5.8.4 Option: Archive

When user selects "Archive":

- Proceed to §STEP-6

#### §5.8.5 Option: Do Nothing

When user selects "Do nothing":

- Mark Step 6 as SKIPPED
- Output final summary
- Exit workflow gracefully
- Feature remains in `{RP1_ROOT}/work/features/{FEATURE_ID}/`

```
Workflow complete. Feature remains active at:
{RP1_ROOT}/work/features/{FEATURE_ID}/

To resume later: /build {FEATURE_ID}
To archive: /feature-archive {FEATURE_ID}
```

#### §5.8.6 AFK Mode

When AFK_MODE = true:

- Skip §5.8 entirely
- Log decision: "Post-verify options skipped (AFK mode)"
- Auto-proceed to Step 6 (archive)

## §STEP-6: Archive

**Skip if**: User selected "Do nothing" in §5.8.5

**Purpose**: Move completed feature to `{RP1_ROOT}/work/archives/features/`. Final workflow step.

### §6.1 Archive Decision

| Mode | Behavior |
|------|----------|
| AFK | Auto-archive without prompt, log decision |
| Interactive | Proceed (user already confirmed in §5.8.2) |

### §6.2 Initial Agent Invocation

Spawn feature-archiver:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-archiver
  prompt: |
    MODE: archive
    FEATURE_ID: {FEATURE_ID}
    SKIP_DOC_CHECK: false
```

### §6.3 Handle Response

**If agent returns**: `{"type":"needs_confirmation","reason":"minimal_docs",...}`

#### AFK Mode (AFK_MODE = true)

Skip prompt. Re-invoke w/ `SKIP_DOC_CHECK: true`:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-archiver
  prompt: |
    MODE: archive
    FEATURE_ID: {FEATURE_ID}
    SKIP_DOC_CHECK: true
```

Log decision:

```markdown
| Action | Choice | Rationale |
|--------|--------|-----------|
| Minimal docs confirmation | Auto-proceed | AFK mode |
```

#### Interactive Mode (AFK_MODE = false)

User already confirmed archive in §5.8.2. Re-invoke w/ `SKIP_DOC_CHECK: true`:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-archiver
  prompt: |
    MODE: archive
    FEATURE_ID: {FEATURE_ID}
    SKIP_DOC_CHECK: true
```

### §6.4 Completion

On success:

```
Feature archived: {RP1_ROOT}/work/archives/features/{FEATURE_ID}/
```

Update progress -> Step 6 COMPLETED (or DECLINED if user aborted).

---

## §SUMMARY

**Display after all steps complete/skip/fail**:

```markdown
## Build Complete

**Feature**: {FEATURE_ID}
**Directory**: {RP1_ROOT}/work/features/{FEATURE_ID}/

### Repository Status

🌿 **Branch**: {branch_name} {✅ pushed | ⏳ local only}
🔗 **PR**: {pr_url | not created}

### Step Results

| Step | Status | Details |
|------|--------|---------|
| 1: Requirements | {✅ COMPLETED | ⏭️ SKIPPED | ❌ FAILED | ➖ N/A} | {reason} |
| 2: Design | {✅ COMPLETED | ⏭️ SKIPPED | ❌ FAILED | ➖ N/A} | {reason} |
| 3: Tasks | {✅ COMPLETED | ⏭️ SKIPPED | ❌ FAILED | ➖ N/A} | {reason} |
| 4: Build | {✅ COMPLETED | ⏭️ SKIPPED | ❌ FAILED | ➖ N/A} | {reason} |
| 5: Verify | {✅ COMPLETED | ⏭️ SKIPPED | ❌ FAILED | ➖ N/A} | {reason} |
| 6: Archive | {✅ COMPLETED | ⏭️ SKIPPED | 🚫 DECLINED | ➖ N/A} | {reason} |

**Result**: {completed}/6 completed, {skipped} skipped

### Artifacts Created/Updated

| Artifact | Status |
|----------|--------|
| requirements.md | {✅ CREATED | 📝 UPDATED | 📁 EXISTED} |
| design.md | {✅ CREATED | 📝 UPDATED | 📁 EXISTED} |
| design-decisions.md | {✅ CREATED | 📝 UPDATED | 📁 EXISTED | ➖ N/A} |
| tasks.md | {✅ CREATED | 📝 UPDATED | 📁 EXISTED} |
| Code changes | {✅ YES | ➖ NO} |
| feature_verify_report*.md | {✅ CREATED | ➖ N/A} |
| Archived to | {📦 path | ➖ N/A} |
```

**If AFK_MODE = true**, append:

```markdown
### AFK Mode: Auto-Selected Decisions

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| {point} | {choice} | {why} |
```

**If errors occurred**, append recovery section from §ERROR-HANDLING.

## §ANTI-LOOP

**CRITICAL**: Single-pass execution. Execute IMMEDIATELY.

**DO NOT**:

- Ask for clarification mid-workflow
- Wait for user feedback between steps
- Loop or re-implement failed steps beyond defined retry limits
- Request additional info after workflow starts

**Blocking issue handling**:

1. Document error clearly w/ step ctx
2. Mark step FAILED or BLOCKED
3. Continue to next step (if AFK) or prompt retry/skip/abort (if interactive)
4. Output summary w/ preserved artifacts

**Execute**: Parse params -> detect artifacts -> run steps start_step to 6 -> output summary -> STOP.
