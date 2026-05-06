---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/build-readiness.md"
producer: build-verify-aggregator
type: document
description: "Final /build readiness artifact aggregating validation envelopes before release."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step build-verify-aggregator:completed \
    --data '{"path": "features/{FEATURE_ID}/build-readiness.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "Lead with readiness status, blockers, warnings, manual items, and requirement evidence"
  - "Status MUST be PASS, WARN, FAIL, or WAITING"
  - "Include every required validation component, even when missing or failed"
---

# Build Readiness: [Feature Title]

**Feature ID**: {FEATURE_ID}
**Generated**: {timestamp}
**Status**: PASS | WARN | FAIL | WAITING

## Decision
- **Release Behavior**: proceed | proceed_with_notes | return_to_implementation | wait_for_human
- **Blocking Issues**: {count}
- **Warnings**: {count}
- **Manual Items**: {count}

## Blocking Issues
| Source | Issue | Evidence | Required Action |
|--------|-------|----------|-----------------|
| code-checker/feature-verifier/comment-cleaner | {issue} | `{artifact_or_file}` | {action} |

## Non-Blocking Notes
| Source | Note | Evidence |
|--------|------|----------|
| {source} | {note} | `{artifact_or_file}` |

## Manual Verification
| Item | Requirement | Reason | Required Evidence |
|------|-------------|--------|-------------------|
| {item} | REQ-{NNN} | {reason} | {manual evidence} |

## Requirement Evidence
| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-{NNN} | satisfied/blocked/not_applicable/manual | `{artifact_or_file}` |

## Validation Components
| Component | Status | Artifact | Notes |
|-----------|--------|----------|-------|
| code-checker | PASS/WARN/FAIL/WAITING/MISSING | `{path}` | {notes} |
| feature-verifier | PASS/WARN/FAIL/WAITING/MISSING | `{path}` | {notes} |
| comment-cleaner | PASS/WARN/FAIL/WAITING/MISSING | `{path}` | {notes} |
