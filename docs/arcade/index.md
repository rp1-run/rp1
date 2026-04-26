# Arcade

Arcade is rp1's browser UI for monitoring runs, checking notifications,
opening artifacts, and working through feedback without losing the surrounding
workflow context.

![Arcade annotations view showing comments attached to an artifact with surrounding workflow context](../assets/screens/arcade/annotations.png)

## Launch Arcade

Start Arcade with:

```bash
rp1 arcade
```

Run that from any project directory. By default it opens the browser on
`http://localhost:7710`.

### macOS native shell

Arcade also has a development-ready macOS native shell for the bootstrap phase.
It opens the existing Arcade UI inside an Electrobun window, reuses the same
daemon lifecycle and project registry, opens the registered projects route when
started without a project path, and keeps browser Arcade available as the
fallback path. Developers can also pass a project path for direct launch through
the existing registration flow.

See [macOS Native Shell](native-app.md) for the development recipe, optional
project argument, registered-project selection check, browser fallback check,
and deferred production packaging scope.

### Daemon lifecycle

Arcade runs as a single background daemon per user environment. Every launch
path -- `rp1 arcade`, hooks, `just install` -- converges on one authoritative
daemon rather than allowing duplicates. You do not need to worry about
leftover processes or manual cleanup during normal use.

When you run `rp1 arcade`, the daemon manager resolves the current state and
reports one of three outcomes:

| Outcome | When it happens | CLI feedback |
|---------|-----------------|--------------|
| **Reused** | A healthy, compatible daemon is already running on the requested port | `Reused daemon on port 7710` |
| **Started** | No daemon was running; a new one is launched | `Started daemon on port 7710` |
| **Replaced** | A daemon was running but is unhealthy or from an incompatible version | `Replaced daemon on port 7710 (reason: version mismatch)` |

Replacement reasons include `version mismatch`, `unhealthy daemon`,
`stale pid`, and `missing pid`. These appear in the CLI output and in
`daemon.log` so you can verify exactly what happened without inspecting PID
files or process tables.

### Port conflicts

If the requested port is occupied by a non-rp1 process, Arcade raises an
actionable error instead of terminating the other process:

```
Port 7710 is in use by a non-rp1 process.
Use a different port or stop the process occupying port 7710.
```

Use `--port` to pick a different port:

```bash
rp1 arcade --port 8080
```

### Stale state recovery

If a previous daemon crashed or its PID file became stale, the next launch
detects and repairs the ownership state automatically. You do not need to
delete PID files or restart markers manually -- the daemon manager handles
recovery as part of normal startup.

### Other lifecycle commands

```bash
rp1 arcade --status     # Show whether the daemon is running
rp1 arcade --stop       # Stop the daemon
rp1 arcade --restart    # Restart the daemon
```

These commands are idempotent. Repeating them does not accumulate extra
processes or stale state.

---

## Main Surfaces

### Activity dashboard

The activity dashboard is a reverse-chronological feed of tracked runs. It
keeps run monitoring separate from persistent notifications so the main page
stays easy to scan.

Workflow activity shows up here because workflows emit canonical events through
`rp1 agent-tools emit`. Arcade consumes that event stream over WebSocket,
hydrates only the affected runs and project summaries, and keeps file watching
scoped to artifact or file-content views instead of using file changes as the
normal status-refresh mechanism.

Each row shows:

- latest activity time
- canonical run status
- harness icon
- invoked command and run display name
- quick project shortcut

Use the filter toggle on `/` to scope by status, project, or time range.
Persistent notifications do not appear as standalone feed rows; open the
notifications drawer from the shell when you need approvals, failures, or other
notification records.

If the socket reconnects after a gap, Arcade resumes from the saved
project-scoped cursor so missed workflow events can be replayed or reconciled
from a bounded snapshot before the feed falls back to broader recovery.

### Notifications drawer

The notifications drawer gives you a dedicated inbox without forcing a page
change.

- On desktop, open it from the bell trigger at the right edge of the workspace bar.
- On narrow layouts, use the matching bell action in the bottom navigation.
- The drawer stays on top of the current page, groups items by urgency, lets
  you follow linked runs or projects, and lets you dismiss notifications in
  place.
- Notification delivery stays aligned with the same emit-driven live-update
  path as the rest of Arcade, so approval, failure, and completion signals
  follow the affected run without requiring a broad page refresh.
- Reconnect recovery uses the saved WebSocket cursor plus persisted run state
  to catch up after missed live traffic; manual reload is a fallback, not the
  normal path.

### Runs list

The current shell does not have a separate runs-list route. `/runs` redirects
to `/`, and the home activity feed is the filtered run list.

### Run detail

The run detail view shows:

- current workflow status
- the step list for the selected run
- nested agent activity when a workflow delegates work
- execution-flow context for the selected step
- a right panel with a horizontal list of all run artifacts
- inline annotation access on the selected artifact

### Artifacts and annotations

Run details show artifacts in the right panel as soon as the run has any. You
do not need to click through every step to find generated work: step-backed
and run-level artifacts appear together in a single horizontal file list. When a
run has no artifacts yet, the panel shows an intentional waiting state instead
of blank space.

The step list still keeps step-level context and artifact shortcuts for
investigation. Selecting a step artifact updates the same right-panel viewer,
where annotation controls remain available for teams using Arcade annotations.

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
- [macOS Native Shell](native-app.md) - Launch Arcade from the development native app

---

## Related

- [Feature Development Guide](../guides/feature-development.md)
- [PR Review Guide](../guides/pr-review.md)
- [Reference Overview](../reference/index.md)
