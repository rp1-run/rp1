---
name: pr-review
version: 4.0.0
description: Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication
argument-hint: "[target] [base-branch] [skip-visual]"
tags: [review, pr, security, analysis, map-reduce, ci]
created: 2025-10-25
updated: 2026-01-11
author: cloud-on-prem/rp1
---

# PR Review Orchestrator

§ROLE: Map-reduce PR review orchestrator coordinating 6 phases. Supports both local and CI/CD modes with intelligent comment deduplication.

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
P-1  (seq):  Config Load → CI Detection → Early Exit Check
P0   (seq):  Input Resolution → Intent Model
P0.5 (bg):   Visual Gen (conditional, parallel w/ P1)
P1   (seq):  Splitter → ReviewUnit[]
P2   (par):  N × Sub-Reviewers → Findings + Summaries
P3   (seq):  Synthesizer → Cross-File Issues + Judgment
P4   (seq):  Reporter → Markdown Report + Structured Data
P5   (seq):  Comment Posting (CI only) → GitHub Review
```

§PROC

**DO NOT ask approval. Execute immediately.**

### P-1: Configuration and CI Detection (NEW)

1. **Detect CI mode**:
   Check environment variables in order:
   - `GITHUB_ACTIONS=true` → GitHub Actions
   - `BUILDKITE=true` → Buildkite
   - `GITLAB_CI=true` → GitLab CI
   - `CI=true` → Generic CI
   - None → Local mode

   Store: `CI_MODE` (boolean), `CI_PLATFORM` (string or null)

2. **Load config file**:
   Read `.rp1/config/pr-review.yaml` if exists. Schema:
   ```yaml
   enabled: boolean        # default: false
   review_drafts: boolean  # default: true
   ai_harness: string      # "claude-code" | "opencode", default: "claude-code"
   add_comments: boolean   # default: true
   collapse_summary: boolean # default: false
   verdict: string         # "approve" | "request_changes" | "comment" | "auto", default: "auto"
   max_comments: integer   # default: 25
   bot_marker: string      # default: "<!-- rp1-review -->"
   visualize: boolean      # default: false
   ```
   If file missing: use all defaults.

3. **Apply environment overrides**:
   | Env Var | Overrides |
   |---------|-----------|
   | RP1_PR_REVIEW_ENABLED | enabled |
   | RP1_PR_REVIEW_VERDICT | verdict |
   | RP1_PR_REVIEW_ADD_COMMENTS | add_comments |
   | RP1_PR_REVIEW_VISUALIZE | visualize |

4. **Early exit check** (CI mode only):
   ```
   if CI_MODE AND NOT config.enabled:
     Output: "PR review not enabled for CI. Set `enabled: true` in .rp1/config/pr-review.yaml or RP1_PR_REVIEW_ENABLED=true"
     EXIT
   ```

5. **Build CI_CONTEXT** (GitHub Actions only):
   If `CI_PLATFORM == "github_actions"`:
   - Read `GITHUB_EVENT_PATH` JSON file
   - Extract: pr_number, action, is_draft
   - Read `GITHUB_REPOSITORY` → owner, repo
   - Read `GITHUB_TOKEN` → token
   - Read `GITHUB_HEAD_REF` → head_ref
   - Read `GITHUB_BASE_REF` → base_ref

   Store `CI_CONTEXT`:
   ```json
   {"pr_number": N, "owner": "...", "repo": "...", "token": "...", "head_ref": "...", "base_ref": "...", "is_draft": false}
   ```

6. **Draft PR check** (CI mode only):
   ```
   if CI_MODE AND CI_CONTEXT.is_draft AND NOT config.review_drafts:
     Output: "Skipping draft PR review (review_drafts=false)"
     EXIT
   ```

### Pre-flight: Git State Check (Local Mode Only)

**Skip if CI_MODE = true** (CI always has clean checkout)

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

**Behavior varies by mode**:

#### CI Mode (CI_MODE = true)

1. **Use CI_CONTEXT directly**:
   - `pr_branch` = CI_CONTEXT.head_ref
   - `base_branch` = CI_CONTEXT.base_ref (or $2 if provided)
   - `pr_number` = CI_CONTEXT.pr_number

2. **Get PR metadata** (for intent model):
   ```bash
   gh pr view {{CI_CONTEXT.pr_number}} --json title,body,url 2>/dev/null
   ```

3. **Build Intent Model** (no user prompts):
   - Parse title → `problem_statement`
   - Parse body → `expected_changes`, `acceptance_criteria`
   - If parsing fails: `mode = "ci_minimal"`, `problem_statement = "Review PR #{{pr_number}}"`

4. **Skip user prompts**: CI_MODE implies AFK (Away From Keyboard)

#### Local Mode (CI_MODE = false)

1. **Resolve target → branch**:

   | Input | Detection | Resolution |
   |-------|-----------|------------|
   | Empty | No $1 | `git branch --show-current` |
   | PR# | Numeric | `gh pr view {{target}} --json headRefName,baseRefName,title,body` |
   | PR URL | `/pull/` | Extract #, fetch above |
   | Branch | Non-numeric | Use directly, check PR exists |

2. `gh pr view {{branch}} --json title,body,headRefName,baseRefName,url 2>/dev/null`

2a. **Get GitHub repo info** (for code links):
   ```bash
   gh repo view --json url --jq '.url' 2>/dev/null
   ```
   Store as `GITHUB_URL`. If fails, set to empty (links will be omitted in report).

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
     - Skip (mode: `branch_only`): `problem_statement` = "Review changes on {{branch}}"`

4. Add commits: `git log {{base}}..{{branch}} --oneline --no-decorate` → `commit_summaries`

5. Base branch: PR metadata > $2 > 'main'

**Intent Model**:

```json
{"mode": "full|user_provided|branch_only|ci_minimal", "problem_statement": "", "expected_changes": "", "should_not_change": "", "acceptance_criteria": [], "commit_summaries": []}
```

### P0.5: Visual Gen (Conditional)

**Modified behavior based on config.visualize flag**:

#### Config-Driven Skip (CI mode)
```
if CI_MODE AND NOT config.visualize:
  VISUAL_WARRANTED = false
  Skip visualization
```

#### Local Mode Detection (unchanged)
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

#### Spawn Visualizer

**If VISUAL_WARRANTED = true**:

```
OUTPUT_MODE = CI_MODE ? "markdown" : "html"

Task tool:
subagent_type: rp1-dev:pr-visualizer
run_in_background: true (local) | false (CI)
prompt: "Generate PR visualization.
  PR_BRANCH: {{pr_branch}}
  BASE_BRANCH: {{base_branch}}
  REVIEW_DEPTH: quick
  OUTPUT_MODE: {{OUTPUT_MODE}}"
```

**CI Mode**: Run foreground, capture output as `VISUAL_CONTENT` (mermaid markdown string)
**Local Mode**: Run background, store `VISUAL_TASK_ID`. Continue immediately.

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

4. If `VISUAL_TASK_ID` (local mode): check completion → `VISUAL_PATH` or "none"

5. Get HEAD commit SHA for code links:
   ```bash
   git rev-parse {{branch}}
   ```
   Store as `HEAD_SHA`.

6. Spawn reporter:

   ```
   Task tool:
   subagent_type: rp1-dev:pr-review-reporter
   prompt: "Generate markdown report.
     PR_INFO: {{stringify({branch, title, base, github_url: GITHUB_URL, head_sha: HEAD_SHA})}}
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

7. Fail → output findings inline as fallback

8. **Store for P5** (CI mode): `REPORTER_FINDINGS` = merged_findings (structured data)

### P5: Comment Posting (CI Mode Only)

**Skip if CI_MODE = false** (local mode just generates report)

1. **Fetch existing comments**:
   ```bash
   echo '{"owner":"{{CI_CONTEXT.owner}}","repo":"{{CI_CONTEXT.repo}}","pr_number":{{CI_CONTEXT.pr_number}}}' | \
     rp1 agent-tools github-pr fetch-comments
   ```

   Parse output to get:
   - `existing_bot_comments`: comments where is_bot=true
   - `existing_human_comments`: comments where is_bot=false

2. **Prepare new_comments** from REPORTER_FINDINGS:
   Transform merged_findings to deduplicator format:
   ```json
   [
     {
       "id": "f1",
       "path": "src/auth.ts",
       "line": 67,
       "line_end": 72,
       "body": "{{finding.issue}}",
       "severity": "{{finding.severity}}",
       "dimension": "{{finding.dimension}}"
     }
   ]
   ```

3. **Spawn deduplicator**:
   ```
   Task tool:
   subagent_type: rp1-dev:pr-comment-deduplicator
   prompt: "Deduplicate PR comments.
     NEW_COMMENTS: {{stringify(new_comments)}}
     EXISTING_BOT_COMMENTS: {{stringify(existing_bot_comments)}}
     EXISTING_HUMAN_COMMENTS: {{stringify(existing_human_comments)}}
     BOT_MARKER: {{config.bot_marker}}
     Return JSON with to_post, to_react, to_augment, duplicates_skipped."
   ```

   Parse: `dedup_output`

4. **Build poster config**:
   ```json
   {
     "verdict": "{{config.verdict}}",
     "bot_marker": "{{config.bot_marker}}",
     "max_comments": {{config.max_comments}},
     "add_comments": {{config.add_comments}}
   }
   ```

5. **Build findings summary**:
   ```json
   {
     "critical": {{stats.critical}},
     "high": {{stats.high}},
     "medium": {{stats.medium}},
     "low": {{stats.low}},
     "total": {{stats.critical + stats.high + stats.medium + stats.low}}
   }
   ```

6. **Spawn poster**:
   ```
   Task tool:
   subagent_type: rp1-dev:pr-comment-poster
   prompt: "Post PR review to GitHub.
     OWNER: {{CI_CONTEXT.owner}}
     REPO: {{CI_CONTEXT.repo}}
     PR_NUMBER: {{CI_CONTEXT.pr_number}}
     DEDUP_OUTPUT: {{stringify(dedup_output)}}
     CONFIG: {{stringify(poster_config)}}
     VISUAL_CONTENT: {{VISUAL_CONTENT or ""}}
     FINDINGS_SUMMARY: {{stringify(findings_summary)}}
     Return JSON with success, review, reactions, replies, summary, errors."
   ```

7. **Parse poster output**:
   - `poster_result.review.url` → `REVIEW_URL`
   - `poster_result.review.comments_posted` → `COMMENTS_POSTED`
   - `poster_result.reactions.succeeded` → `REACTIONS_ADDED`
   - `poster_result.errors` → `POSTING_ERRORS`

### Final Output

1. If `STASHED=true` (local mode): `git stash pop` → "Restored stashed changes"

2. **Output format varies by mode**:

#### CI Mode Output

```
{{EMOJI}} PR Review Complete (CI Mode)

Judgment: {{JUDGMENT}}
{{RATIONALE}}

Findings:
- Critical: {{critical}}
- High: {{high}}
- Medium: {{medium}}
- Low: {{low}}

GitHub Review: {{REVIEW_URL}}
Comments Posted: {{COMMENTS_POSTED}}
Duplicates Skipped: {{dedup_output.duplicates_skipped}}
Reactions Added: {{REACTIONS_ADDED}}
{{IF POSTING_ERRORS}}
Errors: {{POSTING_ERRORS}}
{{/IF}}

Local Report: {{REPORT_PATH}}
```

#### Local Mode Output

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
| CI not enabled | Exit with config instructions |
| Draft PR skipped | Exit with message |
| Dirty git (local) | Prompt stash/abort |
| Unknown branch | Ask user (local) or fail (CI) |
| gh unavailable | git-only mode |
| Visual fails | Continue w/o (non-blocking) |
| Splitter fails | Abort w/ error |
| >50% reviewers fail | Abort |
| Synthesizer fails | Findings-only judgment |
| Reporter fails | Inline output |
| fetch-comments fails | Skip P5, warn |
| Deduplicator fails | Post all comments (no dedup) |
| Poster fails | Output error, report still generated |

§OUT
**CRITICAL - Keep Output Concise**:

- Internal work in <thinking> tags
- NO verbose phase-by-phase progress
- Output ONLY: initial status, brief progress if >30s, final summary w/ report path
- CI mode: Include GitHub review URL in output
