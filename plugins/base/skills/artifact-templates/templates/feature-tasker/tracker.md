---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/tracker.md"
producer: feature-tasker
type: document
description: "Feature development tracker for large-scope features with milestones. Used when scope requires manual gates."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step tasks \
    --data '{"path": "features/{FEATURE_ID}/tracker.md", "feature": "{FEATURE_ID}", "subflow": true, "storageRoot": "work_dir"}'
conditions:
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "Each milestone-{N}.md also registered separately"
---

---
rp1_run_id: {RUN_ID}
---
# Feature Development Tracker: [Feature Name]

**Feature ID**: {FEATURE_ID}
**Total Milestones**: {N}
**Status**: Not Started
**Started**: {Date}
**Target Completion**: {Date}

## Overview
[Brief]

## Milestone Summary

| Milestone | Title | Status | Progress | Target |
|-----------|-------|--------|----------|--------|
| [M1](milestone-1.md) | {Title} | Not Started | 0% | {Date} |

## Task Subflow

```mermaid
stateDiagram-v2
    [*] --> M1
    M1 : Milestone 1
    M1 --> M2
    M2 : Milestone 2
    M2 --> [*]
```

## Acceptance Criteria Coverage
[All criteria w/ milestone mapping]

## Dependencies and Risks
[External deps, blockers]

---

## milestone-{N}.md (separate file)

# Milestone {N}: {Title}

**Status**: Not Started
**Progress**: 0% (0 of {X} tasks)
**Target Date**: {Date}

## Objectives
[What milestone accomplishes]

## Tasks

### [Category]

- [ ] **T{N}.{M}**: {Description} `[complexity:simple|medium|complex]`

    **Reference**: [design.md#section](design.md#section)

    **Effort**: {X hours}

    **Acceptance Criteria**:

    - [ ] {Criterion}

## Task Subflow

```mermaid
stateDiagram-v2
    [*] --> T1_1
    T1_1 : Task 1.1 description
    T1_1 --> T1_2
    T1_2 : Task 1.2 description
    T1_2 --> [*]
```

## Definition of Done
[Completion criteria]
