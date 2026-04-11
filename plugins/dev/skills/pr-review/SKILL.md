---
name: pr-review
description: "Intent-aware map-reduce PR review with CI/CD support, confidence gating, and intelligent comment deduplication."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: review
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
  version: 4.0.0
  tags:
    - review
    - pr
    - security
    - analysis
    - map-reduce
    - ci
  created: 2025-10-25
  updated: 2026-04-08
  author: cloud-on-prem/rp1
  arguments:
    - name: TARGET
      type: string
      required: false
      description: "PR number, PR URL, branch name, or empty for current branch"
    - name: BASE_BRANCH
      type: string
      required: false
      description: "Diff base branch (default: from PR or main)"
    - name: SKIP_VISUAL
      type: boolean
      required: false
      default: false
      description: "Skip visual diagram generation"
      aliases:
        - "skip-visual"
        - "no visual"
  sub_agents:
    - "rp1-dev:pr-visualizer"
    - "rp1-dev:pr-review-splitter"
    - "rp1-dev:pr-sub-reviewer"
    - "rp1-dev:pr-review-synthesizer"
    - "rp1-dev:pr-review-reporter"
    - "rp1-dev:pr-comment-deduplicator"
    - "rp1-dev:pr-comment-poster"
---

# PR Review Orchestrator

§ROLE: Map-reduce PR review orchestrator. 6 phases, local + CI modes, comment deduplication.

§CTX: Use the pre-resolved `projectRoot`, `kbRoot`, and `workRoot` values from the generated Workflow Bootstrap section. Do not hardcode `.rp1/work/` or `.rp1/context/` paths.

§GUARDRAILS

- Never create git worktrees under `.rp1/work/` or anywhere inside the target project's `.rp1/` directory.
- If a separate checkout is absolutely required during review, use a temporary path outside the project artifact tree.

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> reviewing
    reviewing --> posting : analysis_complete
    posting --> [*] : done
```

**On each phase transition**, report via:
```
rp1 agent-tools emit \
  --workflow pr-review \
  --type status_change \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --data '{"status": "running"}'
```

- `RUN_ID` comes from the generated Workflow Bootstrap section
- Derive `RUN_NAME` from the resolved PR context: use `"PR #{pr_number}"` when a PR number is available, otherwise use `"PR: {branch_name}"` as fallback
- On the **first** emit only, include `--name "{RUN_NAME}"` to label the run

On session start, emit the status change:
```bash
rp1 agent-tools emit \
  --workflow pr-review \
  --type status_change \
  --run-id {RUN_ID} \
  --name "{RUN_NAME}" \
  --step reviewing \
  --data '{"status": "running"}'
```

**State Progression Protocol**:
1. Report each `--step` with `--data '{"status": "running"}'` when you enter that state
2. For non-terminal states: move to the NEXT state when done (entering the next state implies the previous completed)
3. For terminal states (those with `→ [*]` transitions): report with `--data '{"status": "completed"}'` when the step's work finishes
4. On error, transition to the appropriate failure state in the graph

**State mapping**:
- `reviewing` covers: P-1 (config), P0 (input resolution), P0.5 (visual gen), P1 (splitting), P2 (sub-reviewers), P3 (synthesis)
- `posting` covers: P4 (reporting), P5 (comment posting)

**Example sequence**:
```
--workflow pr-review --step reviewing --name "PR #42" --data '{"status": "running"}'   # first emit includes --name
--workflow pr-review --step posting --data '{"status": "running"}'       # analysis done, entering posting phase
--workflow pr-review --step posting --data '{"status": "completed"}'     # posting done, workflow complete
```

§ARCH

```
P-1  (seq):  Config Load -> CI Detection -> Early Exit Check
P0   (seq):  Input Resolution -> Intent Model
P0.5 (bg):   Visual Gen (conditional, parallel w/ P1)
P1   (seq):  Splitter -> ReviewUnit[]
P2   (par):  N x Sub-Reviewers -> Findings + Summaries
P3   (seq):  Synthesizer -> Cross-File Issues + Judgment
P4   (seq):  Reporter -> Markdown Report + Structured Data
P5   (seq):  Comment Posting (CI only) -> GitHub Review
```

§PROC

**Execute immediately. No approval prompts.**

### P-1: Config + CI Detection

1. **Load config**: Read `{projectRoot}/.rp1/config/pr-review.yaml` if exists:
   ```yaml
   enabled: boolean        # default: false
   review_drafts: boolean  # default: true
   ai_harness: string      # "claude-code" | "opencode", default: "claude-code"
   add_comments: boolean   # default: true
   collapse_summary: boolean # default: false
   verdict: string         # "approve" | "request_changes" | "comment" | "auto", default: "auto"
   max_comments: integer   # default: 25
   bot_marker: string      # default: "<!-- rp1-review -->"
   visualize: boolean      # default: true
   ci_platform: string     # "github" | "buildkite" | "gitlab", default: "github"
   ```
   Missing file -> use defaults.

2. **Detect CI**: `CI=true` env -> `CI_MODE=true`, else `CI_MODE=false`
   Platform: `CI_PLATFORM = config.ci_platform` (default: github)

3. **Env overrides**:

   | Env Var | Overrides |
   |---------|-----------|
   | RP1_PR_REVIEW_ENABLED | enabled |
   | RP1_PR_REVIEW_VERDICT | verdict |
   | RP1_PR_REVIEW_ADD_COMMENTS | add_comments |
   | RP1_PR_REVIEW_VISUALIZE | visualize |

4. **Early exit** (CI only):
   `if CI_MODE AND NOT config.enabled` -> Output config instructions, EXIT

5. **Build CI_CONTEXT** (GitHub only):
   - Read `GITHUB_EVENT_PATH` -> pr_number, action, is_draft
   - Read `GITHUB_REPOSITORY` -> owner, repo
   - Read `GITHUB_TOKEN`, `GITHUB_HEAD_REF`, `GITHUB_BASE_REF`

   Store: `{"pr_number": N, "owner": "...", "repo": "...", "token": "...", "head_ref": "...", "base_ref": "...", "is_draft": false}`

6. **Draft check** (CI only):
   `if CI_MODE AND CI_CONTEXT.is_draft AND NOT config.review_drafts` -> Skip, EXIT

### Pre-flight: Git State (Local Only)

Skip if `CI_MODE=true`.

1. `git status --porcelain`
2. If non-empty -> {% ask_user "Stash and continue?", options: "Stash and continue", "Abort" %}
3. Stash: `git stash push -m "rp1-pr-review-auto-stash"`, set `STASHED=true`
   Abort: Exit "Review cancelled."

### P0: Input Resolution + Intent

#### CI Mode

1. From CI_CONTEXT: `pr_branch`, `base_branch` (BASE_BRANCH if provided), `pr_number`
2. `gh pr view {{pr_number}} --json title,body,url 2>/dev/null`
3. Parse title -> `problem_statement`, body -> `expected_changes`, `acceptance_criteria`
   Parse fails -> `mode="ci_minimal"`, `problem_statement="Review PR #{{pr_number}}"`
4. No user prompts (AFK)

#### Local Mode

1. **Resolve target**:

   | Input | Detection | Resolution |
   |-------|-----------|------------|
   | Empty | No TARGET | `git branch --show-current` |
   | PR# | Numeric | `gh pr view {{target}} --json headRefName,baseRefName,title,body` |
   | PR URL | `/pull/` | Extract #, fetch above |
   | Branch | Non-numeric | Use directly |

2. `gh pr view {{branch}} --json title,body,headRefName,baseRefName,url 2>/dev/null`

2a. Get repo URL: `gh repo view --json url --jq '.url' 2>/dev/null` -> `GITHUB_URL` (empty if fails)

3. **Build Intent Model**:
   - PR exists (mode=`full`): title -> `problem_statement`, parse body, fetch linked issues
   - No PR -> {% ask_user "Quick description of the intended changes", options: "Provide description", "Skip" %}
     - Provided (mode=`user_provided`): use description
     - Skip (mode=`branch_only`): `problem_statement="Review changes on {{branch}}"`

4. Add: `git log {{base}}..{{branch}} --oneline --no-decorate` -> `commit_summaries`

5. Base: PR metadata > BASE_BRANCH > 'main'

**Intent Model**: `{"mode": "...", "problem_statement": "", "expected_changes": "", "should_not_change": "", "acceptance_criteria": [], "commit_summaries": []}`

### P0.5: Visual Gen (Conditional)

**Skip conditions** (any true -> skip):
- `SKIP_VISUAL == true`
- `config.visualize == false`

**Spawn** (if not skipped):
Background mode: local=true, CI=false

{% dispatch_agent "rp1-dev:pr-visualizer" %}
Generate PR visualization.
  PR_BRANCH: {{pr_branch}}
  BASE_BRANCH: {{base_branch}}
  REVIEW_DEPTH: quick
  STANDALONE: false
{% enddispatch_agent %}

Capture `VISUAL_CONTENT` (raw markdown with Mermaid diagrams)

### P1: Splitting

{% dispatch_agent "rp1-dev:pr-review-splitter" %}
Split PR diff into review units.
  PR_BRANCH: {{pr_branch}}
  BASE_BRANCH: {{base_branch}}
  THRESHOLD: 100
  Return JSON with units array.
{% enddispatch_agent %}

Parse `units`, store counts. Fail -> Abort w/ error.

### P2: Detailed Analysis

**CRITICAL**: Spawn ALL sub-reviewers in SINGLE message.

1. For each unit: `git diff {{base}}..{{branch}} -- {{unit.path}}`
2. Build `file_list`
3. Spawn N sub-reviewers (one msg):

   {% dispatch_agent "rp1-dev:pr-sub-reviewer" %}
   Analyze review unit across 5 dimensions.
     UNIT_JSON: {{stringify(unit_with_diff)}}
     INTENT_JSON: {{stringify(intent_model)}}
     PR_FILES: {{stringify(file_list)}}
     Return JSON with findings and summary.
   {% enddispatch_agent %}

4. Aggregate findings + summaries
5. <50% fail -> continue | >=50% fail -> abort

### P3: Synthesis

1. Prep summary: `{"critical": N, "high": N, "medium": N, "low": N, "needs_human_review": N, "details": [...]}`

2. Spawn:

   {% dispatch_agent "rp1-dev:pr-review-synthesizer" %}
   Perform holistic verification.
     INTENT_JSON: {{stringify(intent_model)}}
     FILE_LIST: {{stringify(file_list)}}
     SUMMARIES_JSON: {{stringify(all_summaries)}}
     FINDINGS_SUMMARY: {{stringify(findings_summary)}}
     Return JSON with intent_achieved, cross_file_findings, judgment, rationale.
   {% enddispatch_agent %}

3. Extract: `intent_achieved`, `intent_gap`, `cross_file_findings`, `judgment`, `rationale`
4. Fail -> findings-only judgment: Critical->block, High->request_changes, else->approve

### P4: Reporting

1. Merge findings: unit + cross_file, dedupe by (path, lines, dimension), keep highest severity
2. Stats: `{critical: N, high: N, medium: N, low: N}`
3. Review ID: PR# -> `pr-{{number}}` | else -> sanitized branch
4. `git rev-parse {{branch}}` -> `HEAD_SHA`
5. Spawn:

   {% dispatch_agent "rp1-dev:pr-review-reporter" %}
   Generate markdown report.
     PR_INFO: {% raw %}{{stringify({branch, title, base, github_url: GITHUB_URL, head_sha: HEAD_SHA})}}{% endraw %}
     INTENT_JSON: {{stringify(intent_model)}}
     JUDGMENT_JSON: {% raw %}{{stringify({judgment, rationale, intent_achieved, intent_gap})}}{% endraw %}
     FINDINGS_JSON: {{stringify(merged_findings)}}
     CROSS_FILE_JSON: {{stringify(cross_file_findings)}}
     STATS_JSON: {{stringify(stats)}}
     VISUAL_CONTENT: {{VISUAL_CONTENT or ""}}
     OUTPUT_DIR: {workRoot}/pr-reviews
     REVIEW_ID: {{review_id}}
     Return JSON with path.
   {% enddispatch_agent %}

6. Fail -> output findings inline
7. Store `REPORTER_FINDINGS` for P5 (CI mode)
8. Register the report artifact after the reporter creates it:
   ```bash
   rp1 agent-tools emit \
     --workflow pr-review \
     --type artifact_registered \
     --run-id {RUN_ID} \
     --step posting \
     --data '{"path": "{REPORT_PATH}", "feature": "{review_id}", "storageRoot": "absolute", "format": "markdown"}'
   ```

### P5: Comment Posting (CI Only)

Skip if `CI_MODE=false`.

1. **Fetch existing**:
   ```bash
   echo '{"owner":"{{CI_CONTEXT.owner}}","repo":"{{CI_CONTEXT.repo}}","pr_number":{{CI_CONTEXT.pr_number}}}' | \
     rp1 agent-tools github-pr fetch-comments
   ```
   Parse -> `existing_bot_comments`, `existing_human_comments`

2. **Transform findings** to deduplicator fmt:
   `[{"id": "f1", "path": "...", "line": N, "line_end": N, "body": "...", "severity": "...", "dimension": "..."}]`

3. **Deduplicate**:

   {% dispatch_agent "rp1-dev:pr-comment-deduplicator" %}
   Deduplicate PR comments.
     NEW_COMMENTS: {{stringify(new_comments)}}
     EXISTING_BOT_COMMENTS: {{stringify(existing_bot_comments)}}
     EXISTING_HUMAN_COMMENTS: {{stringify(existing_human_comments)}}
     BOT_MARKER: {{config.bot_marker}}
     Return JSON with to_post, to_react, to_augment, duplicates_skipped.
   {% enddispatch_agent %}

4. **Post**:

   {% dispatch_agent "rp1-dev:pr-comment-poster" %}
   Post PR review to GitHub.
     OWNER: {{CI_CONTEXT.owner}}
     REPO: {{CI_CONTEXT.repo}}
     PR_NUMBER: {{CI_CONTEXT.pr_number}}
     DEDUP_OUTPUT: {{stringify(dedup_output)}}
     CONFIG: {% raw %}{{stringify({verdict: config.verdict, bot_marker: config.bot_marker, max_comments: config.max_comments, add_comments: config.add_comments})}}{% endraw %}
     VISUAL_CONTENT: {{VISUAL_CONTENT or ""}}
     FINDINGS_SUMMARY: {% raw %}{{stringify({critical: N, high: N, medium: N, low: N, total: N})}}{% endraw %}
     Return JSON with success, review, reactions, replies, summary, errors.
   {% enddispatch_agent %}

5. Parse: `REVIEW_URL`, `COMMENTS_POSTED`, `REACTIONS_ADDED`, `POSTING_ERRORS`

### Final Output

1. If `STASHED=true`: `git stash pop`

2. **CI Mode**:
   ```
   {{EMOJI}} PR Review Complete (CI Mode)

   Judgment: {{JUDGMENT}}
   {{RATIONALE}}

   Findings: Critical={{critical}}, High={{high}}, Medium={{medium}}, Low={{low}}

   GitHub Review: {{REVIEW_URL}}
   Comments Posted: {{COMMENTS_POSTED}}
   Duplicates Skipped: {{dedup_output.duplicates_skipped}}
   Reactions Added: {{REACTIONS_ADDED}}
   {{IF POSTING_ERRORS}}Errors: {{POSTING_ERRORS}}{{/IF}}

   Local Report: {{REPORT_PATH}}
   ```

3. **Local Mode**:
   ```
   {{EMOJI}} PR Review Complete

   Judgment: {{JUDGMENT}}
   {{RATIONALE}}

   Findings: Critical={{critical}}, High={{high}}, Medium={{medium}}, Low={{low}}

   Report: {{REPORT_PATH}}
   {{IF STASHED}}Restored stashed changes{{/IF}}
   ```

Emoji: approve->check, request_changes->warning, block->stop

§ERR

| Error | Action |
|-------|--------|
| CI not enabled | Exit w/ config instructions |
| Draft PR skipped | Exit w/ message |
| Dirty git (local) | Prompt stash/abort |
| Unknown branch | Ask user (local) or fail (CI) |
| gh unavailable | git-only mode |
| Visual fails | Continue w/o (non-blocking) |
| Splitter fails | Abort w/ error |
| >50% reviewers fail | Abort |
| Synthesizer fails | Findings-only judgment |
| Reporter fails | Inline output |
| fetch-comments fails | Skip P5, warn |
| Deduplicator fails | Post all (no dedup) |
| Poster fails | Output error, report still generated |

§OUT

- Internal work in `<thinking>` tags
- NO verbose phase progress
- Output ONLY: initial status, brief progress if >30s, final summary w/ report path
- CI mode: include GitHub review URL
