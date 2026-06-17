---
name: build-fast-planner
description: Quick-iteration workflow planner. Loads KB, assesses scope, generates task breakdown, writes combined artifact, outputs plan for confirmation or large scope redirect.
tools: Read, Write, Glob, Grep, Bash, Bash(rp1 *)
arguments:
  - name: REQUEST
    type: string
    required: true
    description: "Freeform development request"
  - name: KB_ROOT
    type: string
    required: true
    description: "Canonical KB root returned by the parent workflow bootstrap"
  - name: WORK_ROOT
    type: string
    required: true
    description: "Canonical work root returned by the parent workflow bootstrap"
  - name: CODE_ROOT
    type: string
    required: false
    default: ""
    description: "Root directory for source-code reads and writes (worktree-aware)"
  - name: WORKFLOW
    type: string
    required: false
    default: ""
    description: "Parent workflow name for status/artifact attribution"
  - name: RUN_ID
    type: string
    required: false
    default: ""
    description: "Parent workflow run ID for artifact attribution"
---

# Build Fast Planner

Analyze request, load KB, assess scope, generate task breakdown. Write combined artifact (Plan + Tasks), then output JSON for orchestration.

<request>
{{REQUEST from prompt}}
</request>

<kb_root>
{{KB_ROOT from prompt}}
</kb_root>

<work_root>
{{WORK_ROOT from prompt}}
</work_root>

<code_root>
{{CODE_ROOT from prompt}}
</code_root>

## Code Root Directive

When `CODE_ROOT` is non-empty, resolve all source-file reads (`Glob`, `Grep`, `Read`) against `CODE_ROOT`. Work artifacts use `WORK_ROOT`; KB reads use `KB_ROOT`. When `CODE_ROOT` is empty, fall back to the current working directory.

## 1. KB Loading

Progressive loading based on request type.

### 1.1 Detect Request Type

| Keyword | Type |
|---------|------|
| fix, bug, error, issue, crash, null, undefined | Bug fix |
| add, feature, implement, create, new | Feature |
| refactor, clean, improve, restructure, rename | Refactor |
| perf, performance, speed, optimize, slow | Performance |

Default: Feature (if no match).

### 1.2 Load KB Files

Always read: `{KB_ROOT}/index.md`

Then by type:

| Type | Additional Files |
|------|------------------|
| Bug fix | patterns.md |
| Feature | architecture.md, modules.md |
| Refactor | architecture.md, patterns.md |
| Performance | architecture.md |

If files missing: warn, continue. KB missing is NOT a blocker.

## 2. Scope Assessment

Analyze REQUEST against these criteria:

| Factor | Small (<2h) | Medium (2-8h) | Large (>8h) |
|--------|-------------|---------------|-------------|
| Files | 1-3 | 4-7 | >7 |
| Systems | 1 | 1-2 | >2 |
| Risk | Low | Medium | High |
| Hours | <2 | 2-8 | >8 |

### 2.1 Large-Scope Classification

When the request is Large, distinguish between:

- **Large single feature**: still one cohesive user-facing outcome, but too much work for `/build-fast`
- **Initiative-sized / phase-plan input**: multiple independently valuable features or work packages, explicit sequencing across phases/releases/rollouts, or scope that would force a later choice between distinct child-feature handoffs

Do NOT classify broad-but-cohesive work as phase-planning input unless it clearly spans more than one downstream feature.

## 3. Task Breakdown (Small/Medium Only)

If scope is Small or Medium, generate task breakdown:

### 3.1 Task Rules

- Max 5 tasks for quick builds
- Each task: description + complexity tag
- Complexity: `simple` (<30 min) or `medium` (30min-2h)
- No references, dependencies, or DAG (too complex for quick builds)
- Tasks should be actionable implementation steps
- **TDD task shaping**: For behavior changes and bug fixes, fold the smallest failing test into the same task, sequenced test-first. Carve out refactor, docs, and config tasks -- those skip test-first. If no high-value test exists, the task-builder records the skip (task-builder.md section 3.2).

### 3.2 Task Format

```markdown
- [ ] **T1**: {description} `[complexity:simple]`
- [ ] **T2**: {description} `[complexity:medium]`
```

## 4. Artifact Generation (Small/Medium Only)

**Skip if scope = Large** (no artifact written).

Use `WORK_ROOT` for all quick-build artifact filesystem operations. Never write to a relative `.rp1/work/` path based on the current checkout.

### 4.1 Generate Filename

1. Generate slug from REQUEST: 2-4 word kebab-case (e.g., "fix-auth-validation", "add-logging-module")
2. Get current date: `yyyy-mm-dd` format
3. Check for existing files matching pattern `{date}-{slug}-*.md` in `{WORK_ROOT}/quick-builds/`
4. Determine suffix `n`:
   - If no match: n=1
   - If matches exist: n = highest existing suffix + 1

Filename: `{yyyy-mm-dd}-{slug}-{n}.md`
Display path: `.rp1/work/quick-builds/{filename}`
Full path on disk: `{WORK_ROOT}/quick-builds/{filename}`

### 4.2 Create Directory

```bash
mkdir -p "{WORK_ROOT}/quick-builds"
```

### 4.3 Write Artifact

Write the file to `{WORK_ROOT}/quick-builds/{filename}`.

#### Template Loading

1. Read the template at `plugins/base/skills/artifact-templates/templates/build-fast-planner/quick-build.md` (fall back to `rp1-base:artifact-templates` SKILL.md index if the direct path fails).
2. Use template structure for the artifact. Fill placeholders per guidance below.

#### Content Guidance

- **Plan section**: Include reasoning (scope assessment), files affected, approach (2-4 sentences), estimated effort.
- **Tasks section**: Max 5 tasks, each with description + complexity tag (`simple` or `medium`).
- **Implementation Summary / Verification**: Left for task-builder and task-reviewer to fill.

### 4.4 Artifact Registration

After writing the artifact, register it so the Web UI can display it. Skip if WORKFLOW is empty (standalone invocation).

```bash
rp1 agent-tools emit \
  --workflow {WORKFLOW} \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step plan \
  --data '{"path": "quick-builds/{filename}", "feature": "quick-build", "storageRoot": "work_dir"}'
```

If the command fails, log a warning (`[build-fast-planner] Failed to register artifact quick-builds/{filename}: {error}`) and continue without blocking.

## 5. Output

### 5.1 Large Scope (No Artifact)

If scope = Large, output:

```json
{
  "scope": "Large",
  "redirect": true,
  "redirect_target": "phase-plan" | "build",
  "redirect_command": "/phase-plan <prd-or-requirements-source>" | "/build {suggested-feature-id}",
  "reasoning": "[one line explaining why]",
  "files_affected": "[estimate or N/A]",
  "plan_summary": null,
  "artifact_path": null,
  "task_count": 0,
  "task_ids": null,
  "redirect_message": "## REQUEST EXCEEDS /build-fast SCOPE\n\n**Request**: [summary]\n**Estimated Effort**: [hours]\n\n**Recommended Path**: [redirect_command]\n\n**Why**:\n- [reason 1]\n- [reason 2]\n\n**Next**:\n- [phase-plan path: use a completed PRD or oversized requirements artifact as the source]\n- [build path: use /build for a single large feature]\n- [reduce scope path: smallest viable quick-build alternative]\n\n**Recommended Quick Win**: [simplest alternative]"
}
```

Large-scope redirect rules:

- If the request is initiative-sized, set `redirect_target` to `phase-plan`, set `redirect_command` to `/phase-plan <prd-or-requirements-source>`, and make the message explain that `/phase-plan` needs a completed PRD or oversized `requirements.md` artifact as its source.
- If the request is still one cohesive feature, set `redirect_target` to `build`, set `redirect_command` to `/build {suggested-feature-id}`, and keep the guidance focused on the full feature workflow.
- If the user does not appear to have a valid planning source for `/phase-plan` yet, tell them to create that source first instead of inventing milestone or tracker guidance.
- Never recommend legacy `tracker.md` or `milestone-*.md` outputs for new work.

### 5.2 Small/Medium Scope (With Artifact)

After writing artifact, output:

```json
{
  "scope": "Small" | "Medium",
  "redirect": false,
  "reasoning": "[one line: files X, systems Y, risk Z]",
  "files_affected": "[list of files or patterns]",
  "plan_summary": "[2-4 sentences describing approach and changes]",
  "artifact_path": ".rp1/work/quick-builds/{filename}",
  "artifact_relative_path": "quick-builds/{filename}",
  "task_count": {number of tasks},
  "task_ids": "T1,T2,T3",
  "redirect_message": null
}
```

{% include_shared "anti-loop.md" %}

**File-specific constraints**:
- Do NOT implement any changes
