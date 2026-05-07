# Arcade Dashboard

The dashboard is Arcade's main monitoring surface. Use it to scan tracked runs,
spot work that needs attention, open run details, inspect artifacts, and move
between registered projects.

**Time to orient**: under 30 seconds to find the next run or notification that
needs action.

## Open The Dashboard

Start Arcade from any rp1 project:

```bash
rp1 arcade
```

Arcade opens the browser unless you pass `--no-open`. If you start Arcade from
multiple projects over time, each project appears in Projects.

When the dashboard is empty, start a tracked workflow such as `/build`,
`/build-fast`, `/pr-review`, or `/pr-walkthrough`, then return to Arcade. Some
maintenance workflows are intentionally quiet and may not appear as Activity
rows.

## Triage Attention

Use this order when you open Arcade:

1. Open the notifications drawer and check **Action required**.
2. Look for waiting or failed runs in Activity.
3. Open the most relevant run detail workspace.
4. Read the current message and artifacts before answering in your host
   conversation.
5. Dismiss notifications that no longer need action.

### Statuses

| Status | What it means | What to do |
|--------|---------------|------------|
| Running | The workflow or one of its steps is active. | Let it continue, or open the run to watch progress. |
| Waiting | The workflow needs input, approval, or evidence. | Open the run and answer in the host conversation. |
| Completed | The workflow finished successfully. | Read the final artifacts or move on. |
| Failed | The workflow stopped on an error. | Open the run, read the error, and decide whether to retry or fix the blocker. |
| Cancelled | The run was intentionally stopped. | No action unless you need to start it again. |
| Inactive or abandoned | Arcade no longer sees active progress. | Reopen the host conversation or start a fresh run if needed. |

## Activity

Activity is the home feed of tracked runs. It is ordered by recent activity and
keeps notifications separate so the feed stays focused on workflow progress.

Each row shows:

- status
- latest activity time
- host icon
- invoked command or workflow name
- run display name
- project shortcut

Click a row to open it. On wide screens, Arcade shows a split preview so you
can keep scanning the feed. On narrow screens, Arcade opens or focuses the run
workspace.

### Search And Filters

Use search when you know part of a run name, command, feature, status, project,
or message. Filters help narrow Activity by status, project, or date range.

Filters combine, so a search for a feature name plus the Waiting status shows
only matching runs that still need attention. Clear filters when you want to
return to the full feed.

## Notifications

The notifications drawer is a dedicated inbox for workflow signals that should
not be lost in the Activity feed.

Notifications are grouped as:

| Group | Meaning |
|-------|---------|
| Action required | You need to answer, approve, verify, or unblock something. |
| Attention | Something changed or may need review soon. |
| Informational | Useful status updates that usually do not require action. |

Open a notification to jump to its run or project. Dismiss it when it no longer
needs your attention. The drawer stays over the current page, so you can check
it without losing your place.

## Run Detail

Run detail is the workspace for one workflow run. It combines the run's current
state, step list, generated outputs, external links, and annotations.

### Header

The header shows:

- run status
- current step or message
- error details when the run failed
- actions such as cancel or abandon while the run is still live
- optional invocation details when you need them

### Step List

The step list shows where the workflow is and what has already happened.

| Step item | How to use it |
|-----------|---------------|
| Status dot | See whether a step is running, waiting, done, failed, skipped, or not started. |
| Duration | Spot long-running work. |
| Artifact count | Jump to outputs produced by that step. |
| Selection | Show the step's flow, messages, and artifacts in the viewer area. |
| Nested work | Expand delegated implementation or review work when a workflow shows it. |

For feature builds, expect the parent journey to stay coarse: requirements,
planning, implementation, and release. Detailed agent activity may appear under
those phases when you need more context.

### Artifacts Area

The artifact area shows generated files and external links for the run.

Use it to:

- switch between artifacts
- open Markdown, JSON, diagrams, diffs, and code snippets
- follow external links in a new tab
- copy a file path when you need to inspect it locally
- open the annotation sidebar for supported files

If a run has not produced artifacts yet, Arcade shows an empty state instead of
blank space.

## Projects

Projects is the place to move between registered rp1 workspaces. A project page
can show recent runs and a file browser for that project.

Use Projects when:

- you launched Arcade from more than one repo
- you want to filter work by project
- you need to inspect a project file without opening a workflow artifact
- you want to return to a run from a different workspace

## Workspaces

Arcade keeps durable destinations and temporary workspaces separate.

| Area | Behavior |
|------|----------|
| Activity | Always available as the main feed. |
| Projects | Always available as the project switcher. |
| Run workspaces | Open as tabs so you can compare or return to runs. |
| Project workspaces | Open as tabs for project overview or file browsing. |
| File views | Stay inside the project file browser workspace. |

Reopening an already open run or project focuses the existing workspace instead
of creating a duplicate. Closing a workspace returns you to the nearest open
workspace or to Activity.

## Navigation And Keyboard

Common shortcuts:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open or close the command palette |
| `Cmd/Ctrl + B` | Open or close the notifications drawer |
| `Cmd/Ctrl + \` | Open or close the notifications drawer |
| `?` | Show keyboard help |
| `/` | Focus search |
| `Escape` | Close the active overlay or blur the focused field |

List navigation on Activity and Projects:

| Key | Action |
|-----|--------|
| `j` or `Arrow Down` | Select next row |
| `k` or `Arrow Up` | Select previous row |
| `l`, `Arrow Right`, or `Enter` | Open the selected item |
| `h` or `Arrow Left` | Move back where supported |

Workspace tabs support normal tab focus plus arrow keys, Home, End, Enter,
Space, Delete, and Backspace.

See [Keyboard Shortcuts](keyboard-shortcuts.md) for the full reference.

## Freshness And Recovery

Arcade normally updates while workflows report progress. If the connection is
interrupted, Arcade shows a reconnecting state and catches up when it can.

If something looks stale:

1. Check whether the workflow is still running in your host conversation.
2. Refresh the browser.
3. Restart Arcade with `rp1 arcade --restart` if the browser cannot reconnect.
4. Start Arcade from the project you expected to see if the project is missing.

## Theme

Arcade supports light and dark themes. Use the sun or moon button in the header
to switch themes. Your preference is saved for future sessions.

Status colors are intentionally simple:

| Status family | Color treatment |
|---------------|-----------------|
| Not started, inactive, cancelled, skipped | Muted neutral |
| Running, waiting | Amber accent |
| Completed | Green accent |
| Failed, abandoned | Red accent |

## Related

- [Arcade Overview](index.md)
- [Artifact Viewer](artifact-viewer.md)
- [Annotations](annotations.md)
- [Feature Development Guide](../guides/feature-development.md)
- [PR Review Guide](../guides/pr-review.md)
