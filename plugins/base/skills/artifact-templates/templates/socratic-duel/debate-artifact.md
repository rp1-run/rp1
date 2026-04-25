---
scope: workRoot
path_pattern: "debates/{YYYY-MM-DD}-{TOPIC_SLUG}{UNIQUE_SUFFIX}.md"
producer: socratic-duel
type: document
description: "Standalone Markdown debate artifact created by Socratic Duel. Path uses the local date, topic slug, and an optional uniqueness suffix."
strictness: flexible
emit_hint: |
  rp1 agent-tools emit \
    --workflow {WORKFLOW} \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step {STEP} \
    --data '{"path": "debates/{DEBATE_FILENAME}", "feature": "socratic-duel", "storageRoot": "work_dir", "type": "markdown"}'
---

# Socratic Duel: {TOPIC}

**Source Document**: `{SOURCE_PATH}`
**Source Link**: {SOURCE_MARKDOWN_LINK}
**Status**: {STATUS}
**Created**: {CREATED_AT}

## Metadata

| Field | Value |
|-------|-------|
| Duel ID | `{DUEL_ID}` |
| Source Path | `{SOURCE_PATH}` |
| Topic | {TOPIC} |
| Topic Slug | `{TOPIC_SLUG}` |
| Max Turns | {MAX_TURNS} |
| Status | {STATUS} |
| Candidate Convergence | {CANDIDATE_CONVERGENCE} |

## Participants

| Participant | Harness | Model | Joined |
|-------------|---------|-------|--------|
{PARTICIPANT_ROWS}

## Turns

{TURN_SECTIONS}

### Turn {TURN_NUMBER}: {PARTICIPANT_NAME}

**Position**: {POSITION}
**Counterpoint**: {COUNTERPOINT}
**Agreement**: {AGREEMENT}
**Novel Argument**: {NOVEL_ARGUMENT}
**Unresolved Item**: {UNRESOLVED_ITEM}
**Stance**: {STANCE}
**Evidence**:
- `{SOURCE_REFERENCE}` - {EVIDENCE_SUMMARY}

## Terminal Conclusion

**Outcome**: {TERMINAL_OUTCOME}
**Closed At**: {CLOSED_AT}
**Candidate Convergence**: {FINAL_CANDIDATE_CONVERGENCE}
**Reason**: {TERMINAL_REASON}

Terminal outcome must be one of `ACCEPTED_CONSENSUS`, `DISSENT`, `MAX_TURNS`, `TIMEOUT`, or `INVALIDATED`.

{CONCLUSION}
