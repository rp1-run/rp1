---
name: arcade-collab
description: "Structured guidance for agents to read, classify, and act on user feedback (annotations and direct file edits) from the Arcade."
metadata:
  category: review
  is_workflow: false
  version: 1.0.0
  tags:
    - collaboration
    - feedback
    - workflow
  created: 2026-03-23
  updated: 2026-03-23
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-dev:feature-editor"
---

# Arcade Collaboration

Process user feedback from the Arcade: annotations and direct file edits. Follow the loop below exactly, then return control to the calling gate.

## 1. Read Feedback

Fetch all open feedback for the current run:

```bash
rp1 agent-tools feedback read --run-id {RUN_ID} --status open
```

Parse the JSON response. It contains:

- `annotations[]`: Open annotations with id, docId, artifactPath, content, anchor, status, author, replies, createdAt.
- `edits[]`: Pending file edits with docId, artifactPath, patch (unified diff).
- `summary`: Counts of totalAnnotations, totalEdits, and byArtifactType breakdown.

**If both `totalAnnotations` and `totalEdits` are zero**: No pending feedback. Return to the calling gate immediately. Do not produce any output about the feedback check.

## 2. Classify Feedback

Classify each feedback item by the artifact it targets:

| Artifact Pattern | Classification | Routing |
|------------------|---------------|---------|
| `requirements.md` | Requirements feedback | Spawn `feature-editor` agent |
| `design.md`, `design-decisions.md` | Design feedback | Spawn `feature-editor` agent |
| Code files (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, etc.) | Code feedback | Apply fix directly |
| Other files or unanchored annotations | General feedback | Incorporate into context, acknowledge |

For **annotations**: classify based on `artifactPath`. If `artifactPath` is null (unanchored), classify as General.

For **edits**: classify based on `artifactPath` in the edit record.

## 3. Sort by Dependency Order

Process feedback in this strict order:

1. **Requirements** feedback first (upstream changes may invalidate downstream artifacts)
2. **Design** feedback second
3. **Code** feedback third
4. **General** feedback last

Within each category, process annotations before edits.

## 4. Act on Each Item

### 4.1 Requirements and Design Feedback (Annotations)

Route to the `feature-editor` agent with the annotation content as the edit description:

{% dispatch_agent "rp1-dev:feature-editor" %}
FEATURE_ID: {FEATURE_ID}
EDIT_DESCRIPTION: {annotation content from the feedback item}
{% enddispatch_agent %}

After the agent completes, resolve the annotation with a reply describing what changed:

```bash
rp1 agent-tools feedback resolve {annotation_id} --reply "Updated {artifact}: {brief description of change}"
```

### 4.2 Requirements and Design Feedback (Edits)

When the user directly edited a requirements or design file:

1. Read the patch from the edit record to understand what the user changed.
2. Accept the edit to clear the baseline:
   ```bash
   rp1 agent-tools feedback accept-edit {doc_id}
   ```
3. If the edit to an upstream artifact (requirements) may affect downstream artifacts (design, code), route a cascading update through `feature-editor`:

   {% dispatch_agent "rp1-dev:feature-editor" %}
   FEATURE_ID: {FEATURE_ID}
   EDIT_DESCRIPTION: "User directly edited {artifactPath}. Changes: {summary of patch}. Propagate to downstream artifacts."
   {% enddispatch_agent %}

### 4.3 Code Feedback (Annotations)

Apply the fix directly based on the annotation content and anchor location:

1. Read the referenced file.
2. Apply the change the user requested.
3. Run relevant lint/format/test checks.
4. Resolve the annotation with a reply:
   ```bash
   rp1 agent-tools feedback resolve {annotation_id} --reply "Applied fix in {file}: {brief description}"
   ```

### 4.4 Code Feedback (Edits)

When the user directly edited a code file:

1. Read the patch to understand what changed.
2. Accept the edit:
   ```bash
   rp1 agent-tools feedback accept-edit {doc_id}
   ```
3. Run lint/format/test checks on the affected file to verify the edit does not break anything.

### 4.5 General Feedback (Annotations)

For unanchored or non-artifact-specific annotations:

1. Incorporate the feedback into your current working context.
2. Reply acknowledging the feedback and describing how it will be applied:
   ```bash
   rp1 agent-tools feedback reply {annotation_id} --content "Acknowledged: {brief description of how feedback will be incorporated}"
   ```
3. Do NOT resolve general annotations automatically. Leave them open for the user to close once satisfied.

## 5. Edge Cases

### No Feedback

If the read returns zero annotations and zero edits, return to the calling gate immediately without any output.

### Ambiguous Feedback

If an annotation is unclear or you cannot determine the intended action:

1. Reply asking for clarification:
   ```bash
   rp1 agent-tools feedback reply {annotation_id} --content "Could you clarify what change you'd like here? I see {what you observe} but I'm unsure whether you want {option A} or {option B}."
   ```
2. Leave the annotation open so the user can respond.

### Contradictory Feedback

If feedback contradicts an existing artifact or another feedback item:

1. Reply explaining the conflict:
   ```bash
   rp1 agent-tools feedback reply {annotation_id} --content "This conflicts with {artifact/other feedback}: {brief explanation of conflict}. Leaving open for your guidance."
   ```
2. Leave the annotation open. Do NOT resolve contradictory feedback unilaterally.

### Feedback on Archived or Missing Artifacts

If an annotation references an artifact that no longer exists or is not part of the current feature:

1. Reply explaining the situation:
   ```bash
   rp1 agent-tools feedback reply {annotation_id} --content "The referenced artifact {path} is not part of the current feature scope. No action taken."
   ```
2. Leave the annotation open for the user to close.

## 6. Check for More

After processing all items from the initial read, re-read feedback to check if the user added more while you were processing:

```bash
rp1 agent-tools feedback read --run-id {RUN_ID} --status open
```

If new feedback exists, repeat from Section 2. If no new feedback, proceed to Section 7.

Limit re-reads to 3 rounds to prevent infinite loops. After 3 rounds, return to the gate regardless.

## 7. Return to Gate

All feedback processed. Return control to the calling workflow gate. The gate will re-present its original options to the user.
