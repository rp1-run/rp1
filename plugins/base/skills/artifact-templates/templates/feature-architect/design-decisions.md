---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/design-decisions.md"
producer: feature-architect
type: document
description: "Design decisions log for a feature. Written alongside design.md during the design phase."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step design \
    --data '{"path": "features/{FEATURE_ID}/design-decisions.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "If AFK_MODE=true, append AFK Mode section"
---

# Design Decisions: [Feature Title]

**Feature ID**: {FEATURE_ID}
**Created**: {Date}

## Decision Log

| ID | Decision | Choice | Rationale | Alternatives Considered |
|----|----------|--------|-----------|------------------------|
| D1 | {decision} | {choice} | {why} | {alternatives} |

---

## AFK Mode: Auto-Selected Technology Decisions

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| {decision} | {choice} | {KB/codebase/default} | {why} |
