---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/tasks.md"
producer: task-builder
type: section
description: "Implementation summary appended after a task line in tasks.md when the builder completes a task."
strictness: strict
---

    **Implementation Summary**:

    - **Files**: `{file1}`, `{file2}`
    - **Approach**: {Brief description of the implementation approach; keep it terse}
    - **Deviations**: None | {deviation + justification}
    - **Tests**: {X/Y passing}

    **Execution Flow**:

    ```mermaid
    stateDiagram-v2
        [*] --> {TASK_ID}_{description}
        {TASK_ID}_{description} --> [*]
    ```
