---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/tasks.md"
producer: feature-tasker
type: document
description: "Development task list for a feature (small scope). Used during the task-planning phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step tasks \
    --data '{"path": "features/{FEATURE_ID}/tasks.md", "feature": "{FEATURE_ID}", "subflow": true, "storageRoot": "work_dir"}'
conditions:
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "Include Implementation DAG section only if DAG exists in design.md"
  - "Include User Docs section only if DOC_IMPACTS found in design.md"
---

---
rp1_run_id: {RUN_ID}
---
# Development Tasks: [Feature Name]

**Feature ID**: {FEATURE_ID}
**Status**: Not Started
**Progress**: 0% (0 of {X} tasks)
**Estimated Effort**: {X} days
**Started**: {Date}

## Overview
[Brief from design]

## Implementation DAG
[Copy from design.md if DAG_STATE exists; omit section if null]

## Task Subflow

```mermaid
stateDiagram-v2
    [*] --> T1
    T1 : T1 description
    T1 --> T2
    T2 : T2 description
    T2 --> [*]
```

## Task Breakdown

### [Category per parallel group]

- [ ] **T{N}**: {Description} `[complexity:simple|medium|complex]`

    **Reference**: [design.md#section](design.md#section)

    **Effort**: {X hours}

    **Acceptance Criteria**:

    - [ ] {Criterion}

### User Docs

- [ ] **TD{N}**: {Action} {Target} - {Section} `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: {add|edit|remove}

    **Target**: {path}

    **Section**: {name}

    **KB Source**: {kb_file:anchor|-}

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] {Criterion}

## Acceptance Criteria Checklist
[All from requirements.md w/ checkboxes]

## Definition of Done
- [ ] All tasks completed
- [ ] All AC verified
- [ ] Code reviewed
- [ ] Docs updated
