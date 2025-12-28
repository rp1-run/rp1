---
name: pr-review
version: 3.0.0
description: Intent-aware map-reduce PR review with confidence gating and holistic synthesis
argument-hint: "[target] [base-branch] [skip-visual]"
tags: [review, pr, security, analysis, map-reduce]
created: 2025-10-25
updated: 2025-11-29
author: cloud-on-prem/rp1
---

# PR Review Orchestrator

§ROLE: Map-reduce PR review orchestrator coordinating 4 phases across subagents.

§IN

| Param | Pos | Default | Purpose |
|-------|-----|---------|---------|
| TARGET | $1 | current branch | PR#, URL, branch, or empty |
| BASE_BRANCH | $2 | from PR or 'main' | Diff base |
| SKIP_VISUAL | $3 | (none) | `skip-visual` disables viz |
| RP1_ROOT | env | `.rp1/` | Artifact root |

<target>$1</target>
<base_branch>$2</base_branch>
<skip_visual>$3</skip_visual>
<rp1_root>{{RP1_ROOT}}</rp1_root>

§ARCH

```
P0   (seq):  Input Resolution → Intent Model
P0.5 (bg):   Visual Gen (conditional, parallel w/ P1)
P1   (seq):  Splitter → ReviewUnit[]
P2   (par):  N × Sub-Reviewers → Findings + Summaries
P3   (seq):  Synthesizer → Cross-File Issues + Judgment
P4   (seq):  Reporter → Markdown Report
```

§PROC

**DO NOT ask approval. Execute immediately.**

### Pre-flight: Git State Check

1. `git status --porcelain`
2. **If non-empty** (dirty state):
   - AskUserQuestion:

     ```
     question: "I see uncommitted changes on this branch. How shall we proceed?"
     options:
       - label: "Stash and continue"
         description: "Stash, review, restore"
       - label: "Abort"
         description: "Cancel to preserve working state"
     ```

3. **Handle choice**:
   - Stash: `git stash push -m "rp1-pr-review-auto-stash"` → set `STASHED=true`
   - Abort: Exit "Review cancelled. Changes preserved."

### P0: Input Resolution + Intent

1. **Resolve target → branch**:

   | Input | Detection | Resolution |
   |-------|-----------|------------|
   | Empty | No $1 | `git branch --show-current` |
   | PR# | Numeric | `gh pr view {{target}} --json headRefName,baseRefName,title,body` |
   | PR URL | `/pull/` | Extract #, fetch above |
   | Branch | Non-numeric | Use directly, check PR exists |

2. `gh pr view {{branch}} --json title,body,headRefName,baseRefName,url 2>/dev/null`

3. **Build Intent Model**:
   - **PR exists** (mode: `full`):
     - `title` → `problem_statement`
     - Parse `body` → `expected_changes`, `acceptance_criteria`
     - Check linked issues (GitHub/Linear/Jira)
     - Fetch if found: `gh issue view {{#}} --json title,body`
   - **No PR**:
     - AskUserQuestion:

       ```
       question: "No open PR for this branch. What is the purpose of your current changes?"
       options:
         - label: "Quick description"
         - label: "Skip"
       ```

     - User provides (mode: `user_provided`): `problem_statement` = description
     - Skip (mode: `branch_only`): `problem_statement` = "Review changes on {{branch}}"

4. Add commits: `git log {{base}}..{{branch}} --oneline --no-decorate` → `commit_summaries`

5. Base branch: PR metadata > $2 > 'main'

**Intent Model**:

```json
{"mode": "full|user_provided|branch_only", "problem_statement": "", "expected_changes": "", "should_not_change": "", "acceptance_criteria": [], "commit_summaries": []}
```

### P0.5: Visual Gen (Conditional)

1. Get stats:

   ```bash
   git diff --stat {{base}}..{{branch}}
   git diff --numstat {{base}}..{{branch}}
   ```

2. **Detection**:

   ```
   VISUAL_WARRANTED = file_count > 5
     OR any file > 200 lines
     OR multiple dirs
     OR arch files (*.config, schema.*, migrations/*)
   ```

3. **Skip if**: `$3 == "skip-visual"` OR trivial (≤3 files, same dir, <100 lines)

4. **If warranted**:

   ```
   Task tool:
   subagent_type: rp1-dev:pr-visualizer
   run_in_background: true
   prompt: "Generate PR visualization.
     PR_BRANCH: {{pr_branch}}
     BASE_BRANCH: {{base_branch}}
     REVIEW_DEPTH: quick"
   ```

   Store `VISUAL_TASK_ID`. Continue immediately.

### P1: Splitting (seq)

1. Spawn splitter:

   ```
   Task tool:
   subagent_type: rp1-dev:pr-review-splitter
   prompt: "Split PR diff into review units.
     PR_BRANCH: {{pr_branch}}
     BASE_BRANCH: {{base_branch}}
     THRESHOLD: 100
     Return JSON with units array."
   ```

2. Parse `units` array, store `total`/`filtered` counts

3. Fail → Abort: "ERROR: Failed to split PR diff. Check branches/git status."

### P2: Detailed Analysis (par)

**CRITICAL**: Spawn ALL sub-reviewers in SINGLE message w/ multiple Task calls.

1. For each unit: `git diff {{base}}..{{branch}} -- {{unit.path}}`

2. Build `file_list` from all units

3. **Spawn N sub-reviewers** (one msg):

   ```
   Task tool:
   subagent_type: rp1-dev:pr-sub-reviewer
   prompt: "Analyze review unit across 5 dimensions.
     UNIT_JSON: {{stringify(unit_with_diff)}}
     INTENT_JSON: {{stringify(intent_model)}}
     PR_FILES: {{stringify(file_list)}}
     Return JSON with findings and summary."
   ```

4. Collect: aggregate findings + summaries, track success/fail

5. <50% fail → continue | ≥50% fail → abort w/ error

### P3: Synthesis (seq)

1. Prepare summary:

   ```json
   {"critical": N, "high": N, "medium": N, "low": N, "needs_human_review": N, "details": ["HIGH: unsanitized exec in auth.ts:67"]}
   ```

2. Spawn synthesizer:

   ```
   Task tool:
   subagent_type: rp1-dev:pr-review-synthesizer
   prompt: "Perform holistic verification.
     INTENT_JSON: {{stringify(intent_model)}}
     FILE_LIST: {{stringify(file_list)}}
     SUMMARIES_JSON: {{stringify(all_summaries)}}
     FINDINGS_SUMMARY: {{stringify(findings_summary)}}
     Return JSON with intent_achieved, cross_file_findings, judgment, rationale."
   ```

3. Extract: `intent_achieved`, `intent_gap`, `cross_file_findings`, `judgment`, `rationale`

4. Fail → continue w/ findings-only judgment: Critical→block, High→request_changes, else→approve

### P4: Reporting (seq)

1. Merge findings: unit + cross_file, dedupe by (path, lines, dimension), keep highest severity

2. Stats: `{critical: N, high: N, medium: N, low: N}`

3. Review ID: PR# → `pr-{{number}}` | else → sanitized branch (/ → -)

4. If `VISUAL_TASK_ID`: check completion → `VISUAL_PATH` or "none"

5. Spawn reporter:

   ```
   Task tool:
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

6. Fail → output findings inline as fallback

### Final Output

1. If `STASHED=true`: `git stash pop` → "Restored stashed changes"

2. Output:

```
{{EMOJI}} PR Review Complete

Judgment: {{JUDGMENT}}
{{RATIONALE}}

Findings:
- Critical: {{critical}}
- High: {{high}}
- Medium: {{medium}}
- Low: {{low}}

Report: {{REPORT_PATH}}
{{IF VISUAL_PATH != "none"}}Visual: {{VISUAL_PATH}}{{/IF}}
{{IF STASHED}}Restored stashed changes{{/IF}}
```

Emoji: approve→✅ | request_changes→⚠️ | block→🛑

§ERR

| Error | Action |
|-------|--------|
| Dirty git | Prompt stash/abort |
| Unknown branch | Ask user |
| gh unavailable | git-only mode |
| Visual fails | Continue w/o (non-blocking) |
| Splitter fails | Abort w/ error |
| >50% reviewers fail | Abort |
| Synthesizer fails | Findings-only judgment |
| Reporter fails | Inline output |

§OUT
**CRITICAL - Keep Output Concise**:

- Internal work in <thinking> tags
- NO verbose phase-by-phase progress
- Output ONLY: initial status, brief progress if >30s, final summary w/ report path
