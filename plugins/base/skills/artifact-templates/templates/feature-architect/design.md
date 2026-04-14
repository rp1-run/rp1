---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/design.md"
producer: feature-architect
type: document
description: "Technical design specification for a feature. Used during the design phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step design \
    --data '{"path": "features/{FEATURE_ID}/design.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "Include Implementation DAG section only for 2+ implementation components"
  - "Diagram selection varies by complexity: simple=Architecture only, API=+Sequence, data-heavy=+Data Model"
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

## 1. Design Overview
[High-level summary of technical approach]

[Architecture diagram: graph TB/LR]

## 2. Architecture
[Component and sequence diagrams as needed]

## 3. Detailed Design
[Subsections per component: data model if data changes, API contracts, key algorithms]

## 4. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| {layer} | {tech} | {why} |

## 5. Implementation Plan

| # | Component | Description | Files Changed |
|---|-----------|-------------|---------------|
| T{N} | {name} | {description} | {files} |

## 6. Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T3] - {reason tasks are parallel}
2. [T4, T5] - {reason}

**Dependencies**:

- T4 -> T1 ({reason}: {detail})

**Critical Path**: T1 -> T4 -> T6

## 7. Testing Strategy

### Test Value Assessment

| Valuable (design for) | Avoid (do NOT design for) |
|-----------------------|--------------------------|
| Business logic | Library behavior verification |
| Component integration | Framework feature validation |
| App-specific error handling | Language primitive testing |
| API contract verification | Third-party API behavior |

### Test Plan

| Test | Type | What it verifies |
|------|------|------------------|
| {name} | {unit/integration/e2e} | {description} |

## 8. Deployment Design
[Deployment steps, migration path, rollback plan]

## 9. Documentation Impact

| Type | Target | Section | KB Source | Rationale |
|------|--------|---------|-----------|-----------|
| add/edit/remove | {path/file.md} | {section} | {kb_file}:{anchor} | {reason} |

## 10. Design Decisions Log

| ID | Decision | Choice | Rationale | Alternatives Considered |
|----|----------|--------|-----------|------------------------|
| D1 | {decision} | {choice} | {why} | {alternatives} |
