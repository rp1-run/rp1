---
name: feature-build
version: 4.1.0
description: Orchestrates feature implementation using builder-reviewer agent pairs with adaptive task grouping and configurable failure handling. Supports --afk mode for autonomous execution.
argument-hint: "feature-id [milestone-id] [mode] [--afk] [--no-worktree] [--push] [--create-pr]"
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
| --afk | flag | `false` | Enable non-interactive mode (skips prompts, uses defaults) |
| --no-worktree | flag | `false` | Disable worktree isolation |
| --push | flag | `false` | Push branch after build |
| --create-pr | flag | `false` | Create PR (implies --push) |

<feature_id>$1</feature_id>
<milestone_id>$2</milestone_id>
<mode>$3</mode>
<rp1_root>{{RP1_ROOT}}</rp1_root>

**Special**: `--no-group` in args -> all tasks processed individually

## §AFK Mode Detection

**Parse arguments for --afk flag**:

Check if `--afk` appears in any argument position. Set AFK_MODE accordingly:

```
AFK_MODE = false
if "--afk" appears in arguments:
    AFK_MODE = true
```

**When AFK_MODE is true**:
- Skip all interactive prompts (AskUserQuestion)
- On failure, automatically mark tasks blocked and continue (equivalent to MODE=auto)
- Skip post-build follow-up prompts (auto-select "Done")
- On dirty state in worktree, auto-commit changes
- Use existing test patterns via builder/reviewer agents
- Log all auto-selected defaults for user review

**AFK Mode Logging**:

Track all auto-selected defaults during execution. At the end of build, output:

```markdown
## AFK Mode: Auto-Selected Defaults

| Decision Point | Auto-Selected Choice | Rationale |
|----------------|---------------------|-----------|
| [escalation point] | [choice made] | [why] |
```

## §0 Worktree Setup

**Skip if**: `--no-worktree` in arguments

### §0.1 Preserve Original Directory

Store current directory before any cd operations:

```bash
original_cwd=$(pwd)
```

Record `original_cwd` in working memory for Phase 4 cleanup.

### §0.2 Create Worktree

```bash
rp1 agent-tools worktree create {FEATURE_ID} --prefix feature
```

Parse JSON response:

```json
{
  "path": "/path/to/worktree",
  "branch": "feature/my-feature-abc123",
  "basedOn": "abc1234"
}
```

Store in working memory:

- `worktree_path` = response.path
- `branch` = response.branch
- `basedOn` = response.basedOn

**On failure**: STOP, report error, do not proceed.

### §0.3 Enter Worktree

```bash
cd {worktree_path}
```

### §0.4 Verify State

**Check 1: Verify history**

```bash
git log --oneline -3
```

Expected: Normal commit history (no errors or abnormal commits indicating corrupted history).

**Check 2: Verify basedOn in history**

The `basedOn` commit must appear in recent history (should be HEAD at this point).

**Check 3: Verify branch**

```bash
git branch --show-current
```

Expected: Output matches `branch` value exactly.

**Verification Failure Protocol**:

If ANY check fails:

1. STOP immediately
2. Report failure: which check failed, expected vs actual, worktree path
3. Cleanup: `cd {original_cwd} && rp1 agent-tools worktree cleanup {worktree_path}`
4. Exit with error

### §0.5 Install Dependencies

Detect package manager and install. Check lockfiles first (more specific), then manifests:

| File | Command |
|------|---------|
| `bun.lockb` | `bun install` |
| `package-lock.json` | `npm ci` |
| `yarn.lock` | `yarn install --frozen-lockfile` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `Cargo.lock` | `cargo build --locked` |
| `package.json` (no lockfile) | `npm install` |
| `Cargo.toml` (no lockfile) | `cargo build` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `pyproject.toml` | `pip install -e .` |
| `go.mod` | `go mod download` |
| `Gemfile` | `bundle install` |

**No files detected**: Skip dependency installation.

**Installation failure**: STOP, cleanup worktree, report error.

### §0.6 Variables Set

After successful setup:

- `original_cwd`: Directory to restore after cleanup
- `worktree_path`: Absolute path to worktree
- `branch`: Branch name for push/PR
- `basedOn`: Base commit for validation
- `use_worktree`: true (false if `--no-worktree`)

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
  WORKTREE_PATH: {worktree_path or ""}
  PREVIOUS_FEEDBACK: {feedback or "None"}
  Implement task(s). If WORKTREE_PATH provided, cd there first. Load context (KB, PRD, design). Update tasks.md, mark done.
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
  WORKTREE_PATH: {worktree_path or ""}
  Verify builder work. If WORKTREE_PATH provided, verify in that directory. Return JSON w/ status: SUCCESS/FAILURE.
```

Parse JSON response. Invalid JSON = FAILURE.

**Collect manual_verification**: Aggregate across units, dedupe by criterion.

### §4.3 Retry

On first failure:

1. Capture feedback from `issues` array
2. Increment attempt
3. Re-run builder w/ feedback

### §4.4 Escalation

**AFK_MODE=true**: Automatically mark blocked (`- [!]`), continue to next unit. Log decision:
- Decision Point: "Task {task_ids} failed after retry"
- Auto-Selected Choice: "Mark blocked, continue"
- Rationale: "AFK mode - autonomous execution without prompts"

**MODE=ask** (and AFK_MODE=false): AskUserQuestion w/ options:

- "Skip" -> Mark blocked (`- [!]`), continue
- "Provide guidance" -> Bonus builder attempt (no retry count)
- "Abort" -> Output summary, exit

**MODE=auto** (and AFK_MODE=false): Mark blocked, continue.

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
  SCOPE: {basedOn}..HEAD
  BASE_BRANCH: {basedOn}
  WORKTREE_PATH: {worktree_path or ""}
  COMMIT_CHANGES: {true if use_worktree else false}
```

**Key Behavior**:

- SCOPE uses `{basedOn}..HEAD` for line-scoped filtering (only comments on changed lines)
- BASE_BRANCH set to `{basedOn}` commit for accurate diff baseline
- If COMMIT_CHANGES=true, comment-cleaner commits with: `style: remove unnecessary comments`

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

## §7 Worktree Finalize

**Skip if**: `--no-worktree` in arguments OR no `worktree_path` set

### §7.1 Check Build Status

**If any tasks blocked**: Skip push/PR, proceed directly to §7.5.

Report: "Build incomplete (blocked tasks). Branch not pushed."

Set `should_push = false`, `should_pr = false`.

### §7.2 Commit Ownership Validation

```bash
git log {basedOn}..HEAD --oneline --format="%h %an <%ae> %s"
```

**Validate**:

1. Commit count is reasonable (> 0 commits expected)
2. No orphan commits (all commits descend from `basedOn`)
3. No unexpected authors (all commits from agent/user identity)

**Validation failure protocol**:

1. STOP push operation
2. Preserve worktree for investigation (do NOT cleanup)
3. Report anomaly with expected vs actual values
4. Proceed to §7.6 (restore directory only, skip cleanup)

### §7.3 Push Branch (Conditional)

**Execute if**: (`--push` OR `--create-pr`) AND validation passed AND no blocked tasks

```bash
git push -u origin {branch}
```

**Retry on failure**: 3 attempts with backoff (10s, 20s, 30s)

```
attempt = 1, max_retries = 3, delays = [10, 20, 30]
while attempt <= max_retries:
  result = git push -u origin {branch}
  if success: break
  if attempt < max_retries:
    report: "Push failed, retrying in {delays[attempt-1]}s (attempt {attempt}/{max_retries})"
    sleep(delays[attempt-1])
    attempt++
  else:
    report: "Push failed after {max_retries} attempts"
    set push_failed = true
```

**Push failure**: Branch remains local. Report clearly with recovery guidance:

- "Authentication failed" -> suggest `gh auth login` or SSH key refresh
- "Network error" -> suggest checking connectivity and retrying manually
- Other -> show error message, suggest `git push -u origin {branch}` to retry

### §7.4 Create PR (Conditional)

**Execute if**: `--create-pr` AND push succeeded

```bash
gh pr create --head {branch} --base main \
  --title "feat({FEATURE_ID}): {summary}" \
  --body "$(cat <<'EOF'
## Summary
{task summaries from completed tasks}

## Tasks Implemented
{list of task IDs and descriptions}

## Test Plan
- Verify via `/feature-verify {FEATURE_ID}`

---
Generated by https://rp1.run (feature-build)
EOF
)"
```

**PR title**: Generate summary from feature scope (first 50 chars of main goal).

**PR body construction**:

1. Summary: One bullet per major change
2. Tasks Implemented: List all completed T* tasks with descriptions
3. Test Plan: Standard verification step

**Error handling**:

- "PR already exists" -> Report existing PR URL, treat as success
- Other failures -> Warn only (branch pushed, user can create PR manually)

PR creation failure is NON-BLOCKING. Branch is already pushed.

### §7.5 Dirty State Check

```bash
git status --porcelain
```

**If dirty** (output not empty):

**AFK_MODE=true**: Automatically commit changes with message "chore: uncommitted changes from feature build". Log decision:
- Decision Point: "Uncommitted changes in worktree"
- Auto-Selected Choice: "Auto-commit"
- Rationale: "AFK mode - preserve all work without prompts"

**AFK_MODE=false**: Use AskUserQuestion with options:

- "Commit changes" -> Commit with message "chore: uncommitted changes from feature build"
- "Discard changes" -> `git checkout -- .`
- "Abort cleanup" -> Skip cleanup, report worktree path for manual handling

**If clean**: Proceed to cleanup.

### §7.6 Restore Directory

```bash
cd {original_cwd}
```

**CRITICAL**: Must restore before cleanup (cannot delete directory you are in).

### §7.7 Cleanup Worktree

**Skip if**: Validation failed in §7.2 (preserve for investigation)

```bash
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

`--keep-branch` preserves the branch after removing the worktree directory.

**Report**:

- Branch name: `{branch}`
- Branch pushed: Yes/No
- PR URL: {url} (if created)
- Worktree removed: Yes/No

## §8 Summary & Follow-ups

### §8.1 Trigger Follow-up Loop

**After §7 Worktree Finalize completes**:

If AFK_MODE=true: Skip follow-ups, output summary directly (see §10).

If ALL initial tasks verified (no blocked) AND AFK_MODE=false: Proceed to §10 Post-Build Follow-ups

If any blocked tasks: Skip follow-ups, output summary directly.

### §8.2 Final Summary

Output after follow-up loop completes (or if skipped):

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

### Follow-up Tasks
- T{N}: [desc] - {VERIFIED|BLOCKED}
(if any follow-ups were processed)

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

**AFK Mode Completion**: If AFK_MODE was true, append to summary:

```markdown
## AFK Mode Summary

All decisions were made autonomously. Auto-selected defaults:

| Decision Point | Auto-Selected Choice | Rationale |
|----------------|---------------------|-----------|
| [from logged decisions during execution] |

Test patterns used: Existing codebase patterns via builder/reviewer agents.
Follow-up prompts: Skipped (autonomous mode).

Review blocked tasks (if any) and re-run with `/feature-build {FEATURE_ID}` to retry.
```

## §9 Anti-Loop

**CRITICAL**: Single pass only (except post-build loop in non-AFK mode). Do NOT:

- Ask clarification (except AskUserQuestion for escalation/follow-ups when AFK_MODE=false)
- Wait for external feedback
- Re-read files multiple times
- Loop to earlier steps

**AFK_MODE=true**: No AskUserQuestion calls at all. All decisions are auto-selected and logged.

On error (file not found, invalid format): report clearly, stop.

## §10 Post-Build Follow-ups

After successful build (no blocked tasks), offer follow-up capability.

**AFK_MODE=true**: Skip follow-up prompts entirely. Log decision:
- Decision Point: "Post-build follow-up prompt"
- Auto-Selected Choice: "Skip (Done)"
- Rationale: "AFK mode - autonomous execution complete, no interactive follow-ups"

Proceed directly to §8 Summary.

### §10.1 Follow-up Prompt

**Skip if AFK_MODE=true** (see above).

Use AskUserQuestion with options:

- "Add follow-up task" -> User describes additional work
- "Done" -> Exit build session

**Prompt**: "Build complete. Any follow-up tasks? (e.g., 'also add input validation', 'fix the edge case for empty arrays')"

### §10.2 Task Generation

If user provides follow-up request:

1. **Parse existing tasks** from tasks.md to find max task ID:
   - Extract all `T{N}` IDs (e.g., T1, T2, T3)
   - Find max N value
   - New ID = `T{max+1}`

2. **Determine complexity** from request:
   - Simple: single file, small change, config tweak
   - Medium: multi-file, moderate logic (default)
   - Complex: architectural, cross-cutting

3. **Append task** to tasks.md before any "## Manual Verification" section:

   ```markdown
   - [ ] **T{N}**: {user_request_description} `[complexity:{complexity}]`
   ```

### §10.3 Execute Follow-up

1. Create single TaskUnit for the new task
2. Run builder/reviewer loop (§4) for this unit
3. Return to §10.1 to offer more follow-ups

### §10.4 Exit Condition

- User selects "Done" -> proceed to §8 Summary (updated)
- 3 consecutive failures on same follow-up -> force exit with warning

### §10.5 Summary Update

When follow-ups complete, append to summary:

```
### Follow-up Tasks
- T{N}: [desc] - {VERIFIED|BLOCKED}
- T{M}: [desc] - {VERIFIED|BLOCKED}
```

## §11 Exclusions

Orchestrator does NOT:

- Load KB files
- Load PRD/design docs
- Analyze codebase
- Make impl decisions
- Verify code quality

All delegated to builder/reviewer agents.

Begin: Parse --afk flag -> Worktree setup (if enabled) -> Validate params -> read task file -> group tasks -> orchestration loop -> post-build -> worktree finalize (push/PR/cleanup) -> follow-up loop (if all tasks verified AND not AFK mode) -> summary (include AFK summary if AFK mode).
