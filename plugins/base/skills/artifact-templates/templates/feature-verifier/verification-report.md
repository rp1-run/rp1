---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/feature_verification_{N}.md"
producer: feature-verifier
type: document
description: "Feature verification report validating acceptance criteria against implementation. Generated during verify phase of /build."
strictness: strict
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step feature-verifier:completed \
    --data '{"path": "features/{FEATURE_ID}/feature_verification_{N}.md", "feature": "{FEATURE_ID}", "storageRoot": "work_dir"}'
---

# Feature Verification Report #{N}

**Generated**: {timestamp}
**Feature ID**: {FEATURE_ID}
**Verification Scope**: {test_scope}
**KB Context**: {Loaded | Not loaded}
**Field Notes**: {Available | Not available}

## Executive Summary
- Overall Status: {VERIFIED | PARTIAL | NOT VERIFIED}
- Acceptance Criteria: {verified_count}/{total_count} verified ({percentage}%)
- Implementation Quality: {HIGH | MEDIUM | LOW}
- Ready for Merge: {YES | NO}

## Field Notes Context
**Field Notes Available**: {Yes | No}

### Documented Deviations
{List deviations documented in field-notes.md, or "None"}

### Undocumented Deviations
{List deviations NOT documented -- require attention, or "None found"}

## Acceptance Criteria Verification

### REQ-{NNN}: {requirement_title}
**AC-{NNN}**: {acceptance_criterion_description}
- Status: {VERIFIED | PARTIAL | NOT VERIFIED | INTENTIONAL DEVIATION}
- Implementation: {file_path}:{line_numbers} - {function/method_name}
- Evidence: {specific_code_evidence_or_explanation}
- Field Notes: {reference to relevant field note if applicable, or "N/A"}
- Issues: {any_problems_found}

## Implementation Gap Analysis
### Missing Implementations
- {list_of_unimplemented_criteria}

### Partial Implementations
- {list_of_partially_implemented_criteria_with_specific_gaps}

### Implementation Issues
- {list_of_incorrectly_implemented_criteria}

## Code Quality Assessment
{analysis_of_implementation_quality_patterns_and_consistency}

## Recommendations
1. {specific_actionable_recommendation}

## Verification Evidence
{detailed_code_references_and_snippets_supporting_the_verification_status}
