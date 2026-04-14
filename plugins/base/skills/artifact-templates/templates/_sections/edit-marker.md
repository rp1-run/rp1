---
scope: workRoot
path_pattern: "features/{FEATURE_ID}/requirements.md"
producer: feature-editor
type: section
description: "EDIT marker appended to requirements.md (and optionally design.md) when a mid-stream scope change is applied."
strictness: strict
---

---

## EDIT-{NNN}: {Title}

**Date**: {YYYY-MM-DD}
**Type**: REQUIREMENT_CHANGE | SCOPE_EXPANSION | SCOPE_REDUCTION | DISCOVERY | CONCERN | ASSUMPTION_CHANGE | PIVOT
**Status**: Applied

### Context
{Why this edit was needed -- one paragraph explaining the trigger and stakeholder decision}

### Change Summary
- **Section {X}**: {What changed -- be specific about added/modified/removed content}

### Impact Analysis
- **Completed Tasks Affected**: {List of task IDs that may need rework, or "None"}
- **In-Progress Tasks Affected**: {List of task IDs that need awareness, or "None"}
- **New Tasks Required**: {List of new tasks implied by the edit, or "None"}

### Related Sections
- {REQ-NNN reference, if applicable}
- {Design section reference, if applicable}

---
