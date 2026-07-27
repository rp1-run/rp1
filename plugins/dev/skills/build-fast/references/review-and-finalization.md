# Review and Finalization

Optional review pass (§PHASE-3, gated on REVIEW) and finalization
(§PHASE-4: cleanup manifest, comment cleanup, push, post-implementation
checkpoint). Load once the build phase completes.

## §PHASE-3: Review (Optional)

**Skip if**: `REVIEW=false`

### §3.1 Task Review

**You MUST use `subagent_type: rp1-dev:task-reviewer`** — do not use `general-purpose` or any other agent type.

{% dispatch_agent "rp1-dev:task-reviewer" %}
KB_ROOT={kbRoot}
WORK_ROOT={workRoot}
CODE_ROOT={codeRoot}
QUICK_BUILD_PATH={workRoot}/{artifact_relative_path}
TASK_IDS={task_ids}
GIT_COMMIT={GIT_COMMIT}
WORKFLOW=build-fast
RUN_ID={RUN_ID}
{% enddispatch_agent %}

**Parse response**: Extract `status` (SUCCESS or FAILURE).

### §3.2 Retry on Failure

If `status` = "FAILURE":

1. Extract `issues` and `summary` from reviewer response
2. Re-spawn task-builder with feedback. If `GIT_COMMIT=true`, set `REWRITE_COMMITS=true` so the builder can amend the prior commit into proper atomic format:

{% dispatch_agent "rp1-dev:task-builder" %}
KB_ROOT={kbRoot}
WORK_ROOT={workRoot}
CODE_ROOT={codeRoot}
QUICK_BUILD_PATH={workRoot}/{artifact_relative_path}
TASK_IDS={task_ids}
GIT_COMMIT={GIT_COMMIT}
REWRITE_COMMITS=true
PREVIOUS_FEEDBACK={reviewer summary and issues}
WORKFLOW=build-fast
RUN_ID={RUN_ID}
{% enddispatch_agent %}

3. Do NOT retry reviewer after retry builder (max 1 retry total)

## §PHASE-4: Finalization

**Phase handoff rule**: After §PHASE-3 completes successfully, do not register artifacts, do not emit final output, and do not stop. First generate the cleanup manifest and run manifest-gated cleanup, then evaluate §4.4. When `AFK=false` AND `CONFIRM_PLAN=true`, the post-implementation checkpoint in §4.4 must run before §OUTPUT.

### §4.1 Cleanup Manifest Generation

After implementation and optional review finish, generate the durable cleanup handoff:

```bash
rp1 agent-tools change-manifest generate \
  --code-root "{codeRoot}" \
  --out "{workRoot}/quick-builds/{RUN_ID}-change-manifest-001.json" \
  --status-out "{workRoot}/quick-builds/{RUN_ID}-change-manifest-status.json" \
  --source build-fast \
  --baseline "{workRoot}/quick-builds/{RUN_ID}-change-manifest-baseline.json"
```

Parse the `ToolResult` envelope into `cleanup_manifest_result`.

- If `data.status == "created"` and `data.files > 0` and `data.ownedLineCount > 0`, dispatch `comment-cleaner` with `data.manifestPath` and `{codeRoot}`.
- If `data.status == "skipped"`, keep `data.statusPath` and `data.skipReason` for final output. Do not ask `comment-cleaner` to infer scope.
- If the tool fails or returns malformed output, set `cleanup_manifest_result` to a skipped warning with `skipReason: "change_manifest_generate_failed"`, `files: 0`, `ownedLineCount: 0`, and `statusPath: "{workRoot}/quick-builds/{RUN_ID}-change-manifest-status.json"`.

### §4.2 Comment Cleanup

If `cleanup_manifest_result` is created and non-empty:

{% dispatch_agent "rp1-dev:comment-cleaner" %}
CHANGE_MANIFEST={cleanup_manifest_result.data.manifestPath}, CODE_ROOT={codeRoot}
{% enddispatch_agent %}

Otherwise set the `comment_cleaner` result yourself:

```json
{
  "status": "WARN",
  "files_checked": 0,
  "manifest_path": null,
  "manifest_status_path": "{cleanup_manifest_result.data.statusPath}",
  "skip_reason": "{cleanup_manifest_result.data.skipReason}",
  "message": "Automatic comment cleanup skipped because no non-empty generated manifest was available."
}
```

Do not dispatch comment-cleaner with branch, unstaged, commit-range, base-branch, mode, or commit parameters; the generated manifest is the only safe cleanup boundary.

### §4.3 Push (Conditional)

**Skip if**: `GIT_PUSH=false`

```bash
git push -u origin {branch}
```

**Non-serializing when push is skipped**: When `GIT_PUSH=false`, §4.4 and §OUTPUT proceed immediately -- there is no push to wait for. The post-implementation checkpoint emit and artifact registration emit are independent of push and do not serialize behind it.

### §4.4 Post-Implementation Checkpoint

**SKIP ENTIRELY if**: `AFK=true` OR `CONFIRM_PLAN=false`

When skipped: Do NOT prompt the user. Proceed directly to §OUTPUT.

**Interactive confirm mode rule**: When `AFK=false` AND `CONFIRM_PLAN=true`, this checkpoint is REQUIRED. Before entering §OUTPUT, you must complete both actions below in order:
1. Emit `waiting_for_user` for the post-implementation gate
2. Call `ask_user` and wait for the answer

The `waiting_for_user` emit does not replace the `ask_user` call. Continuing to §OUTPUT without both is an invalid workflow transition.
The next action after manifest-gated cleanup must be this checkpoint when interactive confirm mode is active.
Do not emit `artifact_registered` for the build step before this checkpoint completes.

Emit waiting status so the Arcade dashboard reflects the gate pause:

```bash
rp1 agent-tools emit \
  --workflow build-fast \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step build \
  --data '{"prompt": "Continue or make additional changes?", "context": "Post-implementation checkpoint after build phase"}'
```

Present the post-implementation checkpoint to the user:

## Implementation Complete

**Branch**: {branch}
**Artifact**: {artifact_path}

Review the changes.

**Mandatory checkpoint**: The very next action must be the `ask_user` call below. Do NOT continue to §OUTPUT until the user has answered. Do NOT skip this gate when `AFK=false` and `CONFIRM_PLAN=true`.

{% ask_user "Continue or make additional changes?", options: "Done", "Add/Edit", "Review feedback from Arcade" %}

**On "Add/Edit"**: Prompt for additional request, re-invoke §PHASE-2 with new request appended.
**On "Review feedback from Arcade"**: Load the `arcade-collab` skill (`/rp1-dev:arcade-collab`), then call `rp1 agent-tools feedback read --run-id {RUN_ID} --status open`. If feedback exists, process it per the collaboration loop in the skill. After all feedback is processed, return to this gate and re-present the same options.
**On "Done"**: Continue to output.

**Transition guard**: If `AFK=false` AND `CONFIRM_PLAN=true`, do not enter §OUTPUT unless this checkpoint produced both a `waiting_for_user` emit and an `ask_user` answer in the current run.
