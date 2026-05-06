---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/feature_verification_{N}.md"
producer: feature-verifier
type: document
description: "Acceptance-criteria verification report. Generated during implementation validation for /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step feature-verifier:completed \
    --data '{"path": "features/{FEATURE_ID}/feature_verification_{N}.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
---

# Feature Verification Report #{N}

**Generated**: {timestamp}
**Feature ID**: {FEATURE_ID}
**Verification Scope**: {test_scope}

## Summary
- **Status**: PASS | WARN | FAIL | WAITING
- **Acceptance Coverage**: {verified_count}/{total_count}
- **Blocking Issues**: {count}
- **Manual Items**: {count}

## Requirement Evidence

| Requirement | Acceptance Criterion | Status | Evidence | Issues |
|-------------|---------------------|--------|----------|--------|
| REQ-{NNN} | {criterion} | satisfied/blocked/not_applicable/manual | `{file}:{line}` or artifact | {issue or "-"} |

## Blocking Issues
- {issue with file/artifact reference, or "None"}

## Non-Blocking Notes
- {warning/deviation note, or "None"}

## Manual Verification Items
| Item | Requirement | Reason | Evidence Needed |
|------|-------------|--------|-----------------|
| {item} | REQ-{NNN} | {why automation cannot prove it} | {manual check} |

## Field Notes
| Deviation | Documented In | Action |
|-----------|---------------|--------|
| {deviation} | `field-notes.md` or "-" | accept/block/follow-up |
