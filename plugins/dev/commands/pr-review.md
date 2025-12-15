---
name: pr-review
version: 3.0.0
description: Intent-aware map-reduce PR review with confidence gating and holistic synthesis
argument-hint: "[target] [base-branch] [skip-visual]"
tags:
  - review
  - pr
  - security
  - analysis
  - map-reduce
created: 2025-10-25
updated: 2025-11-29
author: cloud-on-prem/rp1
---

# PR Review Orchestrator - Map-Reduce Architecture

This command orchestrates an intent-aware, confidence-gated PR review using a map-reduce architecture with specialized subagents.

**CRITICAL**: This is an ORCHESTRATOR command, not a thin wrapper. It coordinates 4 phases of review across multiple subagents.

## Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| TARGET | $1 | (current branch) | PR number, URL, branch name, or empty |
| BASE_BRANCH | $2 | (from PR or 'main') | Base branch for diff comparison |
| SKIP_VISUAL | $3 | (none) | Set to `skip-visual` to disable visual generation |
| RP1_ROOT | Environment | `.rp1/` | Root directory for artifacts |

<target>
$1
</target>

<base_branch>
$2
</base_branch>

<skip_visual>
$3
</skip_visual>

<rp1_root>
{{RP1_ROOT}}
</rp1_root>

## Architecture Overview

```
Phase 0   (Sequential):  Input Resolution → Intent Model
Phase 0.5 (Background):  Visual Generation (conditional, parallel with Phase 1)
Phase 1   (Sequential):  Splitter → ReviewUnit[]
Phase 2   (Parallel):    N × Sub-Reviewers → Findings + Summaries
Phase 3   (Sequential):  Synthesizer → Cross-File Issues + Judgment
Phase 4   (Sequential):  Reporter → Markdown Report (includes visual link)
```

## Execution Instructions

**DO NOT ask for user approval. Execute immediately.**

### Phase 0: Input Resolution and Intent Building

1. **Resolve target to branch**:

   | Input Type | Detection | Resolution |
   |------------|-----------|------------|
   | Empty | No $1 | `git branch --show-current` |
   | PR Number | Numeric | `gh pr view {{target}} --json headRefName,baseRefName,title,body` |
   | PR URL | Contains `/pull/` | Extract number, fetch as above |
   | Branch Name | Non-numeric string | Use directly, check if PR exists |

2. **Attempt to fetch PR metadata**:
   ```bash
   gh pr view {{branch}} --json title,body,headRefName,baseRefName,url 2>/dev/null
   ```

3. **Build Intent Model based on result**:

   **If PR exists** (mode: `full`):
   - Extract `title` → `problem_statement`
   - Parse `body` → `expected_changes`, `acceptance_criteria`
   - Check for linked issues in body (GitHub issue URLs, Linear, Jira)
   - Fetch linked issues if found: `gh issue view {{issue_number}} --json title,body`
   - Build complete intent model

   **If NO PR exists**:
   - Use AskUserQuestion tool to nudge user:
     ```
     question: "No open PR found for this branch. What's the purpose of these changes?"
     options:
       - label: "Quick description"
         description: "I'll describe what this code does"
       - label: "Skip"
         description: "Just review the code without intent context"
     ```
   - If user provides description (mode: `user_provided`):
     - `problem_statement` = user's description
     - `expected_changes` = inferred from description
   - If user skips (mode: `branch_only`):
     - `problem_statement` = "Review changes on branch {{branch}}"
     - Note: Intent verification will be skipped

4. **Add commit context**:
   ```bash
   git log {{base}}..{{branch}} --oneline --no-decorate
   ```
   Store as `commit_summaries` in intent model.

5. **Determine base branch**:
   - From PR metadata if available
   - From $2 if provided
   - Default to 'main'

**Intent Model Structure**:
```json
{
  "mode": "full | user_provided | branch_only",
  "problem_statement": "...",
  "expected_changes": "...",
  "should_not_change": "...",
  "acceptance_criteria": ["..."],
  "commit_summaries": ["..."]
}
```

### Phase 0.5: Visual Generation (Conditional)

Before splitting, assess if PR warrants visualization. Visual runs in background while review continues.

1. **Get diff stats**:
   ```bash
   git diff --stat {{base}}..{{branch}}
   git diff --numstat {{base}}..{{branch}}
   ```

2. **Smart Detection Algorithm**:
   ```
   VISUAL_WARRANTED = false

   IF file_count > 5 THEN VISUAL_WARRANTED = true
   IF any file has > 200 lines changed THEN VISUAL_WARRANTED = true
   IF multiple directories affected THEN VISUAL_WARRANTED = true
   IF architectural files changed (*.config, schema.*, migrations/*) THEN VISUAL_WARRANTED = true
   ```

3. **Skip Conditions** (force no visual):
   - `$3 == "skip-visual"` positional argument provided
   - Trivial PR: `file_count <= 3` AND all files in same directory AND `< 100 total lines`

4. **If visualization warranted**:
   ```
   Use Task tool with:
   subagent_type: rp1-dev:pr-visualizer
   run_in_background: true
   prompt: "Generate PR visualization.
     PR_BRANCH: {{pr_branch}}
     BASE_BRANCH: {{base_branch}}
     REVIEW_DEPTH: quick"
   ```
   Store task reference as `VISUAL_TASK_ID` for retrieval in Phase 4.

5. **Continue immediately** to Phase 1 (don't wait for visual).

### Phase 1: Splitting (Sequential)

1. **Spawn splitter agent**:
   ```
   Use Task tool with:
   subagent_type: rp1-dev:pr-review-splitter
   prompt: "Split PR diff into review units.
     PR_BRANCH: {{pr_branch}}
     BASE_BRANCH: {{base_branch}}
     THRESHOLD: 100
     Return JSON with units array."
   ```

2. **Parse splitter output**:
   - Extract `units` array from JSON response
   - Store `total` and `filtered` counts for reporting
   - Validate at least 1 unit exists

3. **Handle splitter failure**:
   - If agent fails or returns invalid JSON: Abort with clear error
   - Message: "ERROR: Failed to split PR diff. Check branch names and git status."

### Phase 2: Detailed Analysis (Parallel)

**CRITICAL**: Spawn ALL sub-reviewers in a SINGLE message with multiple Task calls.

1. **Get diff content for each unit**:
   For each unit, prepare the diff:
   ```bash
   git diff {{base}}..{{branch}} -- {{unit.path}}
   ```
   For hunks, extract relevant section with context.

2. **Build file list**:
   Extract unique file paths from all units for cross-file context.

3. **Spawn N sub-reviewers in SINGLE message**:

   For each unit:
   ```
   Use Task tool with:
   subagent_type: rp1-dev:pr-sub-reviewer
   prompt: "Analyze review unit across 5 dimensions.
     UNIT_JSON: {{stringify(unit_with_diff)}}
     INTENT_JSON: {{stringify(intent_model)}}
     PR_FILES: {{stringify(file_list)}}
     Return JSON with findings and summary."
   ```

4. **Collect responses**:
   - Parse JSON from each sub-reviewer
   - Aggregate all findings into single array
   - Aggregate all summaries into single array
   - Track which units succeeded/failed

5. **Handle partial failures**:
   - If <50% fail: Continue with successful results
   - If ≥50% fail: Abort with error listing failed units

### Phase 3: Synthesis (Sequential)

1. **Prepare findings summary**:
   ```json
   {
     "critical": <count>,
     "high": <count>,
     "medium": <count>,
     "low": <count>,
     "needs_human_review": <count>,
     "details": ["HIGH: unsanitized exec in auth.ts:67", ...]
   }
   ```

2. **Spawn synthesizer**:
   ```
   Use Task tool with:
   subagent_type: rp1-dev:pr-review-synthesizer
   prompt: "Perform holistic verification.
     INTENT_JSON: {{stringify(intent_model)}}
     FILE_LIST: {{stringify(file_list)}}
     SUMMARIES_JSON: {{stringify(all_summaries)}}
     FINDINGS_SUMMARY: {{stringify(findings_summary)}}
     Return JSON with intent_achieved, cross_file_findings, judgment, rationale."
   ```

3. **Parse synthesis result**:
   - Extract `intent_achieved`, `intent_gap`
   - Extract `cross_file_findings` array
   - Extract `judgment` and `rationale`

4. **Handle synthesizer failure**:
   - Log warning but continue
   - Use findings-only judgment: Critical → block, High → request_changes, else → approve
   - Set `rationale` = "Synthesis unavailable, judgment based on findings only"

### Phase 4: Reporting (Sequential)

1. **Merge findings**:
   - Combine unit findings + cross_file_findings
   - Deduplicate by (path, lines, dimension)
   - Apply highest confidence/severity for duplicates

2. **Prepare stats**:
   ```json
   {
     "critical": <final_count>,
     "high": <final_count>,
     "medium": <final_count>,
     "low": <final_count>
   }
   ```

3. **Determine review ID**:
   - From PR number if available: `pr-{{number}}`
   - Otherwise from branch: sanitize branch name (replace `/` with `-`)

4. **Retrieve visual result** (if VISUAL_TASK_ID exists):
   - Check if background visual task completed
   - If completed: extract `visual_path` from result
   - If still running or failed: set `visual_path` = "none"
   - Store as `VISUAL_PATH` for reporter

5. **Spawn reporter**:
   ```
   Use Task tool with:
   subagent_type: rp1-dev:pr-review-reporter
   prompt: "Generate markdown report.
     PR_INFO: {{stringify({branch, title, base})}}
     INTENT_JSON: {{stringify(intent_model)}}
     JUDGMENT_JSON: {{stringify({judgment, rationale, intent_achieved, intent_gap})}}
     FINDINGS_JSON: {{stringify(merged_findings)}}
     CROSS_FILE_JSON: {{stringify(cross_file_findings)}}
     STATS_JSON: {{stringify(stats)}}
     VISUAL_PATH: {{VISUAL_PATH or "none"}}
     OUTPUT_DIR: {{RP1_ROOT}}/work/pr-reviews
     REVIEW_ID: {{review_id}}
     Return JSON with path."
   ```

6. **Parse reporter result**:
   - Extract `path` from JSON response

7. **Handle reporter failure**:
   - Log error
   - Output findings summary inline to user as fallback

### Final Output

```
{{JUDGMENT_EMOJI}} PR Review Complete

Judgment: {{JUDGMENT}}
{{RATIONALE}}

Findings:
- 🚨 Critical: {{critical}}
- ⚠️ High: {{high}}
- 💡 Medium: {{medium}}
- ✅ Low: {{low}}

Report: {{REPORT_PATH}}
{{IF VISUAL_PATH != "none"}}Visual: {{VISUAL_PATH}}{{/IF}}
```

**Judgment emoji mapping**:
- `approve` → ✅
- `request_changes` → ⚠️
- `block` → 🛑

**Visual link**: Only include if visual was generated (VISUAL_PATH != "none").

## Error Handling

| Error | Action |
|-------|--------|
| Can't determine branch | Ask user for branch name |
| gh CLI not available | Fall back to git-only mode |
| Visual generation fails | Continue without visual (non-blocking) |
| Splitter fails | Abort with clear error |
| >50% sub-reviewers fail | Abort with error |
| Synthesizer fails | Continue with findings-only judgment |
| Reporter fails | Output findings inline |

## Output Discipline

**CRITICAL - Keep Output Concise**:
- Do ALL internal work in <thinking> tags
- Do NOT output verbose phase-by-phase progress
- Only output:
  1. Initial status (resolving PR, building intent)
  2. Brief progress if phases take >30 seconds
  3. Final summary with report path
