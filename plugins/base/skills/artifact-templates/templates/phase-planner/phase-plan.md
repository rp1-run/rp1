---
scope: workRoot
path_pattern: "{PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME}"
producer: phase-planner
type: document
description: "Authoritative phase-planning handoff for a PRD or oversized feature requirements source. Written by /phase-plan adjacent to the source artifact."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step publish \
    --data '{"path": "{PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME}", "storageRoot": "work_dir"}'
conditions:
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "If SOURCE_KIND=prd, resolve PHASE_PLAN_DIR to prds and PHASE_PLAN_FILENAME to {SOURCE_BASENAME}-phase-plan.md"
  - "If SOURCE_KIND=feature-requirements, resolve PHASE_PLAN_DIR to features/{FEATURE_ID} and PHASE_PLAN_FILENAME to phase-plan.md"
  - "Stable phase IDs use P1, P2, ... and appear consistently in summary rows, phase headings, child handoff commands, and traceability"
  - "Repeat the Phase Summary rows, Phase Details sections, Child Feature Handoff rows, and Delivery Mapping rows for every stable phase ID through P{PHASE_COUNT}"
  - "Child handoff rows default to type=feature; work-package is optional only when the slice is not an independent feature"
  - "When manual verification is not required, state Manual Verification Expected as No and Manual Checks as None"
  - "Initiative Framing section MUST capture the user-visible Problem, Current State, and Desired End-State for the whole initiative"
  - "Each Phase Details section MUST start with Problem Frame stating the sub-problem that phase addresses before Value Delivered / Risk Retired"
---

---
rp1_run_id: {RUN_ID}
source_path: {SOURCE_PATH}
source_kind: {SOURCE_KIND}
phase_count: {PHASE_COUNT}
plan_status: {PLAN_STATUS}
---
# Delivery Phase Plan: [Source Title]

**Source Title**: {SOURCE_TITLE}
**Source Path**: `{SOURCE_PATH}`
**Source Kind**: {SOURCE_KIND}
**Plan Status**: {PLAN_STATUS}
**Phase Count**: {PHASE_COUNT}
**Generated**: {Date}

## Overview
[Summarize the planning source, why phase decomposition is needed now, and the rule used to keep each phase as the smallest valuable or risk-reducing slice.]

## Initiative Framing

**Problem**: [User-visible problem this initiative solves]
**Current State**: [Today's workaround, gap, or absence]
**Desired End-State**: [User-visible "done" after all phases ship]

## Phase Summary

| Phase ID | Phase | Value Delivered / Risk Retired | Exit Criteria | Manual Verification Expected |
|----------|-------|--------------------------------|---------------|------------------------------|
| P1 | {Phase title} | {Value delivered or primary risk retired} | {Observable completion signal} | Yes / No |
| P2 | {Phase title} | {Value delivered or primary risk retired} | {Observable completion signal} | Yes / No |
| P{N} | {Phase title} | {Value delivered or primary risk retired} | {Observable completion signal} | Yes / No |

Repeat the `P{N}` row pattern once per additional phase (`P3`, `P4`, ...).

## Phase Details

### P1: [Phase Title]
**Problem Frame**: {Sub-problem this phase addresses}
**Value Delivered / Risk Retired**: {What this slice unlocks or de-risks}

**Included Now**:
- {Scope delivered in this phase}

**Deferred Scope**:
- {Explicitly deferred work}

**Exit Criteria**:
- {Observable readiness condition}

**Manual Verification Expected**: Yes / No

**Manual Checks**:
- {Human check or "None"}

**Child Feature Handoff**:

| Type | ID | Title | Scope | Recommended Next Step |
|------|----|-------|-------|-----------------------|
| feature | {FEATURE_ID} | {Child feature title} | {Independent execution scope} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P1` |
| work-package | {WORK_PACKAGE_ID} | {Optional work package title} | {Scoped follow-up when not a full feature} | `{manual follow-up or delegated execution path}` |

### P2: [Phase Title]
**Problem Frame**: {Sub-problem this phase addresses}
**Value Delivered / Risk Retired**: {What this slice unlocks or de-risks}

**Included Now**:
- {Scope delivered in this phase}

**Deferred Scope**:
- {Explicitly deferred work}

**Exit Criteria**:
- {Observable readiness condition}

**Manual Verification Expected**: Yes / No

**Manual Checks**:
- {Human check or "None"}

**Child Feature Handoff**:

| Type | ID | Title | Scope | Recommended Next Step |
|------|----|-------|-------|-----------------------|
| feature | {FEATURE_ID} | {Child feature title} | {Independent execution scope} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P2` |

### P{N}: [Phase Title]
**Problem Frame**: {Sub-problem this phase addresses}
**Value Delivered / Risk Retired**: {What this slice unlocks or de-risks}

**Included Now**:
- {Scope delivered in this phase}

**Deferred Scope**:
- {Explicitly deferred work}

**Exit Criteria**:
- {Observable readiness condition}

**Manual Verification Expected**: Yes / No

**Manual Checks**:
- {Human check or "None"}

**Child Feature Handoff**:

| Type | ID | Title | Scope | Recommended Next Step |
|------|----|-------|-------|-----------------------|
| feature | {FEATURE_ID} | {Child feature title} | {Independent execution scope} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P{N}` |
| work-package | {WORK_PACKAGE_ID} | {Optional work package title} | {Scoped follow-up when not a full feature} | `{manual follow-up or delegated execution path}` |

Repeat the `P{N}` section once per additional phase (`P3`, `P4`, ...).

## Delivery Mapping

| Phase ID | Child ID | Recommended Command | Notes |
|----------|----------|---------------------|-------|
| P1 | {FEATURE_ID} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P1` | {Why this is the right next step now} |
| P2 | {FEATURE_ID} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P2` | {Why this is the right next step now} |
| P{N} | {FEATURE_ID} | `/build {child-feature-request} PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P{N}` | {Why this is the right next step now} |

Repeat the `P{N}` row pattern once per additional phase (`P3`, `P4`, ...).

## Traceability

| Item | Value |
|------|-------|
| Source Title | {SOURCE_TITLE} |
| Source Path | `{SOURCE_PATH}` |
| Phase Plan Path | `{PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME}` |
| Stable Phase IDs | {PHASE_IDS} |
