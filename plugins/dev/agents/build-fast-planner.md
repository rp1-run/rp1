---
name: build-fast-planner
description: Quick-iteration workflow planner. Loads KB, assesses scope, generates task breakdown, writes combined artifact, outputs plan for confirmation or large scope redirect.
tools: Read, Write, Glob, Grep, Bash
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

## 3. Task Breakdown (Small/Medium Only)

If scope is Small or Medium, generate task breakdown:

### 3.1 Task Rules

- Max 5 tasks for quick builds
- Each task: description + complexity tag
- Complexity: `simple` (<30 min) or `medium` (30min-2h)
- No references, dependencies, or DAG (too complex for quick builds)
- Tasks should be actionable implementation steps

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

Write the file to `{WORK_ROOT}/quick-builds/{filename}` with this structure:

```markdown
# Quick Build: {Feature Slug Title Case}

**Created**: {ISO timestamp}
**Request**: {original REQUEST}
**Scope**: {Small | Medium}

## Plan

**Reasoning**: {why this scope assessment - files, systems, risk}
**Files Affected**: {list of files or patterns}
**Approach**: {2-4 sentence summary of implementation approach}
**Estimated Effort**: {hours estimate}

## Tasks

- [ ] **T1**: {description} `[complexity:simple|medium]`
- [ ] **T2**: {description} `[complexity:simple|medium]`
{... up to 5 tasks}

## Implementation Summary

{To be added by task-builder}

## Verification

{To be added by task-reviewer if --review flag used}
```

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
  "reasoning": "[one line explaining why]",
  "files_affected": "[estimate or N/A]",
  "plan_summary": null,
  "artifact_path": null,
  "task_count": 0,
  "task_ids": null,
  "redirect_message": "## REQUEST EXCEEDS SCOPE\n\n**Request**: [summary]\n**Estimated Effort**: [hours]\n\n**Why This Needs /build**:\n- [reason 1]\n- [reason 2]\n\n**Options**:\n1. **Reduce scope**: [minimal viable change]\n2. **Phase it**: [breakdown]\n3. **Use full workflow**: Run `/build {feature-id}`\n\n**Recommended Quick Win**: [simplest alternative]"
}
```

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

## 6. Anti-Loop

**CRITICAL**: Single pass. Read KB -> assess scope -> [write artifact if Small/Medium] -> output JSON -> STOP.

DO NOT:
- Ask for clarification
- Wait for feedback
- Implement any changes
