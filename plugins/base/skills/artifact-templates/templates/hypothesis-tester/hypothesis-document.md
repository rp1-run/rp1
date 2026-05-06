---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/hypotheses.md"
producer: hypothesis-tester
type: document
description: "Hypothesis document for validating design assumptions. Created by feature-architect, updated by hypothesis-tester."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step planning \
    --data '{"path": "features/{FEATURE_ID}/hypotheses.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
---

# Hypothesis Document: {FEATURE_ID}
**Version**: 1.0.0 | **Created**: {timestamp} | **Status**: PENDING

## Hypotheses

### HYP-001: {Title}
**Risk Level**: HIGH|MEDIUM|LOW
**Status**: PENDING
**Statement**: {assumption to validate}
**Context**: {design relevance}
**Validation Criteria**:
- CONFIRM if: {criteria}
- REJECT if: {criteria}
**Suggested Method**: CODE_EXPERIMENT|CODEBASE_ANALYSIS|EXTERNAL_RESEARCH

## Validation Findings

### HYP-001 Findings
**Validated**: {ISO timestamp}
**Method**: {method}
**Result**: CONFIRMED|REJECTED

**Evidence**:
{detailed evidence}

**Sources**:
- {file:line or URLs}

**Implications for Design**:
{design impact}

## Summary

| Hypothesis | Risk | Result | Implication |
|------------|------|--------|-------------|
| HYP-001 | {HIGH} | {CONFIRMED} | {brief} |
