# Annotations

The annotation system enables persistent, contextual feedback on artifacts in the rp1 web UI. Add inline comments, suggest edits, and collaborate on design documents, requirements, and code.

---

## Overview

Annotations provide a feedback loop between you and AI agents working on your codebase. Key capabilities:

- **Inline comments** anchored to text selections, hidden markers, or code lines
- **Suggestion edits** rendered as GitHub-style diffs
- **Threaded replies** for discussions
- **Real-time sync** via WebSocket
- **Dual persistence** to JSON (machine-readable) and markdown (human-readable)

---

## Creating Annotations

### Text Selection Comments

1. Select text in any markdown artifact
2. A popover appears with "Add Comment" and "Suggest Edit" options
3. Enter your feedback and press **Cmd/Ctrl + Enter** to submit

The annotation anchors to the selected text. If the document changes and the text can no longer be found, the annotation is marked as "orphaned" but preserved.

### Line Comments (Code Blocks)

1. Hover over a code block's line gutter
2. Click the **+** icon that appears
3. Enter your comment and submit

Line annotations anchor to the specific line number in the code block.

### Hidden Anchor Comments

Markdown files can contain hidden anchors (`<a id="section-name">`) that provide stable anchor points for annotations. These are invisible in the rendered output but allow annotations to survive document restructuring.

---

## Annotation Types

### Comment

Standard feedback or question about the content. Displays as a popover at the anchor position.

### Suggestion Edit

Proposes a text change. Displays as a GitHub-style diff block:

```diff
- original text (red background, strikethrough)
+ suggested text (green background)
```

Click **Accept** to apply the suggestion (not yet implemented - for future release).

---

## Annotation Sidebar

The artifact viewer includes a collapsible annotation sidebar on the right side. Toggle it with the annotation button in the toolbar.

### Sections

| Section | Description |
|---------|-------------|
| **Open** | Active annotations requiring attention |
| **Resolved** | Addressed annotations (collapsed by default) |
| **Orphaned** | Annotations whose anchors could not be found (warning badge) |

### Filters

| Filter | Options |
|--------|---------|
| **Status** | Open, Resolved, All |
| **Author** | Filter by annotation creator |
| **Date Range** | Today, This Week, This Month, All Time |

### Navigation

Click any annotation in the sidebar to scroll to its anchor position in the document. The anchor highlights briefly to help you locate it.

---

## Threading

Annotations support unlimited flat replies:

1. Click an annotation indicator or sidebar item to open the popover
2. Enter your reply in the text area at the bottom
3. Press **Cmd/Ctrl + Enter** or click **Reply** to submit

Replies display in chronological order. Each reply shows the author and timestamp.

---

## Resolution Workflow

Mark annotations as resolved when addressed:

1. Open the annotation popover
2. Click the **Resolve** button (checkmark icon)
3. The annotation moves to the "Resolved" section in the sidebar

To reopen a resolved annotation, click **Reopen** in the popover.

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| `Cmd/Ctrl + Enter` | Comment input | Submit annotation or reply |
| `Escape` | Popover open | Close popover |

---

## Persistence

### JSON Storage

Annotations are stored in `.rp1/open-tasks.json` as the authoritative source. This file is machine-readable, enabling AI agents to read and respond to feedback.

```json
{
  "version": "1.0.0",
  "lastModified": "2026-01-26T10:00:00Z",
  "annotations": [
    {
      "id": "ANN-1706266800000-abc123",
      "artifactPath": "requirements.md",
      "anchor": {
        "type": "text-selection",
        "selectedText": "user authentication",
        "startOffset": 150,
        "endOffset": 170
      },
      "content": "Should we support OAuth here?",
      "status": "open",
      "replies": []
    }
  ]
}
```

### Markdown Embedding

Annotations are also embedded as HTML comments in the source markdown files:

```markdown
<!-- rp1:annotation:ANN-001 -->
Some annotated text
<!-- /rp1:annotation:ANN-001 -->
```

For suggestions:

```markdown
<!-- rp1:suggestion:ANN-002 original="old text" suggested="new text" -->
```

These comments are invisible in rendered markdown but provide context when viewing source files.

---

## Agent Integration

AI agents can access annotations via the JSON file to:

- **Read feedback**: Understand user concerns and questions
- **Address suggestions**: Apply suggested edits during implementation
- **Track resolution**: Skip resolved annotations

### Reading Annotations

Agents should read `.rp1/open-tasks.json` at the start of relevant workflows to check for feedback.

### Example Workflow

1. You review an AI-generated requirements document
2. Add annotations highlighting unclear sections or requesting changes
3. Run `/build my-feature` to continue development
4. The builder agent reads annotations and addresses the feedback
5. Resolved feedback is marked in the JSON file

---

## Feature Flag

The annotation system can be disabled by setting the environment variable:

```bash
export RP1_ANNOTATIONS_ENABLED=false
```

When disabled, annotation UI elements are hidden and the API returns 404.

---

## Related

- [Artifact Viewer](artifact-viewer.md) - Main artifact viewing interface
- [V2 Dashboard](v2-dashboard.md) - Status monitoring dashboard
- [Feature Development Guide](../guides/feature-development.md) - Using `/build` workflow
