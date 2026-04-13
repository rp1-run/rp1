# Arcade Dashboard

The dashboard is Arcade's browser shell for monitoring tracked runs across your
registered projects. The home route `/` is the activity feed, while run
details, project overviews, and project file browsers open as workspaces inside
the same shell. Persistent notifications live in a dedicated drawer instead of
appearing as rows in the main feed.

**Time to orient**: Under 30 seconds to understand what needs attention.

---

## Accessing the Dashboard

Start Arcade with `rp1 arcade`:

```bash
rp1 arcade
# Opens http://localhost:7710 by default
```

Run that command from any project directory. Arcade opens the browser unless
you pass `--no-open`, and each project you launch from becomes available in the
Projects view.

---

## Data Sources

The dashboard displays real data from your local rp1 installation. Run, event,
artifact, annotation, and notification data all come from the global emit
database at `~/.rp1/rp1.db`, then Arcade combines that with its local project
registry before serving `/api/v2/feed`, `/api/v2/runs`, and `/api/v2/projects`.

### How Runs Are Populated

When a workflow reports status via `rp1 agent-tools emit`, Arcade turns those
records into feed rows, run detail pages, notifications, and project summaries:

1. **Workflow emits canonical events** - Skills and agents call `rp1 agent-tools emit` with status changes, `waiting_for_user`, artifact registrations, and related events.
2. **Emit updates `rp1.db`** - The emit pipeline stores events and derives canonical run and step statuses in `~/.rp1/rp1.db`.
3. **Arcade filters for tracked activity** - The feed skips eval runs and flows whose skill metadata sets `arcade_tracked: false`.
4. **The shell renders current state** - The home feed, run detail workspace, notifications drawer, and project pages all read from those derived records.

### Status Value Mappings

Arcade no longer maps legacy display-only buckets such as `needs-review` or
`started`/`in_progress`. The V2 UI reads canonical shared statuses directly:

| Canonical Status | Meaning in Arcade |
|------------------|-------------------|
| `running` | A run or step is actively executing |
| `waiting` | Execution is paused for user input |
| `inactive` | The inactivity reaper marked the run idle |
| `completed` | The run finished successfully |
| `failed` | The run ended with an error |
| `cancelled` | The user intentionally stopped the run |
| `abandoned` | The run was intentionally ended without completion |

Step rows also use `not_started` and `skipped` where appropriate.

### Empty Dashboard

If the activity feed is empty, Arcade shows `No activity yet.` with a link to
the first-workflow guide. If you expected runs to appear, check that:

1. Workflows are reporting progress through `rp1 agent-tools emit`
2. The emit database exists at `~/.rp1/rp1.db`
3. The flow is activity-tracked (`metadata.arcade_tracked` was not set to `false`)
4. The project was launched in Arcade and therefore appears in the local project registry

---

## Activity Dashboard (`/`)

The home route `/` is a reverse-chronological activity feed of tracked runs.
The `Runs` navigation command and `/runs` route both land here. Persistent
notifications stay in the drawer, so the page itself stays focused on run
activity.

Each feed row shows:

- A status dot using the canonical run status
- Relative activity time based on the latest event
- Harness icon
- Invoked command
- Resolved run display name
- A project shortcut button on the right

Click any item to view full run details.

### Empty State

When there is no feed data, Arcade shows `No activity yet.` and a link to the
first-workflow guide.

### Refresh

There is no dedicated refresh button on the home page. The feed updates through
WebSocket attention signals, and reconnect recovery refetches the feed after a
socket interruption.

---

## Runs List

There is no separate runs-list page in the current shell. `/runs` redirects to
`/`, and the activity feed is the filtered run list.

### Filters

| Filter | Options |
|--------|---------|
| **Status tabs** | All, Running, Waiting, Inactive, Completed, Failed, Cancelled, Abandoned |
| **Project select** | Registered projects from `/api/v2/projects` |
| **Date range** | All Time, Today, This Week, This Month |

Filters combine with AND logic. When any filter is active, Arcade shows a clear
button next to the selectors.

Only the project filter currently syncs into the URL query string as
`?projectId=...`.

### Project-Scoped View

Open `/projects/:projectId` for a project overview with recent runs and a file
browser workspace. If you want the activity feed scoped to a project, open
`/?projectId=<projectId>` or use the project button on a feed row.

---

## Run Detail

The run detail workspace (`/runs/:runId` and deeper step or artifact routes)
combines step selection with artifact viewing for a single run.

### Header

- Status badge
- Current-step label when a step is active
- Status or error message when the run reported one
- `Abandon` and `Cancel Run` actions while the run is still live
- Optional invocation metadata, exposed through a contextual command rather than shown by default

### Step Timeline

Run detail uses a vertical step list rather than the old horizontal timeline.
Each row shows:

| Step Detail | Behavior |
|-------------|----------|
| Status dot | Reflects canonical step status (`running`, `waiting`, `completed`, `failed`, `not_started`, `skipped`) |
| Duration | Shown when Arcade knows the step start time |
| Artifact count | Displayed on the right side of the step row |
| Selection | Choosing a step updates the right-hand viewer to that step's execution flow or artifacts |
| Retry marker | Repeated step names get a back-edge marker so retries are visible |

### Agent Sub-State Panel

When a step has subflow activity, the step list can expand into nested per-task
state under that step. This provides hierarchical visibility into what the
delegated agent work is doing inside the parent workflow phase.

**What it shows**:
- Task identifiers and agent ids emitted for that step
- Per-task status values such as running, waiting, completed, and failed
- Collapsed summary chips that count active, waiting, done, and failed work

**Behavior**:
- Selecting a composite step lets you expand or collapse its nested task list
- Steps without agent activity behave like normal workflow rows
- Collapsed rows show summary chips instead of the full nested task list
- Each task within an agent progresses independently through its own state machine

**Example**: During a `build` workflow's "build" phase, you might see:
- `task-builder`: building (T2) -- with T1 shown as completed

Agent activity shown here is driven by the workflow steps and status events that
rp1 records while a run is in progress.

### Artifacts Panel

The right-hand viewer is step-centric:

- A selected step can expose an `Execution Flow` Mermaid diagram, step artifacts, or both
- Artifact tabs let you switch files, copy the absolute path, and open inline annotations
- Markdown artifacts can expose a table of contents and optional frontmatter view
- Steps with no artifacts show an empty-state message instead of a separate panel

### Event Stream

The current V2 run detail view does not render a standalone event-log panel.
Live status changes, waiting states, artifact registrations, and subflow
updates are reflected through the step list and artifact viewer instead.

---

## Navigation

Arcade separates durable shell destinations from closable workspaces. Activity
(`/`) and Projects (`/projects`) stay pinned in the shell, while run detail,
project overview, and project file-browser routes open as workspaces. The
workspace strip sits above the breadcrumb, and the breadcrumb reflects the
currently active durable route or workspace.

### Desktop shell

| Surface | Behavior |
|---------|----------|
| Left icon rail | Durable navigation for Activity (`/`) and Projects (`/projects`); these destinations are never closeable workspace tabs |
| Workspace strip | Shows closable run, project overview, and file-browser workspaces above the breadcrumb bar; reopening an existing workspace focuses the existing tab and restores its last route |
| Breadcrumb bar | Shows the current page, project, or run context for the active durable destination or workspace |
| Right-side bell trigger | Opens or closes the notifications drawer from the right edge of the workspace bar without navigating away |

### Narrow layouts

| Surface | Behavior |
|---------|----------|
| Bottom activity button | Opens the activity dashboard as durable navigation, not a closable workspace |
| Bottom projects button | Opens the projects view as durable navigation, not a closable workspace |
| Workspace strip above page content | Shows open run, project overview, and file-browser workspaces in a horizontal strip above the breadcrumb and page content while keeping the bottom bar reserved for durable navigation |
| Bottom bell trigger | Opens or closes the notifications drawer |
| Bottom command button | Opens the command palette |

### Workspace behavior

- Eligible workspaces are run detail, project overview, and project file browser routes.
- Individual files stay inside a project file-browser workspace and do not become top-level tabs.
- Reopening an already open workspace returns you to that existing tab instead of creating a duplicate.
- Closing the active workspace moves to the nearest remaining workspace, or back to the last durable route if no workspaces remain.

### Notifications drawer behavior

- Opens as a right-side drawer over the current page.
- Groups active notifications into **Action required**, **Attention**, and
  **Informational**.
- Opens linked runs or projects, then closes the drawer when a notification has
  a destination.
- Lets you dismiss persistent notifications directly from the drawer.
- Closes with `Escape`, `Cmd/Ctrl+B`, or `Cmd/Ctrl+\`.

---

## Keyboard Shortcuts

The dashboard supports a comprehensive keyboard-first interaction model. See [Keyboard Shortcuts](keyboard-shortcuts.md) for the full reference.

Workspace tabs do not add new global single-key shortcuts in v1. The existing
shell shortcuts continue to own durable navigation, while workspace navigation
uses natural focus movement inside the strip plus contextual command-palette
actions on active workspace pages.

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open or close command palette |
| `Cmd/Ctrl + B` | Open or close the notifications drawer |
| `Cmd/Ctrl + \` | Open or close the notifications drawer (alternate) |
| `?` | Toggle shortcut help overlay |
| `/` | Focus search input |
| `Escape` | Close the active overlay, or blur the focused element if no overlay is open |

### Go-To Chords

| Chord | Destination |
|-------|-------------|
| `g` then `h` | Activity dashboard |
| `g` then `r` | Activity dashboard (alternate alias) |
| `g` then `p` | Projects |

These chords continue to target durable shell destinations only. They do not
open, close, or cycle workspace tabs.

### Workspace Strip

| Key | Action |
|-----|--------|
| `Tab` | Move focus into the open-workspaces strip when tabs are present |
| `Arrow Left` / `Arrow Right` | Move focus across adjacent workspace tabs |
| `Home` / `End` | Jump focus to the first or last workspace tab |
| `Enter` / `Space` | Activate the focused workspace tab |
| `Delete` / `Backspace` | Close the focused workspace tab |

Active workspace pages also register `Previous Workspace`, `Next Workspace`,
and `Close Workspace` actions in the command palette.

### List Navigation

These bindings apply on list-driven surfaces such as Projects and Project
Overview. The workspace strip uses its own horizontal key handling, and the
home activity feed remains click-first today.

| Key | Action |
|-----|--------|
| `j` / `Arrow Down` | Select next row |
| `k` / `Arrow Up` | Select previous row |
| `l` / `Arrow Right` / `Enter` | Open the selected project or run |
| `h` / `Arrow Left` | Drill back to the parent durable route |

Keyboard navigation on those list views is implemented directly in the page
surface rather than via a hidden global mode switch.

---

## Tabs Verification Gate

Tabs UI changes are not considered release-ready without live browser
verification against the real Arcade app.

1. Start the actual UI with `just serve-web-ui`.
2. Use `playwright-cli` against the running app, not a mocked component harness.
3. Validate both a desktop-sized viewport and a mobile-sized viewport.
4. Capture screenshots or snapshots under `/tmp` as review evidence.
5. Treat any failed browser scenario as release-blocking until it is fixed and
   revalidated.

Minimum browser coverage for tabs work:

- Open run, project overview, and file-browser workspaces from their existing entry points.
- Reopen an already open workspace and confirm the existing tab is focused instead of duplicated.
- Switch among open tabs and confirm the breadcrumb and shared chrome update immediately.
- Close inactive and active tabs while keeping durable navigation available.
- Reload on an eligible workspace and confirm the route and active tab are preserved.
- Use browser back and forward across workspace transitions and confirm the visible state stays aligned with the URL.
- Verify keyboard-only tab focus, activation, and close behavior.
- Verify the mobile layout keeps the bottom durable navigation separate from the workspace strip.

---

## Theme

The dashboard uses a warm stone design system with light and dark variants:

| Theme | Description |
|-------|-------------|
| **Dark** | Charcoal stone surfaces with warm foreground contrast and amber accents |
| **Light** | Pale stone surfaces with dark text and restrained amber accents |

Toggle between themes using the sun/moon button in the header. Your preference is saved to localStorage.

### Status Colors

| Status Family | Color Treatment |
|---------------|-----------------|
| `not_started`, `inactive`, `cancelled`, `skipped` | Muted neutral |
| `running`, `waiting` | Amber accent |
| `completed` | Green accent |
| `failed`, `abandoned` | Red accent |

---

## Real-time Updates

Arcade maintains a WebSocket connection for live updates. When a tracked run or
notification changes, the feed and open workspaces update without a full page
reload.

If the socket disconnects, the shell switches into reconnecting mode and a
5-second polling fallback keeps the feed current until the connection is
restored.

---

## Related

- [Feature Development Guide](../guides/feature-development.md) - Using `/build` and other commands
- [PR Review Guide](../guides/pr-review.md) - Reviewing pull requests with agents
