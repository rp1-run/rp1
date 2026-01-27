# Annotations

The annotation system enables persistent, contextual feedback on artifacts in the rp1 web UI. Add inline comments and collaborate on design documents, requirements, and code.

---

## Overview

Annotations provide a feedback loop between you and AI agents working on your codebase. Key capabilities:

- **Inline comments** anchored to text selections, hidden markers, or code lines
- **Single-level replies** for discussions
- **Real-time sync** via WebSocket
- **Dual persistence** to JSON (machine-readable) and markdown (human-readable)

---

## Creating Annotations

### Text Selection Comments

1. Select text in any markdown artifact or code block
2. A small popover appears to the right of your selection with an "Add Comment" action
3. Click to open the comment editor, then enter your feedback
4. Press **Cmd/Ctrl + Enter** to submit

The annotation anchors to the selected text. If the document changes and the text can no longer be found, the annotation is marked as "orphaned" but preserved.

### Code Block Comments

Code blocks support the same text selection annotation workflow as markdown content:

1. Select any text within a code block
2. The comment popover appears to the right of your selection
3. Add your comment and submit

This unified experience allows precise feedback on any content type.

### Hidden Anchor Comments

Markdown files can contain hidden anchors (`<a id="section-name">`) that provide stable anchor points for annotations. These are invisible in the rendered output but allow annotations to survive document restructuring.

---

## Visual Indicators

Annotations display as thin vertical lines on the left side of annotated content, providing subtle but visible markers that don't interfere with readability.

### Indicator Colors

| Color | Status | Description |
|-------|--------|-------------|
| **Yellow** | Open | Active annotations requiring attention |
| **Green** | Resolved | Addressed annotations |

### Interaction

- **Click** the left-side indicator to open the annotation popover
- The popover appears to the right of the content, positioned to avoid viewport edges
- **Hover** over the indicator to see a visual highlight

### Code Block Indicators

Code blocks display indicators in the gutter area, using the same color scheme:

- Yellow gutter highlight for open annotations
- Green gutter highlight for resolved annotations

---

## Annotation Sidebar

The artifact viewer includes a collapsible annotation sidebar on the right side. Toggle it with the annotation button in the toolbar.

### Sidebar Items

Each annotation in the sidebar displays:

- **Status indicator**: Colored dot (yellow = open, green = resolved)
- **Preview text**: First portion of the comment content
- **Metadata**: Author and timestamp

### Content Truncation

Long comments are truncated in both the sidebar and popover to maintain a clean interface:

- Comments exceeding 3 lines or ~200 characters show truncated text
- Click **Show more** to expand and view the full content
- Click **Show less** to collapse back to the preview
- Expanded state persists during your session

### Sections

| Section | Description |
|---------|-------------|
| **Open** | Active annotations requiring attention |
| **Resolved** | Addressed annotations (collapsed by default) |
| **Orphaned** | Annotations whose anchors could not be found (warning badge) |

### Navigation

Click any annotation in the sidebar to:

1. Scroll the document to the annotation's anchor position
2. Open the annotation popover at that location

The sidebar remains open after navigation, allowing you to quickly move between annotations.

---

## Threading

Annotations support single-level replies:

1. Click an annotation indicator or sidebar item to open the popover
2. Enter your reply in the text area at the bottom
3. Press **Cmd/Ctrl + Enter** or click **Reply** to submit

Replies display in chronological order beneath the original comment. Each reply shows the author and timestamp. Reply content follows the same truncation rules as main comments.

---

## Resolution Workflow

Mark annotations as resolved when addressed:

1. Open the annotation popover
2. Click the **Resolve** button (checkmark icon)
3. The indicator changes from yellow to green
4. The annotation moves to the "Resolved" section in the sidebar

To reopen a resolved annotation, click **Unresolve** in the popover. The indicator returns to yellow and the annotation moves back to the "Open" section.

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

These comments are invisible in rendered markdown but provide context when viewing source files.

---

## Agent Integration

AI agents can access annotations via the JSON file to:

- **Read feedback**: Understand user concerns and questions
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
