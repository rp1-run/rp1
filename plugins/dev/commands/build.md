---
name: build
version: 1.3.0
description: Orchestrates complete feature development workflow by sequentially invoking feature-requirements, feature-design, feature-build, feature-verify, and feature-archive commands with smart artifact detection and resumption.
argument-hint: "feature-id [--afk]"
tags:
  - core
  - feature
  - orchestration
created: 2025-12-30
author: cloud-on-prem/rp1
---

# Build Command - Feature Workflow Orchestrator

End-to-end feature orchestrator. Invokes 5 feature commands via SlashCommand w/ artifact detection for resumption.

## §IN

| Param | Pos | Default | Purpose |
|-------|-----|---------|---------|
| FEATURE_ID | $1 | (req) | Feature identifier |
| --afk | flag | false | Non-interactive mode w/ context-aware defaults |
| RP1_ROOT | env | `.rp1/` | Root directory |

<feature_id>$1</feature_id>
<afk_mode>$2</afk_mode>
<rp1_root>{{RP1_ROOT}}</rp1_root>

## §0 Validation

1. FEATURE_ID: Required. Error if empty.
2. --afk: Set `afk_mode=true` if present in args.
3. RP1_ROOT: Use env value or `.rp1/`

**Feature dir**: `{RP1_ROOT}/work/features/{FEATURE_ID}/` - create if missing.

## §1 Workflow Steps

| Step | Command | Artifact | Skip When |
|------|---------|----------|-----------|
| 1 | /feature-requirements | requirements.md | Has `## 5. Functional Requirements` |
| 2 | /feature-design | design.md | Has `## 2. Architecture` |
| 3 | /feature-build | tasks.md | All tasks `[x]`, no `[ ]` |
| 4 | /feature-verify | verify report | `Overall Status: VERIFIED` AND `Ready for Merge: YES` |
| 5 | /feature-archive | archived/ | Never auto-skip |

## §2 Artifact Detection

Check artifacts in order. Stop at first failing check to determine `start_step`.

### Detection Checks

| Check | File | Validation | Result if Fails |
|-------|------|------------|-----------------|
| 1 | `requirements.md` | Contains `## 5. Functional Requirements` (exact, case-sensitive) | start_step=1 |
| 2 | `design.md` | Contains `## 2. Architecture` (exact) | start_step=2 |
| 3 | `tasks.md` OR `milestone-*.md` | No `- [ ]` patterns (all `- [x]`/`- [X]`) | start_step=3 |
| 4 | `feature_verify_report*.md` | Most recent has `Overall Status: VERIFIED` AND `Ready for Merge: YES` | start_step=4 |

### Detection Output

```
## Artifact Detection Results

**Feature Directory**: {feature_dir}

| Artifact | Status | Details |
|----------|--------|---------|
| requirements.md | {FOUND/MISSING} | {section status} |
| design.md | {FOUND/MISSING} | {section status} |
| tasks.md | {FOUND/MISSING} | {N}/{M} tasks complete |
| verify report | {FOUND/MISSING} | {status} |

**Start Step**: {N} - {name}
**Skipping**: Steps 1-{N-1} (artifacts exist)
```

## §3 Progress Reporting

### Status States

| State | Symbol | When |
|-------|--------|------|
| PENDING | `[ ]` | After current step |
| RUNNING | `[~]` | Active step |
| COMPLETED | `[x]` | Success |
| SKIPPED | `[-]` | Existing artifact |
| FAILED | `[!]` | Error |
| RETRYING | `[R]` | --afk retry |
| DECLINED | `[D]` | User declined archive |

### Display Format

```
## Workflow Progress

Step 1: Requirements   [{status}] {reason}
Step 2: Design         [{status}] {reason}
Step 3: Build          [{status}] {reason}
Step 4: Verify         [{status}] {reason}
Step 5: Archive        [{status}] {reason}

Current: Step {N} of 5
```

**Rules**:

- Display after artifact detection, update after each transition
- Include reason for SKIPPED/FAILED only
- Final shows all 5 steps w/ final states + `Result: {completed}/5 completed, {skipped} skipped`

## §4 Command Execution

Execute sequentially from `start_step`. Each step MUST complete before next.

```
afk_flag = "--afk" if afk_mode else ""
```

### Step Commands

| Step | Condition | Command |
|------|-----------|---------|
| 1 | start_step <= 1 | `/rp1-dev:feature-requirements {feature_id} {afk_flag}` |
| 2 | start_step <= 2 | `/rp1-dev:feature-design {feature_id} {afk_flag}` |
| 3 | start_step <= 3 | `/rp1-dev:feature-build {feature_id} {afk_flag}` |
| 4 | start_step <= 4 | `/rp1-dev:feature-verify {feature_id} {afk_flag}` |
| 5 | Always if reached | `/rp1-dev:feature-archive {feature_id} {afk_flag}` |

**CRITICAL**: Wait for command completion before proceeding.

### Step 5: Archive Gate

**Interactive mode** (`afk_mode=false`): Use AskUserQuestion Tool:

1. Prompt: `Feature complete. Archive to work/archives/? [y/n]`
2. Accept: y/yes/Y/YES/Yes -> archive
3. Decline: n/no/N/NO/No -> set `[D] DECLINED`, workflow SUCCESS
4. Other: re-prompt

**--afk mode**: Auto-archive, no prompt.

## §5 Retry (--afk only)

**Rules**:

- MAX_RETRIES=1 (2 total attempts)
- Fresh agent context on retry
- Interactive mode: user handles failures directly

### Failure Detection

Step FAILED when:

- SlashCommand returns error
- Output contains "FAILED", "Error:", exception
- Expected artifact not created
- Timeout/crash

### Retry Flow

```
if failure AND afk_mode AND attempts < MAX_RETRIES:
  log_failure()
  retry_attempts[step]++
  re-invoke same command (fresh context)
  if retry succeeds: [x] COMPLETED (retry succeeded)
  if retry fails: abort w/ error summary
else if failure AND afk_mode:
  abort w/ error summary
else:
  interactive handling (§6.2)
```

### Failure Log Format

```
## Step Failure Detected

**Step**: {N} - {name}
**Attempt**: {X}/2
**Timestamp**: {ts}
**Error**: {msg}

**Action**: Retrying with fresh context...
```

### Retry Exhausted Format

```
## Retry Exhausted

**Step**: {N} - {name}
**Attempts**: 2/2 (all attempts failed)
**First Error**: {first_msg}
**Final Error**: {final_msg}

**Action**: Aborting workflow
```

## §6 Error Handling

### Required Components

All error messages MUST include: Step Context, Failure Reason, Error Source, Artifacts Status, Recovery Path.

### Interactive Mode

On failure (`afk_mode=false`):

1. Display error w/ step context, artifacts status
2. Prompt: `How would you like to proceed? [retry/skip/abort]`
3. Handle:
   - retry: re-execute step
   - skip: warn about dependency issues, continue
   - abort: output summary, preserve state

### Error Summary Format

```
## Build Failed

**Feature**: {FEATURE_ID}
**Feature Directory**: {RP1_ROOT}/work/features/{FEATURE_ID}/
**Mode**: {afk (non-interactive)|interactive}

---

### Failed Step Details

| Property | Value |
|----------|-------|
| Step Number | {N} |
| Step Name | {name} |
| Command | /rp1-dev:feature-{step} {feature_id} |
| Attempts | {X}/{max} |

### Error Information

**Primary Error**:
{detailed_error}

**Error Category**: {timeout|test_failure|lint_error|missing_dependency|agent_error|unknown}

**Error Location** (if identifiable):
- File: {path}
- Line: {N}
- Context: {surrounding}

### Attempt History (--afk)

| Attempt | Timestamp | Error Summary |
|---------|-----------|---------------|
| 1 (initial) | {ts} | {summary} |
| 2 (retry) | {ts} | {summary} |

### Step Status Summary

| Step | Status | Details |
|------|--------|---------|
| 1: Requirements | {status} | {reason} |
| 2: Design | {status} | {reason} |
| 3: Build | {status} | {reason} |
| 4: Verify | {status} | {reason} |
| 5: Archive | {status} | {reason} |

### Artifacts Preserved

| Step | Artifact | Path | Status |
|------|----------|------|--------|
| 1 | requirements.md | {path} | {COMPLETE/SKIPPED/N/A} |
| 2 | design.md | {path} | {COMPLETE/SKIPPED/N/A} |
| 3 | tasks.md | {path} | {COMPLETE/PARTIAL/N/A} |
| 4 | verify report | {path} | {COMPLETE/N/A} |

### Recovery Options

1. Resume: `/build {FEATURE_ID}` - auto-resumes from failed step
2. Interactive debug: `/build {FEATURE_ID}` (w/o --afk)
3. Direct retry: `/rp1-dev:feature-{step} {FEATURE_ID}`
4. Manual: inspect `{RP1_ROOT}/work/features/{FEATURE_ID}/`
```

### Artifact Preservation Rules

**CRITICAL**: On failure:

1. NEVER delete completed step artifacts
2. NEVER rollback successful steps
3. NEVER clean up feature directory
4. KEEP partial artifacts from failed step
5. LOG all preserved files

## §7 Final Summary

After workflow ends:

```
## Workflow Progress - {COMPLETE|FAILED}

Step 1: Requirements   [{status}] {reason}
Step 2: Design         [{status}] {reason}
Step 3: Build          [{status}] {reason}
Step 4: Verify         [{status}] {reason}
Step 5: Archive        [{status}] {reason}

Result: {N}/5 steps completed, {M} skipped

---

## Build Summary

**Feature**: {FEATURE_ID}
**Mode**: {interactive|afk}
**Outcome**: {SUCCESS|FAILED|PARTIAL}

### Next Steps
{context-appropriate message}
```

## §8 Anti-Loop

**CRITICAL**: Single pass execution. Do NOT:

- Ask clarification (except archive confirmation in interactive)
- Wait for feedback between steps
- Re-execute completed steps
- Loop back

On blocking error: Report, preserve, exit.

## §9 Execution Flow

1. Validate params (§0)
2. Detect artifacts (§2) -> determine start_step
3. Display initial progress (§3)
4. Execute steps (§4) from start_step:
   - On failure + --afk: retry mechanism (§5)
   - On failure + interactive: user handling (§6)
5. If retry exhausted: error summary (§6), abort
6. Display final summary (§7)
