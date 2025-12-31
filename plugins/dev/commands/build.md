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

# Build Command

6-step workflow orchestrator. Task tool for agent delegation.

## §PARAMS

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| FEATURE_ID | $1 | (req) | Feature identifier |
| REQUIREMENTS | $2 | "" | Raw requirements |
| --afk | flag | false | Non-interactive mode |
| --no-worktree | flag | false | Disable worktree |
| --push | flag | false | Push branch |
| --create-pr | flag | false | Create PR (implies --push) |
| RP1_ROOT | env | `.rp1/` | Root dir |

<feature_id>$1</feature_id>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Parse flags**:
```
AFK_MODE = "--afk" in args
USE_WORKTREE = "--no-worktree" NOT in args
PUSH_BRANCH = "--push" OR "--create-pr" in args
CREATE_PR = "--create-pr" in args
```

**Feature dir**: `{RP1_ROOT}/work/features/{FEATURE_ID}/`

**Validation**: FEATURE_ID req. Create dir if missing.

## §AFK-MODE

| Aspect | Behavior |
|--------|----------|
| Prompts | Skip ALL AskUserQuestion |
| Defaults | Auto-select via KB + codebase |
| On failure | Auto-retry once, mark blocked, continue |
| Archive | Auto-archive post-verify |
| Worktree dirty | Auto-commit |
| Follow-ups | Skip |

Log decisions:
```markdown
## AFK Mode: Auto-Selected Defaults
| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| {point} | {choice} | {why} |
```

## §ARTIFACT-DETECTION

First failing check -> `start_step`.

| Step | Artifact | Detection | Skip When |
|------|----------|-----------|-----------|
| 1 | requirements.md | Has `## 5. Functional Requirements` | Found |
| 2 | design.md | Has `## 2. Architecture` | Found |
| 3 | tasks.md | Has `- [ ]` or `- [x]` | Found |
| 4 | tasks.md | No `- [ ]` | All done |
| 5 | feature_verify_report*.md | `Overall Status: VERIFIED` + `Ready for Merge: YES` | Both in most recent |
| 6 | N/A | Never skip | Always prompt/auto |

**Algorithm**:
```
start_step = 1
if requirements.md missing "## 5. Functional Requirements": STOP
if design.md missing "## 2. Architecture": start_step=2, STOP
if tasks.md missing/no entries: start_step=3, STOP
if tasks.md has "- [ ]": start_step=4, STOP
if verify report missing VERIFIED+YES: start_step=5, STOP
start_step = 6
```

**Output**:
```markdown
## Artifact Detection
**Feature**: {FEATURE_ID}
**Directory**: {feature_dir}

| Step | Artifact | Status | Details |
|------|----------|--------|---------|
| 1-6 | ... | FOUND/MISSING | ... |

**Start Step**: {N} - {name}
**Skipping**: Steps 1-{N-1}
```

## §PROGRESS

| Step | Name | Agent(s) |
|------|------|----------|
| 1 | Requirements | feature-requirement-gatherer |
| 2 | Design | feature-architect, hypothesis-tester (opt), feature-tasker |
| 3 | Tasks | feature-tasker |
| 4 | Build | task-builder, task-reviewer, comment-cleaner, scribe |
| 5 | Verify | code-checker, feature-verifier, comment-cleaner |
| 6 | Archive | feature-archiver |

**Symbols**: `[ ]`=PENDING, `[~]`=RUNNING, `[x]`=COMPLETED, `[-]`=SKIPPED, `[!]`=FAILED, `[R]`=RETRYING, `[D]`=DECLINED

```markdown
## Workflow Progress
Step 1: Requirements   [{status}] {reason}
...
Step 6: Archive        [{status}] {reason}
Current: Step {N} of 6
```

## §ERROR-HANDLING

### Foundational Steps (CRITICAL)

Steps 1-3 foundational. ANY fail -> ABORT immediately.

| Step | Foundational | On Fail |
|------|--------------|---------|
| 1-3 | YES | ABORT |
| 4-6 | NO | Retry/skip per mode |

### Retry (Steps 4-6 only)

| Mode | On Failure |
|------|------------|
| AFK | Retry once, mark blocked, continue |
| Interactive (ask) | Prompt: retry/skip/abort |
| Interactive (auto) | Mark blocked, continue |

### AFK Retry Flow
```
if failure:
  if step in [1,2,3]: ABORT
  elif AFK_MODE:
    if attempts < 2: retry
    else: mark_blocked, continue
```

### Error Summary
```markdown
## Build Error
**Feature**: {FEATURE_ID}
**Directory**: {RP1_ROOT}/work/features/{FEATURE_ID}/
**Mode**: {afk|interactive}

### Failed Step
| Step | {N} | Attempts | {X}/{max} | Error | {msg} |

### Step Status
| Step | Status | Details |
...

### Recovery
1. Resume: `/build {FEATURE_ID}`
2. Interactive: `/build {FEATURE_ID}` w/o --afk
3. Manual: inspect feature dir
```

**Preservation**: NEVER delete completed artifacts. NEVER rollback. KEEP partial artifacts.

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

**Skip if**: requirements.md has `## 5. Functional Requirements`

### §1.1 Spawn
```
Task: rp1-dev:feature-requirement-gatherer
prompt: |
  FEATURE_ID: {FEATURE_ID}
  AFK_MODE: {AFK_MODE}
  RP1_ROOT: {RP1_ROOT}
  Generate requirements. Raw: <REQUIREMENTS>
```

### §1.2 Response
- success -> log, proceed Step 2
- error -> ABORT (foundational)

## §STEP-2: Design

**Skip if**: design.md has `## 2. Architecture`

### §2.1 Mode
UPDATE_MODE = design.md exists

### §2.2 Architect
```
Task: rp1-dev:feature-architect
prompt: |
  FEATURE_ID: {FEATURE_ID}
  AFK_MODE: {AFK_MODE}
  UPDATE_MODE: {UPDATE_MODE}
  RP1_ROOT: {RP1_ROOT}
  Generate design from requirements.
```

### §2.3 Response
- success -> extract `flagged_hypotheses`, §2.4
- error -> ABORT

### §2.4 Hypothesis Testing
If `flagged_hypotheses` non-empty:
```
Task: rp1-dev:hypothesis-tester
prompt: "Validate hypotheses for feature {FEATURE_ID}"
```
Update design w/ findings. Skip if empty/all HIGH confidence.

### §2.5 Task Generation
```
Task: rp1-dev:feature-tasker
prompt: |
  FEATURE_ID: {FEATURE_ID}
  UPDATE_MODE: {UPDATE_MODE}
  RP1_ROOT: {RP1_ROOT}
```

### §2.6 Completion
Outputs: design.md, design-decisions.md, tasks.md

## §STEP-3: Tasks

**Skip if**: tasks.md exists w/ `- [ ]` or `- [x]`

### §3.1 Check
```
if tasks.md exists AND has task entries: SKIP
else: §3.2
```

### §3.2 Generate
```
Task: rp1-dev:feature-tasker
prompt: |
  FEATURE_ID: {FEATURE_ID}
  UPDATE_MODE: false
  RP1_ROOT: {RP1_ROOT}
```

## §STEP-4: Build

**Skip if**: All tasks `[x]`/`[X]` (no `- [ ]`)

**Role**: Orchestrator only. All impl via Task tool.

### §4.1 Worktree Setup

**Skip if**: `--no-worktree`

```
Skill: rp1-dev:worktree-workflow
args: task_slug={FEATURE_ID}, agent_prefix=feature, create_pr={CREATE_PR}
```

Store: `worktree_path`, `branch`, `basedOn`

### §4.2 Task Parsing

**Path**: `{RP1_ROOT}/work/features/{FEATURE_ID}/tasks.md`

**Regex**: `- \[([ x!])\] \*\*([^*]+)\*\*: (.+?)(?:\s*\`\[complexity:(simple|medium|complex)\]\`)?$`

| Group | Field | Values |
|-------|-------|--------|
| 1 | status | space=pending, x=done, !=blocked |
| 2 | task_id | T1, T1.1, TD1, etc. |
| 3 | description | Task text |
| 4 | complexity | simple/medium/complex (default: medium) |

**Lists**:
- `implementation_tasks`: T* prefix, pending
- `doc_tasks`: TD* prefix, pending

### §4.3 Builder-Reviewer Loop

#### §4.3.1 Adaptive Grouping
```
units=[], simple_buffer=[]
for task in pending:
  if simple: buffer.append; if len>=3: flush
  else: flush; units.append(single, extra_ctx if complex)
flush remaining
```
Output: TaskUnits (1-3 tasks). Skip grouping if `--no-group`.

#### §4.3.2 Loop
```
for unit in task_units:
  attempt=1, max=2, feedback=null
  while attempt <= max:
    builder_result = spawn_builder(unit, feedback)
    reviewer_result = spawn_reviewer(unit)
    if SUCCESS: report VERIFIED, break
    elif attempt < max: feedback=result, attempt++, report RETRY
    else: escalate, break
  collect manual_verification items
```

#### §4.3.3 Builder
```
Task: rp1-dev:task-builder
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {ids}
  RP1_ROOT: {RP1_ROOT}
  WORKTREE_PATH: {path or ""}
  PREVIOUS_FEEDBACK: {feedback or "None"}
  Implement. cd to WORKTREE if set. Update tasks.md.
```

#### §4.3.4 Reviewer
```
Task: rp1-dev:task-reviewer
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {ids}
  RP1_ROOT: {RP1_ROOT}
  WORKTREE_PATH: {path or ""}
  Return JSON w/ status: SUCCESS/FAILURE
```

#### §4.3.5 Escalation
- AFK: Mark `- [!]`, continue, log
- Interactive (ask): Prompt skip/guidance/abort
- Interactive (auto): Mark blocked, continue

#### §4.3.6 Progress
```markdown
## Task Unit {N}/{total}: {ids} ({complexity})
  Builder: {status}
  Reviewer: {result} (confidence: {N}%)
  Status: {VERIFIED|RETRY|BLOCKED}
```

### §4.4 Post-Build

#### §4.4.1 Comment Cleaner
```
Task: rp1-dev:comment-cleaner
prompt: |
  SCOPE: {basedOn}..HEAD
  BASE_BRANCH: {basedOn}
  WORKTREE_PATH: {path or ""}
  COMMIT_CHANGES: {use_worktree}
```
Commits: `style: remove unnecessary comments`. Failure: warn only.

#### §4.4.2 Doc Tasks (TD*)
Skip if empty/done.

Build `doc_scan_results.json`:
```json
{"generated_at":"{ISO}","style":{},"files":{"{target}":{"sections":[{"heading":"{section}","line":1,"scenario":"{add|fix|verify}","kb_section":"{kb_source}"}]}},"summary":{"verify":N,"add":N,"fix":N}}
```

Spawn scribe:
```
Task: rp1-base:scribe
prompt: |
  MODE: process
  FILES: {targets}
  SCAN_RESULTS_PATH: {path}
  STYLE: {}
```

Handle: Success->mark done. Partial->split. Failure->warn, mark blocked.

#### §4.4.3 Manual Verification
If items from reviewers:
- Read tasks.md
- Append to `## Manual Verification` (dedupe):
```markdown
## Manual Verification
- [ ] {criterion}
  *Reason*: {reason}
```

### §4.5 Worktree Finalize

**Skip if**: `--no-worktree` OR no worktree_path

If blocked tasks: skip push/PR.

Skill handles: commit validation, push, PR, dirty state, restore dir, cleanup.

Report: Branch, pushed, PR URL, worktree removed.

### §4.6 Build Summary
```markdown
## Build Phase Summary
**Task Units**: {completed}/{total}

### Completed Tasks
- T1: [desc] - VERIFIED

### Blocked Tasks
- T5: [desc] - BLOCKED ({reason})

### Comment Cleanup
- Files: {N}, Removed: {N}

### User Docs
- Processed: {N}, Updated: {N}, Status: {All|Partial|Skipped}

### Manual Verification
- Items: {N} | None required

### Worktree
- Branch: {branch}, Pushed: {Yes/No}, PR: {url|N/A}
```

## §STEP-5: Verify

**Skip if**: Most recent verify report has `Overall Status: VERIFIED` + `Ready for Merge: YES`

**Constraint**: Phases 1-3 PARALLEL. Phase 4 sequential.

### §5.1 Check
```
glob feature_verify_report*.md, sort mtime desc
if has VERIFIED + YES: SKIP
```

### §5.2 Prerequisites
| Check | Action on Fail |
|-------|----------------|
| Feature dir | Error, stop |
| requirements.md | Error, stop |
| design.md | Error, stop |
| tasks.md | Warn, continue |

### §5.3 Parallel Validation (1-3)

**CRITICAL**: Invoke ALL THREE in SINGLE response.

#### Phase 1: Code Quality
```
Task: rp1-dev:code-checker
prompt: |
  Run quality checks for {FEATURE_ID} on branch {branch}.
  Report to {RP1_ROOT}/work/features/{FEATURE_ID}/
```
Output: `code_check_report_N.md`

#### Phase 2: Feature Verify
```
Task: rp1-dev:feature-verifier
prompt: |
  FEATURE_ID: {FEATURE_ID}
  MILESTONE_ID: {MILESTONE_ID or ""}
  RP1_ROOT: {RP1_ROOT}
  Verify AC + req coverage on branch {branch}.
```
Output: `feature_verify_report_N.md`. Returns JSON w/ `manual_items`.

#### Phase 3: Comment Check
```
Task: rp1-dev:comment-cleaner
prompt: |
  SCOPE: {branch}
  BASE_BRANCH: main
  MODE: check
  REPORT_DIR: {RP1_ROOT}/work/features/{FEATURE_ID}/
```
Output: `comment_check_report_N.md`. WARN advisory only.

### §5.4 Manual Verification
After Phase 2: parse `manual_items`, append to tasks.md `## Manual Verification` (dedupe).

### §5.5 Aggregation
- VERIFIED: Phases 1+2 PASS
- FAILED: Either FAIL

### §5.6 Output
```markdown
## Feature Validation Status
**Feature ID**: {FEATURE_ID}

### Prerequisites
{status} Feature dir + required files

### Phases 1-3
| Phase | Agent | Status | Report |
|-------|-------|--------|--------|
| 1 | code-checker | {PASS/FAIL} | code_check_report_N.md |
| 2 | feature-verifier | {PASS/FAIL} | feature_verify_report_N.md |
| 3 | comment-cleaner | {PASS/WARN} | comment_check_report_N.md |

### Summary
- **Overall**: {VERIFIED/FAILED}
- **Ready for Merge**: {YES/NO}
```

### §5.7 Completion
- VERIFIED: proceed Step 6
- FAILED: AFK -> skip archive; Interactive -> prompt

### §5.8 Post-Verify (Interactive Only)

**Skip if**: AFK_MODE

#### §5.8.1 Summary
```markdown
## Build Summary
**Feature**: {FEATURE_ID}
**Status**: {VERIFIED/PARTIAL/FAILED}

### Files Modified
{grouped list}

### Tasks
| Task | Status | Summary |
...

### Verification
| Phase | Status |
...

**Review changes before proceeding.**
```

#### §5.8.2 Options
AskUserQuestion:
- "Add or change a task" -> §5.8.3
- "Archive" -> §STEP-6
- "Do nothing" -> exit, feature stays active

#### §5.8.3 Add Task
1. Prompt for description
2. Generate T{N+1}
3. Append to tasks.md
4. Spawn builder + reviewer
5. Handle result (retry once if fail)
6. Loop back to §5.8.1

#### §5.8.5 Do Nothing
Mark Step 6 SKIPPED, output summary, exit.

#### §5.8.6 AFK
Skip §5.8 entirely, auto-proceed Step 6.

## §STEP-6: Archive

**Skip if**: User chose "Do nothing"

### §6.1 Decision
- AFK: auto-archive, log
- Interactive: proceed (confirmed in §5.8.2)

### §6.2 Spawn
```
Task: rp1-dev:feature-archiver
prompt: |
  MODE: archive
  FEATURE_ID: {FEATURE_ID}
  SKIP_DOC_CHECK: false
```

### §6.3 Handle `needs_confirmation`
Re-invoke w/ `SKIP_DOC_CHECK: true`. Log decision in AFK.

### §6.4 Completion
```
Feature archived: {RP1_ROOT}/work/archives/features/{FEATURE_ID}/
```

---

## §SUMMARY

```markdown
## Build Complete
**Feature**: {FEATURE_ID}
**Directory**: {RP1_ROOT}/work/features/{FEATURE_ID}/

### Repository Status
Branch: {branch} {pushed|local}
PR: {url|not created}

### Step Results
| Step | Status | Details |
|------|--------|---------|
| 1-6 | COMPLETED/SKIPPED/FAILED/DECLINED/N/A | {reason} |

**Result**: {completed}/6 completed, {skipped} skipped

### Artifacts
| Artifact | Status |
|----------|--------|
| requirements.md | CREATED/UPDATED/EXISTED |
| design.md | ... |
| tasks.md | ... |
| Code changes | YES/NO |
| verify report | CREATED/N/A |
| Archived to | {path}/N/A |
```

If AFK: append decisions table. If errors: append recovery section.

## §ANTI-LOOP

**CRITICAL**: Single-pass. Execute IMMEDIATELY.

**DO NOT**:
- Ask clarification mid-workflow
- Wait for feedback between steps
- Loop beyond retry limits
- Request additional info after start

**Blocking**: Document error, mark FAILED/BLOCKED, continue (AFK) or prompt (interactive), output summary.

**Execute**: Parse params -> detect artifacts -> run start_step to 6 -> summary -> STOP.
