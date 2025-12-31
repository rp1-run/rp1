---
name: build
version: 2.0.0
description: End-to-end feature workflow (requirements -> design -> tasks -> build -> verify -> archive) in a single command.
argument-hint: "feature-id [--afk] [--no-worktree] [--push] [--create-pr]"
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
| 1 | Requirements | Inline logic |
| 2 | Design | hypothesis-tester (opt), feature-tasker |
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

**Role**: Requirements Gatherer - transforms high-level reqs into detailed specs.

**Constraint**: WHAT not HOW. No tech impl, arch, or code. Focus on business needs.

### §1.1 KB Loading

Read via Read tool:

1. `{RP1_ROOT}/context/index.md` - project structure, domain
2. `{RP1_ROOT}/context/concept_map.md` - domain terminology

If KB missing: warn, continue w/ best-effort.

### §1.2 PRD Detection

Check for project ctx:

1. Charter: `{RP1_ROOT}/context/charter.md`
2. PRDs: `{RP1_ROOT}/work/prds/*.md`

| Mode | PRD Action |
|------|------------|
| Interactive | If multiple PRDs: prompt selection. If single: confirm association. |
| AFK | Auto-match FEATURE_ID against PRD filenames/titles. Use most recent if multiple. Log choice. |

If PRD selected:

- Read PRD + charter for scope ctx
- Add `**Parent PRD**: [name](../../prds/name.md)` to output

No charter/PRD: display tip, continue (non-blocking).

### §1.3 Ambiguity Resolution

**Detect**:

- Vague terms: "fast", "secure", "user-friendly", "scalable"
- Missing actors: "the system should..." (which users?)
- Undefined scope: "etc.", "various features"
- Conflicting requirements

**Question Framework**:

| Category | Focus |
|----------|-------|
| WHO | User types, actors, permissions, stakeholders |
| WHAT | Specific actions, data reqs, success criteria |
| CONSTRAINTS | Performance, compliance, business rules |
| SCOPE | Included/excluded, MVP def, dependencies |

**Resolution**:

| Mode | Action |
|------|--------|
| Interactive | AskUserQuestion for clarification |
| AFK | Infer from KB ctx, PRD constraints, EXTRA_CONTEXT. Apply conservative defaults. Log all inferences. |

### §1.4 Requirements Structure

Each requirement MUST include:

| Element | Description |
|---------|-------------|
| Actor | WHO needs this |
| Action | WHAT they need to do |
| Outcome | HOW success is defined (measurable) |
| Rationale | WHY needed (business perspective) |
| Acceptance | Testable conditions |
| Priority | Must/Should/Could/Won't Have |

**Exclude**: Tech impl, arch decisions, tech choices, DB schemas, API designs, code examples.

### §1.5 Output Template

Write to `{RP1_ROOT}/work/features/{FEATURE_ID}/requirements.md`:

```markdown
# Requirements Specification: [Feature Title]

**Feature ID**: [FEATURE_ID]
**Parent PRD**: [PRD Name](../../prds/prd-name.md) _(if associated)_
**Version**: 1.0.0
**Status**: Draft
**Created**: [Date]

## 1. Feature Overview
[One paragraph - business perspective]

## 2. Business Context
### 2.1 Problem Statement
### 2.2 Business Value
### 2.3 Success Metrics

## 3. Stakeholders & Users
### 3.1 User Types
### 3.2 Stakeholder Interests

## 4. Scope Definition
### 4.1 In Scope
### 4.2 Out of Scope
### 4.3 Assumptions

## 5. Functional Requirements
[REQ-ID format w/ priority, user type, requirement, rationale, acceptance criteria]

## 6. Non-Functional Requirements
### 6.1 Performance Expectations
### 6.2 Security Requirements
### 6.3 Usability Requirements
### 6.4 Compliance Requirements

## 7. User Stories
[STORY-ID format w/ As a/I want/So that + GIVEN/WHEN/THEN]

## 8. Business Rules

## 9. Dependencies & Constraints

## 10. Clarifications Log
```

**AFK Mode Output**: Include at end:

- `## AFK Mode: Auto-Selected Defaults` - PRD association choices
- `## AFK Mode: Inferred Decisions` - ambiguity resolutions table

### §1.6 Completion

On success:

```
Requirements completed: {RP1_ROOT}/work/features/{FEATURE_ID}/requirements.md
```

Update progress -> Step 1 COMPLETED, proceed to Step 2.

## §STEP-2: Design

**Skip if**: `design.md` contains `## 2. Architecture`

**Role**: TechDesigner - transforms requirements -> technical design. HOW to implement via architecture, tech choices, APIs, data models.

**Constraint**: Follow existing patterns. Only introduce new if user explicitly requests.

### §2.1 KB Loading

Read via Read tool:

1. `{RP1_ROOT}/context/index.md` - project structure, domain
2. `{RP1_ROOT}/context/patterns.md` - tech patterns, naming, impl patterns
3. `{RP1_ROOT}/context/architecture.md` - arch patterns, layers, integration

If KB missing: warn, continue w/ codebase analysis fallback.

### §2.2 Mode Detection

**UPDATE_MODE**: Check if `{RP1_ROOT}/work/features/{FEATURE_ID}/design.md` exists:

- Exists: `UPDATE_MODE = true` (design iteration)
- Not exists: `UPDATE_MODE = false` (fresh design)

### §2.3 Analysis

Before output, perform analysis in `<design_thinking>` tags:

| Step | Analysis |
|------|----------|
| 1 | Extract functional/non-functional reqs systematically |
| 2 | CRITICAL - analyze codebase patterns: arch, data access, API, frontend, testing |
| 3 | Per requirement: specified vs needs decision. List gaps, prioritize alignment w/ existing stack |
| 4 | Step-by-step high-level approach following existing patterns |
| 5 | All integration points w/ systems, APIs, data sources |
| 6 | Technical/business/resource constraints, emphasize pattern consistency |
| 7 | Technical risks + mitigation strategies |
| 8 | Assumption analysis (see §2.4) |

### §2.4 Assumption Analysis

Identify assumptions that could invalidate design:

- External API capabilities/limitations
- System performance characteristics
- Third-party library behaviors
- Existing patterns not yet verified

For each, assess:

- **Impact if wrong**: HIGH (invalidates design) / MEDIUM (requires changes) / LOW (minor adjustments)
- **Confidence**: HIGH (well-documented) / MEDIUM (some evidence) / LOW (uncertain)

Flag for hypothesis validation: HIGH impact + LOW/MEDIUM confidence.

### §2.5 Technology Selection

When requirements don't specify tech choices:

**Categories**: Language/Framework | Data Storage | Integration Patterns | Infrastructure

| Mode | Action |
|------|--------|
| Interactive | AskUserQuestion for preferences between options |
| AFK | Auto-select from KB patterns.md, existing codebase patterns, conservative defaults |

**AFK Auto-Selection Priority**:

| Decision Type | Primary Source | Fallback |
|---------------|----------------|----------|
| Technology | KB patterns.md | Most common in codebase |
| Architecture | KB architecture.md | Existing codebase arch |
| Design | PRD constraints | Conservative defaults |
| Test approach | Existing test patterns | Standard unit coverage |

**AFK Logging**: Record all auto-selected decisions in design-decisions.md:

```markdown
## AFK Mode: Auto-Selected Technology Decisions

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| {decision} | {choice} | {KB/codebase/default} | {why} |
```

### §2.6 Output: design.md

Write to `{RP1_ROOT}/work/features/{FEATURE_ID}/design.md`:

| # | Section | Diagram (if valuable) |
|---|---------|----------------------|
| 1 | Design Overview | High-Level Architecture (graph TB/LR) |
| 2 | Architecture | Component/Sequence diagrams as needed |
| 3 | Detailed Design | Data Model if data changes |
| 4 | Technology Stack | - |
| 5 | Implementation Plan | - |
| 6 | Testing Strategy | w/ Test Value Assessment |
| 7 | Deployment Design | - |
| 8 | Documentation Impact | See format below |
| 9 | Design Decisions Log | - |

**Diagram Selection**:

- Simple (single component): Architecture only
- API/integration: Architecture + Sequence
- Data-heavy: Architecture + Data Model
- Complex multi-system: 3-4 as needed

**Test Value Assessment**:

| Valuable (design for) | Avoid (do NOT design for) |
|-----------------------|--------------------------|
| Business logic | Library behavior verification |
| Component integration | Framework feature validation |
| App-specific error handling | Language primitive testing |
| API contract verification | Third-party API behavior |
| App-unique data transforms | - |

Each test MUST trace to app requirement, not library feature.

**Documentation Impact Format**:

```markdown
## Documentation Impact

| Type | Target | Section | KB Source | Rationale |
|------|--------|---------|-----------|-----------|
| add/edit/remove | path/file.md | section | {kb_file}:{anchor} | reason |
```

### §2.7 Output: design-decisions.md

Log of all major technology/architecture decisions w/ rationales.

Write to `{RP1_ROOT}/work/features/{FEATURE_ID}/design-decisions.md`.

### §2.8 Scope Changes (Addendum)

When user requests scope changes during session:

1. **Scope Check**:
   - In scope: Enhancements/clarifications logically belonging to feature
   - Out of scope: Redirect to separate feature

2. Append to requirements.md:

```markdown
## Addendum

### ADD-001: [Title] (added during design)
- **Source**: Design session feedback
- **Change**: [Description]
- **Rationale**: [Why needed]
```

### §2.9 Hypothesis Testing (Optional)

**IMPORTANT**: Validate hypotheses BEFORE task generation. If hypotheses fail, design changes → tasks would be invalid.

If §2.4 flagged HIGH-impact + LOW/MEDIUM-confidence assumptions:

**Step 1**: Create `{RP1_ROOT}/work/features/{FEATURE_ID}/hypotheses.md`:

```markdown
# Hypothesis Document: {FEATURE_ID}

**Version**: 1.0.0 | **Created**: {timestamp} | **Status**: PENDING

## Hypotheses

### HYP-001: {Title}
**Risk Level**: HIGH | **Status**: PENDING

**Statement**: {assumption}
**Context**: {why matters}

**Validation Criteria**:
- CONFIRM: {evidence}
- REJECT: {evidence}

**Method**: CODE_EXPERIMENT | CODEBASE_ANALYSIS | EXTERNAL_RESEARCH
```

**Step 2**: Spawn hypothesis-tester:

```
Task tool invocation:
  subagent_type: rp1-dev:hypothesis-tester
  prompt: "Validate hypotheses for feature {FEATURE_ID}"
```

**Step 3**: After tester completes, incorporate findings into design. Update design.md and design-decisions.md if needed.

**Skip Hypothesis Validation When**:

- Assumptions well-documented in official sources
- Self-evident from existing code
- LOW impact if wrong
- HIGH confidence in all critical assumptions

### §2.10 Task Generation

After design finalized (and hypotheses validated if applicable), spawn feature-tasker:

```
Task tool invocation:
  subagent_type: rp1-dev:feature-tasker
  prompt: |
    FEATURE_ID: {FEATURE_ID}
    UPDATE_MODE: {true if design.md existed, false otherwise}
    RP1_ROOT: {rp1 root directory}
```

Wait for completion. Tasker reads validated design, generates tasks, writes to feature dir.

### §2.11 Completion

On success:

```
Design completed: {RP1_ROOT}/work/features/{FEATURE_ID}/
- design.md
- design-decisions.md
- tasks.md (generated by feature-tasker)
```

**AFK Mode**: Add summary of auto-selected decisions.

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

#### §4.1.1 Preserve CWD

```bash
original_cwd=$(pwd)
```

Store for restoration in §4.5.

#### §4.1.2 Create Worktree

```bash
rp1 agent-tools worktree create {FEATURE_ID} --prefix feature
```

Parse JSON response:

| Field | Store As | Purpose |
|-------|----------|---------|
| `path` | `worktree_path` | Abs path to worktree |
| `branch` | `branch` | Branch name (feature/...) |
| `basedOn` | `basedOn` | Base commit for diff scope |

**On failure**: STOP, report error, do not proceed.

#### §4.1.3 Enter Worktree

```bash
cd {worktree_path}
```

#### §4.1.4 Verify State

| Check | Command | Expected |
|-------|---------|----------|
| History | `git log --oneline -3` | Normal commits |
| Base commit | Verify `basedOn` in history | Should be HEAD or recent |
| Branch | `git branch --show-current` | Matches `branch` value |

**On failure**:

1. STOP
2. Report: which check failed, expected vs actual
3. Cleanup: `cd {original_cwd} && rp1 agent-tools worktree cleanup {worktree_path}`
4. Exit w/ error

#### §4.1.5 Install Dependencies

Check lockfiles (more specific) then manifests:

| File | Command |
|------|---------|
| `bun.lockb` | `bun install` |
| `package-lock.json` | `npm ci` |
| `yarn.lock` | `yarn install --frozen-lockfile` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `Cargo.lock` | `cargo build --locked` |
| `package.json` (no lock) | `npm install` |
| `Cargo.toml` (no lock) | `cargo build` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `pyproject.toml` | `pip install -e .` |
| `go.mod` | `go mod download` |
| `Gemfile` | `bundle install` |

**No files**: Skip install.
**Failure**: STOP, cleanup worktree, report error.

#### §4.1.6 Variables Set

After setup:

| Variable | Value |
|----------|-------|
| `original_cwd` | Dir to restore after cleanup |
| `worktree_path` | Abs path to worktree |
| `branch` | Branch name for push/PR |
| `basedOn` | Base commit for validation |
| `use_worktree` | true (false if `--no-worktree`) |

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

**If any tasks blocked**: Skip push/PR, proceed to §4.5.6.

Report: "Build incomplete (blocked tasks). Branch not pushed."

Set `should_push = false`, `should_pr = false`.

#### §4.5.2 Commit Ownership Validation

```bash
git log {basedOn}..HEAD --oneline --format="%h %an <%ae> %s"
```

**Validate**:

- Commit count > 0
- All commits descend from `basedOn`
- No unexpected authors

**On failure**:

1. STOP push
2. Preserve worktree (do NOT cleanup)
3. Report anomaly
4. Proceed to §4.5.6 (restore only)

#### §4.5.3 Push Branch

**Execute if**: (`--push` OR `--create-pr`) AND validation passed AND no blocked tasks

```bash
git push -u origin {branch}
```

**Retry**: 3 attempts w/ backoff (10s, 20s, 30s)

```
attempt = 1, max = 3, delays = [10, 20, 30]
while attempt <= max:
  result = git push -u origin {branch}
  if success: break
  if attempt < max:
    sleep(delays[attempt-1])
    attempt++
  else:
    push_failed = true
```

**On failure**: Report w/ recovery guidance:

- "Authentication failed" -> `gh auth login` or SSH key
- "Network error" -> check connectivity
- Other -> `git push -u origin {branch}` to retry

#### §4.5.4 Create PR

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
- Verification completed as part of build workflow (Step 5)

---
Generated by https://rp1.run (feature-build)
EOF
)"
```

**Error handling**:

- "PR already exists" -> Report URL, treat as success
- Other failures -> Warn only (branch pushed)

PR failure is NON-BLOCKING.

#### §4.5.5 Dirty State Check

```bash
git status --porcelain
```

**If dirty** (output not empty):

| Mode | Action |
|------|--------|
| AFK | Auto-commit w/ "chore: uncommitted changes from feature build". Log decision. |
| Interactive | AskUserQuestion: Commit / Discard / Abort cleanup |

**If clean**: Proceed to cleanup.

#### §4.5.6 Restore Directory

```bash
cd {original_cwd}
```

**CRITICAL**: Must restore before cleanup.

#### §4.5.7 Cleanup Worktree

**Skip if**: Validation failed in §4.5.2 (preserve for investigation)

```bash
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

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
    Run code quality checks for feature {FEATURE_ID}.
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

    Verify acceptance criteria and requirement coverage.
```

**Output**: `feature_verify_report_N.md`
**Validates**: AC mapping, req coverage, test-to-req traceability
**Returns**: JSON w/ `manual_items` array

#### Phase 3: Comment Check

```
Task tool invocation:
  subagent_type: rp1-dev:comment-cleaner
  prompt: |
    SCOPE: branch
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

## §STEP-6: Archive

**Skip if**: Never auto-skip. Always prompt (interactive) or auto-archive (AFK).

**Purpose**: Move completed feature to `{RP1_ROOT}/work/archives/features/`. Final workflow step.

### §6.1 Archive Decision

| Mode | Behavior |
|------|----------|
| AFK | Auto-archive without prompt, log decision |
| Interactive | Prompt user for confirmation |

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

AskUserQuestion:

```yaml
questions:
  - question: "Feature '{FEATURE_ID}' has minimal documentation. Archive anyway?"
    header: "Confirm Archive"
    options:
      - label: "Yes - Archive"
        description: "Proceed with archiving"
      - label: "No - Cancel"
        description: "Abort archive"
    multiSelect: false
```

**Yes**: Re-invoke w/ `SKIP_DOC_CHECK: true`
**No**: Mark Step 6 as DECLINED, output `Archive aborted by user`

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
