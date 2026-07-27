# KB Validation

Staleness checks, missing-file handling, and format validation for the
knowledge base. Load when the validate step runs.

### 2. Validate KB

Confirm `{kbRoot}/state.json` exists.
If missing:
- Output:
  ```
  ERROR: Knowledge base not found.

  Run /rp1-base:knowledge-build, then retry.
  ```
- Transition to `failed`
- STOP

Read `{kbRoot}/state.json`.
Extract:
- `generated_at`
- `git_commit`

If `git_commit` missing or empty:
- Output:
  ```
  ERROR: Invalid KB state.

  state.json is missing git_commit.
  Run /rp1-base:knowledge-build, then retry.
  ```
- Transition to `failed`
- STOP

Verify the commit exists:
```bash
git cat-file -e {KB_GIT_COMMIT}^{commit} 2>/dev/null || echo "INVALID"
```

If output is `INVALID`:
- Output:
  ```
  ERROR: KB references unknown git commit.

  Run /rp1-base:knowledge-build, then retry.
  ```
- Transition to `failed`
- STOP

Compute:
```bash
git rev-parse HEAD
git rev-list --count {KB_GIT_COMMIT}..HEAD
```

Store:
- `HEAD_COMMIT`
- `COMMITS_SINCE_KB`

Compute repo changes since KB build:
```bash
git diff --name-only {KB_GIT_COMMIT} HEAD
```

Derive `STALE_CHANGES`:
- Start with the diff list above
- Drop generated or ignored paths from §1
- Drop `.rp1/work/**`
- Drop any path present in `DOC_FILES`
- Treat all remaining paths as KB-affecting changes for this workflow

Build:
```json
{
  "state": "current",
  "generated_at": "ISO-8601 timestamp",
  "git_commit": "commit sha",
  "head_commit": "commit sha",
  "commits_behind": 0,
  "stale_paths": []
}
```

Rules:
- `state = "current"` when `STALE_CHANGES` is empty
- `state = "stale"` when `STALE_CHANGES` is non-empty
- `commits_behind = COMMITS_SINCE_KB`
- `stale_paths = STALE_CHANGES`

This filter is intentionally strict about non-doc-output changes and intentionally permissive about changes inside `DOC_FILES`; those docs are the workflow outputs being reconciled.

If `STALE_CHANGES` is empty:
- Output:
  ```
  KB sync verified
    Commit: {KB_GIT_COMMIT}
    Built:  {generated_at}
  ```
- Continue to scan

If `STALE_CHANGES` is non-empty:
- Output:
  ```
  WARNING: Knowledge base is out of sync for this workflow.

  KB Generated: {generated_at}
  KB Commit:    {KB_GIT_COMMIT}
  Current HEAD: {HEAD_COMMIT}
  Behind by:    {COMMITS_SINCE_KB} commits

  KB-affecting changes since KB build (showing up to 30):
  {first 30 stale paths}
  ```
- Emit the stale-KB gate:
  ```bash
  rp1 agent-tools emit \
    --workflow generate-user-docs \
    --type waiting_for_user \
    --run-id {RUN_ID} \
    --step stale_kb_gate \
    --data '{"prompt": "Knowledge base is stale. Continue with the stale KB, rebuild the KB first, or cancel?", "context": "KB is {COMMITS_SINCE_KB} commits behind HEAD with {STALE_CHANGES.length} KB-affecting changed paths"}'
  ```
- Present the gate using the standard Liquid prompt syntax:
  `KB_DECISION = {% ask_user "Knowledge base is stale. Continue with the stale KB, rebuild the KB first, or cancel?", options: "Continue with stale KB", "Rebuild KB first", "Cancel" %}`
- If `KB_DECISION == "Continue with stale KB"`:
  - Output:
    ```
    Proceeding with a stale KB by user choice.

    KB is {COMMITS_SINCE_KB} commits behind HEAD.
    ```
  - Continue to scan
- If `KB_DECISION == "Rebuild KB first"`:
  - Output:
    ```
    Documentation update stopped before scan.

    Rebuild the KB with /rp1-base:knowledge-build, then re-run this command.
    ```
  - End the run explicitly:
    ```bash
    rp1 agent-tools emit end-run \
      --run-id {RUN_ID} \
      --outcome cancelled \
      --reason "User chose to rebuild the KB before scanning docs"
    ```
  - STOP
- If `KB_DECISION == "Cancel"`:
  - Output:
    ```
    Documentation update cancelled before scan.

    KB is stale by {COMMITS_SINCE_KB} commits.
    ```
  - End the run explicitly:
    ```bash
    rp1 agent-tools emit end-run \
      --run-id {RUN_ID} \
      --outcome cancelled \
      --reason "User cancelled docs sync at the stale KB gate"
    ```
  - STOP
