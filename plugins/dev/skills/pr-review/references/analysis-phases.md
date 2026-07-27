# Analysis Phases

Conditional visual generation (P0.5) and the map-reduce phases P1 splitting,
P2 detailed analysis, P3 synthesis, P4 reporting, and P5 comment posting.
Load after P0 resolves the target and intent.

### P0.5: Visual Gen (Conditional)

**Skip conditions** (any true -> skip):
- `SKIP_VISUAL == true`
- `config.visualize == false`

**Spawn** (if not skipped):
Background mode: local=true, CI=false

First, register visual generation as a subflow under `reviewing` and mark it running:
```bash
rp1 agent-tools emit \
  --workflow pr-review \
  --type subflow_registered \
  --run-id {RUN_ID} \
  --step reviewing \
  --data '{"parentStepId":"reviewing","subflowName":"visual-generation","diagram":"flowchart TD\n  A[Start] --> B[Generate Visuals]\n  B --> C[Return Markdown]"}'

rp1 agent-tools emit \
  --workflow pr-review \
  --type status_change \
  --run-id {RUN_ID} \
  --step reviewing \
  --unit visual-generation \
  --data '{"status":"running"}'
```

{% dispatch_agent "rp1-dev:pr-visualizer" %}
Generate PR visualization.
  PR_BRANCH: {{pr_branch}}
  BASE_BRANCH: {{base_branch}}
  REVIEW_DEPTH: quick
  STANDALONE: false
  KB_ROOT: {kbRoot}
  WORK_ROOT: {workRoot}
{% enddispatch_agent %}

Capture `VISUAL_CONTENT` (raw markdown with Mermaid diagrams).

If the visualizer fails or returns unusable output:
- Emit `reviewing` / `visual-generation` with `{"status":"failed"}`
- Set `VISUAL_CONTENT=""`
- Continue to P1 without blocking the review

After the visualizer returns, mark the subflow unit completed:
```bash
rp1 agent-tools emit \
  --workflow pr-review \
  --type status_change \
  --run-id {RUN_ID} \
  --step reviewing \
  --unit visual-generation \
  --data '{"status":"completed"}'
```

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
     KB_ROOT: {kbRoot}
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
     KB_ROOT: {kbRoot}
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
     PR_INFO: {% raw %}{{stringify({branch, title, base, github_url: GITHUB_URL, head_sha: HEAD_SHA, reviewed_pr_url: REVIEWED_PR_URL})}}{% endraw %}
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
