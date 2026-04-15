---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/requirements.md"
producer: feature-requirement-gatherer
type: document
description: "Requirements specification for a feature. Used during the requirements-gathering phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step requirements \
    --data '{"path": "features/{FEATURE_ID}/requirements.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
conditions:
  - "If AFK_MODE=true, append AFK Mode sections (see end of template)"
  - "If RUN_ID is non-empty, include rp1_run_id in YAML frontmatter"
---

---
rp1_run_id: {RUN_ID}
---
# Requirements Specification: [Feature Title]

**Feature ID**: {FEATURE_ID}
**Parent PRD**: [PRD Name](../../prds/prd-name.md) _(if associated)_
**Version**: 1.0.0
**Status**: Draft
**Created**: {Date}

## 1. Feature Overview
[One paragraph - business perspective]

## 2. Business Context
### 2.1 Problem Statement
### 2.2 Business Value
### 2.3 Success Metrics

## 3. Stakeholders & Users
### 3.1 User Types
### 3.2 Stakeholder Interests

## 4. Scope Definition
### 4.1 In Scope
### 4.2 Out of Scope
### 4.3 Assumptions

## 5. Functional Requirements
[REQ-ID format w/ priority, user type, requirement, rationale, acceptance criteria]

## 6. Non-Functional Requirements
### 6.1 Performance Expectations
### 6.2 Security Requirements
### 6.3 Usability Requirements
### 6.4 Compliance Requirements

## 7. User Stories
[STORY-ID format w/ As a/I want/So that + GIVEN/WHEN/THEN]

## 8. Business Rules

## 9. Dependencies & Constraints

## 10. Clarifications Log

---

## AFK Mode: Auto-Selected Defaults

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| {point} | {choice} | {why} |

## AFK Mode: Inferred Decisions

| Ambiguity | Resolution | Source |
|-----------|------------|--------|
| {vague term/gap} | {inference} | {KB/PRD/default} |
