# Arcade

Arcade is rp1's browser UI for monitoring runs, checking notifications,
opening artifacts, and working through feedback without losing the surrounding
workflow context.

![Arcade annotations view showing comments attached to an artifact with surrounding workflow context](../assets/screens/arcade/annotations.png)

## Launch Arcade

Arcade normally starts automatically when your coding agent session starts.
If that does not happen for some reason, start it manually:

```bash
rp1 arcade
```

Run that from any project directory. The local server opens the Arcade UI in
your browser.

---

## Main Surfaces

### Activity dashboard

The activity dashboard keeps run monitoring separate from persistent
notifications so the main page stays easy to scan.

Typical sections:

- **Waiting for you** - workflows paused for input
- **Needs review** - completed work that needs a decision
- **Failed** - workflows that need intervention
- **Running** - active workflows still progressing

Persistent notifications no longer appear as standalone items on this page.
Open the notifications drawer from the shell when you need approvals, failures,
or other notification records.

### Notifications drawer

The notifications drawer gives you a dedicated inbox without forcing a page
change.

- On desktop, open it from the bell trigger in the top-right breadcrumb bar.
- On narrow layouts, use the matching bell action in the bottom navigation.
- The drawer stays on top of the current page, groups items by urgency, lets
  you follow linked runs or projects, and lets you dismiss notifications in
  place.

### Runs list

The runs list shows tracked workflows with filters for project, status, and
time range.

### Run detail

The run detail view shows:

- current workflow status
- the step timeline
- nested agent activity when a workflow delegates work
- registered artifacts
- the chronological event stream

### Artifacts and annotations

Artifacts can be opened directly from a run. If your team uses Arcade
annotations, you can leave feedback on specific files and return later without
losing context.

---

## What Arcade Is Best At

| Use Case | Why Arcade Helps |
|----------|------------------|
| Long-running workflows | You can see progress without keeping the host conversation open |
| Review gates | Waiting states are visible before you answer the prompt |
| Artifact-driven work | Requirements, design, verification, and reports stay easy to open |
| Team collaboration | Shared feedback and annotation state stay attached to the artifact |

---

## Pages In This Section

- [Dashboard](dashboard.md) - Runs, statuses, and timelines
- [Artifact Viewer](artifact-viewer.md) - Inspect generated files
- [Annotations](annotations.md) - Leave and resolve feedback
- [Keyboard Shortcuts](keyboard-shortcuts.md) - Navigate quickly
- [Settings](settings.md) - Configure the UI

---

## Related

- [Feature Development Guide](../guides/feature-development.md)
- [PR Review Guide](../guides/pr-review.md)
- [Reference Overview](index.md)
