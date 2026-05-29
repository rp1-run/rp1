---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/design.md"
producer: feature-architect
type: document
description: "Concise technical design for a feature. Used during the planning phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step planning \
    --data '{"path": "features/{FEATURE_ID}/design.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "Include Implementation DAG section only for 2+ implementation components"
  - "Use only diagrams that clarify the design"
  - "If AFK_MODE=true, append AFK Mode section to design-decisions.md"
---

---
rp1_run_id: {RUN_ID}
---
# Design: [Feature Title]

**Feature ID**: {FEATURE_ID}
**Version**: 1.0.0
**Status**: Draft
**Created**: {Date}

## Summary
[One paragraph: chosen approach, key tradeoff, expected outcome]

## Architecture
[Component/sequence/data diagrams only where they reduce ambiguity]

## Contracts
| Contract | Producer | Consumer | Required Fields Or Outputs |
|----------|----------|----------|----------------------------|
| {name} | {component} | {component} | {fields/artifacts/statuses} |

## Component Plan

| # | Component | Description | Files Changed |
|---|-----------|-------------|---------------|
| T{N} | {name} | {description} | {files} |

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3] - {reason tasks are parallel}
2. [T4, T5] - {reason}

**Dependencies**:

- T4 -> T1 ({reason}: {detail})

**Critical Path**: T1 -> T4 -> T6

## Validation Plan

| Behavior Or Contract | Failure Mode Covered | Test Type | Evidence Or Command |
|----------------------|----------------------|-----------|---------------------|
| {behavior_or_contract} | {failure_mode} | {unit/integration/e2e} | {command_or_evidence} |

## Documentation Impact

| Type | Target | Section | KB Source | Rationale |
|------|--------|---------|-----------|-----------|
| add/edit/remove | {path/file.md} | {section} | {kb_file}:{anchor} | {reason} |

## Open Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| {risk} | LOW/MEDIUM/HIGH | {mitigation} |
