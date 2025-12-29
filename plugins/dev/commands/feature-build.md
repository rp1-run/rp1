---
name: feature-build
version: 3.0.0
description: Orchestrates feature implementation using builder-reviewer agent pairs with adaptive task grouping and configurable failure handling.
argument-hint: "feature-id [milestone-id] [mode]"
tags:
  - core
  - feature
  - orchestration
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Feature Build Orchestrator

Minimal coordinator for builder-reviewer workflow. Does NOT load KB/design/codebase—only coordinates task flow.

## §PARAMS

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| FEATURE_ID | $1 | (req) | Feature identifier |
| MILESTONE_ID | $2 | `""` | Milestone (empty=tasks.md) |
| MODE | $3 | `ask` | Failure: `ask`/`auto` |
| RP1_ROOT | env | `.rp1/` | Root dir |

<feature_id>$1</feature_id>
<milestone_id>$2</milestone_id>
<mode>$3</mode>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Special**: `--no-group` in args -> all tasks processed individually

## §1 Validation

1. FEATURE_ID: Required, error if empty
2. MILESTONE_ID: If set -> `milestone-{MILESTONE_ID}.md`, else `tasks.md`
3. MODE: Must be `ask`/`auto`, default `ask`
4. RP1_ROOT: env val or `.rp1/`

**Task file path**: `{RP1_ROOT}/work/features/{FEATURE_ID}/{tasks.md|milestone-{MILESTONE_ID}.md}`

## §2 Task Parsing

**Regex**: `- \[([ x!])\] \*\*([^*]+)\*\*: (.+?)(?:\s*\`\[complexity:(simple|medium|complex)\]\`)?$`

**Extract**:
- `status`: space=pending, x=done, !=blocked
- `task_id`: T1, T1.1, TD1, etc.
- `description`: Task text
- `complexity`: simple/medium/complex (default: medium)
- `is_doc_task`: true if ID starts w/ "TD"

**TD* tasks** also extract: `doc_type` (add/edit/remove), `target` (path), `section`, `kb_source`

**Build lists**:
- `implementation_tasks`: T* prefix -> builder/reviewer
- `doc_tasks`: TD* prefix -> scribe agent

**Resume**: Filter to pending only (status=` `), start from first.

## §3 Adaptive Grouping

Group `implementation_tasks` by complexity (skip if `--no-group`):

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

**Output**: Array of TaskUnits (1-3 tasks each) w/ `extra_context` flag.

## §4 Orchestration Loop

```
for unit in task_units:
  attempt = 1, max_attempts = 2, previous_feedback = null
  while attempt <= max_attempts:
    builder_result = spawn_builder(unit, previous_feedback)
    reviewer_result = spawn_reviewer(unit)
    if reviewer_result.status == "SUCCESS":
      report_progress(unit, "VERIFIED", attempt); break
    else:
      if attempt < max_attempts:
        previous_feedback = reviewer_result.feedback; attempt++
        report_progress(unit, "RETRYING", attempt)
      else:
        handle_failure(unit, reviewer_result, MODE); break
```

### §4.1 Spawn Builder

Task tool:
```
subagent_type: rp1-dev:task-builder
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {comma-separated IDs}
  RP1_ROOT: {RP1_ROOT}
  PREVIOUS_FEEDBACK: {feedback or "None"}
  Implement task(s). Load context (KB, PRD, design). Update tasks.md, mark done.
```

Wait for completion before reviewer.

### §4.2 Spawn Reviewer

Task tool:
```
subagent_type: rp1-dev:task-reviewer
prompt: |
  FEATURE_ID: {FEATURE_ID}
  TASK_IDS: {comma-separated IDs}
  RP1_ROOT: {RP1_ROOT}
  Verify builder work. Return JSON w/ status: SUCCESS/FAILURE.
```

Parse JSON response. Invalid JSON = FAILURE.

**Collect manual_verification**: Aggregate across units, dedupe by criterion.

### §4.3 Retry

On first failure:
1. Capture feedback from `issues` array
2. Increment attempt
3. Re-run builder w/ feedback

### §4.4 Escalation

**MODE=ask**: AskUserQuestion w/ options:
- "Skip" -> Mark blocked (`- [!]`), continue
- "Provide guidance" -> Bonus builder attempt (no retry count)
- "Abort" -> Output summary, exit

**MODE=auto**: Mark blocked, continue.

### §4.5 Doc Tasks

After ALL implementation units complete, process `doc_tasks` if any pending.

**Skip if**: empty or all done

**Step 1**: Build scan_results.json:
```json
{
  "generated_at": "{ISO}",
  "style": {},
  "files": {"{target}": {"sections": [{"heading": "{section}", "line": 1, "scenario": "{add|fix|verify}", "kb_section": "{kb_source}"}]}},
  "summary": {"verify": N, "add": N, "fix": N}
}
```
Scenario map: add->add, edit->fix, remove->verify. Group by target file.

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
- Success: Mark all TD* done (`- [x]`)
- Partial: Done for success, blocked for failed
- Failure: Warn, mark all blocked

**Step 5**: Add impl summary to tasks.md for each TD* task.

## §5 Progress

Per unit:
```
## Task Unit {N}/{total}: {task_ids} ({complexity})
  Builder: {emoji} {status}
  Reviewer: {emoji} {result} (confidence: {N}%)
  Status: {VERIFIED|RETRY|BLOCKED}
```

## §6 Post-Build

### §6.1 Comment Cleaner

```
subagent_type: rp1-dev:comment-cleaner
prompt: |
  SCOPE: unstaged
  BASE_BRANCH: main
```

Failure: Warn only, non-blocking.

### §6.2 Manual Verification

If manual items collected:
1. Read tasks.md
2. Check for existing "## Manual Verification" section
3. **If none**: Append:
   ```
   ## Manual Verification
   Items requiring manual verification before merge:
   - [ ] {criterion}
     *Reason*: {reason}
   ```
4. **If exists**: Append only non-duplicate items
5. **If no items**: Report "No manual verification required"

## §7 Summary

```
## Build Summary
**Feature**: {FEATURE_ID}
**Mode**: {MODE}
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

### Next Steps
{All done}: Ready for `/feature-verify {FEATURE_ID}`
{Blocked}: Review blocked, run `/feature-build {FEATURE_ID}` to retry
```

## §8 Anti-Loop

**CRITICAL**: Single pass only. Do NOT:
- Ask clarification (except AskUserQuestion for escalation)
- Wait for external feedback
- Re-read files multiple times
- Loop to earlier steps

On error (file not found, invalid format): report clearly, stop.

## §9 Exclusions

Orchestrator does NOT:
- Load KB files
- Load PRD/design docs
- Analyze codebase
- Make impl decisions
- Verify code quality

All delegated to builder/reviewer agents.

Begin: Validate params -> read task file -> group tasks -> orchestration loop.
