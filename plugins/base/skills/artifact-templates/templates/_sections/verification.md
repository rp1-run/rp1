---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/tasks.md"
producer: task-reviewer
type: section
description: "Validation summary appended after a task's implementation summary in tasks.md when the reviewer verifies the builder's work."
strictness: strict
conditions:
  - "On SUCCESS: append Validation Summary table"
  - "On FAILURE: append Review Feedback block and unmark the task checkbox (change [x] back to [ ])"
---

## On SUCCESS

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS | N/A |
    | Commit | PASS | N/A |
    | Comments | PASS | N/A |

## On FAILURE

    **Review Feedback** (Attempt {N}):

    - **Status**: FAILURE
    - **Issues**:
      - [{dimension}] {Description of the issue}
    - **Guidance**: {Specific, actionable instructions for the retry builder}
