# PR Review -- Link Artifact Registration

Reference companion for `pr-review/SKILL.md`. Contains the reusable external link artifact registration pattern and its PR review binding.

**Load condition**: During finalization phase, after P4 reporting completes.

## Reusable External Link Artifact Registration Pattern

Use this insertable block in any orchestrator that has a curated external URL and a report artifact containing the matching `External Links` row. Replace every placeholder with workflow-specific values before use:

| Placeholder | Replace with |
|-------------|--------------|
| `{WORKFLOW_NAME}` | Workflow name passed to `--workflow` |
| `{RUN_ID}` | Current tracked run ID |
| `{STEP_NAME}` | Completion or artifact-registration step for the workflow |
| `{LINK_URL}` | Canonical `http` or `https` URL from structured workflow state |
| `{LINK_LABEL}` | Human label shown in artifact lists and reports |
| `{LINK_RELATIONSHIP}` | Stable relationship key such as `reviewed_pr` |
| `{SOURCE_CONTEXT}` | Short description of how the workflow resolved the link |
| `{SOURCE_ARTIFACT_PATH}` | Report path containing the matching `External Links` row |
| `{FEATURE_OR_UNIT_ID}` | Workflow-specific artifact grouping value |

```bash
rp1 agent-tools emit \
  --workflow {WORKFLOW_NAME} \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step {STEP_NAME} \
  --data '{"locationKind":"url","type":"link","storageRoot":"work_dir","url":"{LINK_URL}","label":"{LINK_LABEL}","relationship":"{LINK_RELATIONSHIP}","sourceContext":"{SOURCE_CONTEXT}","sourceArtifactPath":"{SOURCE_ARTIFACT_PATH}","feature":"{FEATURE_OR_UNIT_ID}"}'
```

- Collect link values from explicit workflow state, not by scanning generated markdown for URLs.
- Register only curated links that the workflow binds to the generic placeholders.
- Register after the report artifact exists and after optional external side effects are complete or skipped.
- Skip the emit entirely when `{LINK_URL}` is empty.
- If link artifact registration fails, warn and continue; the generated report and final summary remain the durable workflow output.

## PR Review Binding

PR review is the first concrete use of the reusable block. Apply exactly these substitutions:

| Generic placeholder | PR review value |
|---------------------|-----------------|
| `{WORKFLOW_NAME}` | `pr-review` |
| `{RUN_ID}` | `{RUN_ID}` |
| `{STEP_NAME}` | `posting` |
| `{LINK_URL}` | `{REVIEWED_PR_URL}` |
| `{LINK_LABEL}` | `Reviewed PR` |
| `{LINK_RELATIONSHIP}` | `reviewed_pr` |
| `{SOURCE_CONTEXT}` | `PR review input resolution` |
| `{SOURCE_ARTIFACT_PATH}` | `{REPORT_PATH}` |
| `{FEATURE_OR_UNIT_ID}` | `{review_id}` |

After markdown report registration and after CI comment posting is complete or skipped, register the reviewed PR URL as a non-blocking external link artifact when `REVIEWED_PR_URL` is known:

```bash
rp1 agent-tools emit \
  --workflow pr-review \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step posting \
  --data '{"locationKind":"url","type":"link","storageRoot":"work_dir","url":"{REVIEWED_PR_URL}","label":"Reviewed PR","relationship":"reviewed_pr","sourceContext":"PR review input resolution","sourceArtifactPath":"{REPORT_PATH}","feature":"{review_id}"}'
```

- Skip this emit entirely when `REVIEWED_PR_URL` is empty.
- If link artifact registration fails, warn and continue; the markdown report and final summary remain the durable review output.
- Do not register posted GitHub review URLs, code-line links, evidence links, related links, or URLs discovered in generated markdown as first-iteration external link artifacts.
