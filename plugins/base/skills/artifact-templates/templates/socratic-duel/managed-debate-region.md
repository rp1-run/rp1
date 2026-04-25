---
scope: absolute
path_pattern: "{TARGET_PATH} (managed region)"
producer: socratic-duel
type: section
description: "Managed Markdown region inserted into a user-selected Socratic Duel target document."
strictness: flexible
---

<!-- rp1:socratic-duel:start id="{DUEL_ID}" -->
## Socratic Duel

**Status**: {STATUS}
**Target**: `{TARGET_PATH}`
**Max Turns**: {MAX_TURNS}
**Candidate Convergence**: {CANDIDATE_CONVERGENCE}

### Participants
| Participant | Harness | Model |
|-------------|---------|-------|
{PARTICIPANT_ROWS}

### Turns
{TURN_SECTIONS}

### Conclusion
{CONCLUSION}
<!-- rp1:socratic-duel:end -->
