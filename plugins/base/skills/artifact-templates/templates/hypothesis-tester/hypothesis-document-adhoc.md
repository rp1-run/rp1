---
scope: workRoot
path_pattern: "hypotheses/{YYYY-MM-DD}-{SLUG}[-{N}].md"
producer: hypothesis-tester
type: document
description: "Ad-hoc hypothesis document for validating standalone scenarios without a feature context. Created and updated by hypothesis-tester in ad-hoc mode. Optional [-{N}] suffix resolves same-day slug collisions."
strictness: strict
emit_hint: |
  # Skip if WORKFLOW is empty (standalone invocation).
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step hypothesis-tester:testing \
    --data '{"path": "hypotheses/{RESOLVED_FILENAME}", "storageRoot": "work_dir"}'
---

# Hypothesis Document: {SLUG}
**Version**: 1.0.0 | **Created**: {timestamp} | **Status**: PENDING

## Scenario
{HYPOTHESIS description}

## Hypotheses

### HYP-001: {Title derived from HYPOTHESIS}
**Risk Level**: MEDIUM
**Status**: PENDING
**Statement**: {assumption to validate}
**Context**: Ad-hoc validation
**Validation Criteria**:
- CONFIRM if: {criteria}
- REJECT if: {criteria}
**Suggested Method**: CODE_EXPERIMENT|CODEBASE_ANALYSIS|EXTERNAL_RESEARCH

## Validation Findings

### HYP-001 Findings
**Validated**: {ISO timestamp}
**Method**: {method}
**Result**: CONFIRMED|REJECTED
**Refutation Coverage**: complete|minor-gaps|partial|contradicted
**Safety Flags Resolved**: {list, or None}
**Safety Flags Unresolved**: {list, or None}

**Evidence**:
{detailed evidence}

**Sources**:
- {file:line or URLs}

**Implications**:
{implications}

## Summary

| Hypothesis | Risk | Result | Implication |
|------------|------|--------|-------------|
| HYP-001 | {MEDIUM} | {CONFIRMED} | {brief} |
