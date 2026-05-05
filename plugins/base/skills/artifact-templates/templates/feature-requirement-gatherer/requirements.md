---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/requirements.md"
producer: feature-requirement-gatherer
type: document
description: "Concise requirements specification for a feature. Used during the requirements phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step requirements \
    --data '{"path": "features/{FEATURE_ID}/requirements.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "If AFK_MODE=true, include AFK Decisions"
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
  - "If phase context is resolved from PHASE_PLAN_PATH + PHASE_ID, include Planning Traceability; otherwise omit it"
---

---
rp1_run_id: {RUN_ID}
---
# Requirements: [Feature Title]

**Feature ID**: {FEATURE_ID}
**Parent PRD**: [PRD Name](../../prds/prd-name.md) _(if associated)_
**Version**: 1.0.0
**Status**: Draft
**Created**: {Date}

## Summary
- **Problem**: [1-2 sentences]
- **Outcome**: [What must be true when complete]
- **Success Signals**: [Observable signals or metrics]

## Scope
### In
- [Included capability, behavior, or surface]

### Out
- [Explicit non-goal]

## Requirements
### REQ-001: [Requirement Title]
- **Priority**: Must Have | Should Have | Could Have
- **Actor**: [User or maintainer role]
- **Need**: [Required behavior]
- **Rationale**: [Why it matters]
- **Acceptance Criteria**:
  - [ ] GIVEN [context], WHEN [action], THEN [observable result]
- **Evidence Needed**: [Code path, artifact, test, or manual verification expected]

## Constraints
| Type | Constraint | Source |
|------|------------|--------|
| performance/security/usability/compliance/dependency | [constraint] | [source] |

## Assumptions And Questions
| Type | Item | Decision Or Owner |
|------|------|-------------------|
| assumption | [assumption] | [validated/needs validation] |
| open question | [question] | [owner or gate] |

## Planning Traceability
| Field | Value |
|-------|-------|
| Source Artifact Title | {PLANNING_SOURCE_TITLE} |
| Source Artifact Path | `{PLANNING_SOURCE_PATH}` |
| Parent Phase ID | {PHASE_ID} |
| Parent Phase Title | {PHASE_TITLE} |
| Manual Verification Expected | {PHASE_MANUAL_VERIFICATION_EXPECTED} |
| Recommended Next Step | `{PHASE_RECOMMENDED_NEXT_STEP}` |

## AFK Decisions
| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| {decision} | {choice} | {KB/PRD/default} | {why} |
