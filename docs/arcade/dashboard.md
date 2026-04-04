# Arcade Dashboard

The dashboard provides a glanceable status view for monitoring AI agent runs
across all your projects. Access it at `/` when Arcade is running.

**Time to orient**: Under 30 seconds to understand what needs attention.

---

## Accessing the Dashboard

Arcade normally starts automatically when your coding agent session starts.
If it does not, start it manually with `rp1 arcade`:

```bash
rp1 arcade
# Opens http://localhost:7710
```

You can run that command from any project directory.

---

## Data Sources

The dashboard displays real data from your local rp1 installation. All run data is sourced from the status database at `~/.rp1/rp1.db`, which is populated when AI agents report their progress using the `emit` agent tool.

### How Runs Are Populated

When an agent (or any workflow) reports status via `rp1 agent-tools emit`, a record is written to `rp1.db`. The API queries this database to populate the dashboard:

1. **Agent executes workflow** - Agents call `rp1 agent-tools emit` at key milestones (feature started, task in progress, completed, failed)
2. **Status stored in database** - Each update creates a record in `~/.rp1/rp1.db` with run ID, step, status, and event data
3. **API queries database** - The `/api/v2/runs` endpoint queries the database for the latest status per feature
4. **Dashboard displays runs** - The UI renders runs grouped by their current status

### Status Value Mappings

The status database stores granular status values that are mapped to dashboard display statuses:

| Database Status | Dashboard Status | Description |
|-----------------|------------------|-------------|
| `started` | Running | Initial execution state |
| `in_progress` | Running | Active work in progress |
| `waiting-input` | Waiting | Agent blocked, needs user input |
| `needs-review` | Needs Review | Work complete, awaiting review |
| `completed` | Completed | Success terminal state |
| `failed` | Failed | Error terminal state |

The dashboard groups runs into attention sections based on these mapped statuses:

- **Waiting for you** - Runs with `waiting-input` status
- **Needs review** - Runs with `needs-review` status
- **Failed** - Runs with `failed` status
- **Running** - Runs with `started` or `in_progress` status

### Empty Dashboard

If your dashboard shows no runs, ensure that:

1. Agents are reporting progress via `rp1 agent-tools emit` with validated state machine transitions
2. The status database exists at `~/.rp1/rp1.db`
3. The project is registered (runs are filtered by registered projects)

---

## Home Dashboard (Now View)

The home dashboard (`/`) shows what needs your attention across all projects. Runs are grouped into four sections displayed in priority order:

| Section | Description | Default State |
|---------|-------------|---------------|
| **Waiting for you** | Runs blocked waiting for user input | Always expanded |
| **Needs review** | Completed runs with artifacts to review | Always expanded |
| **Failed** | Runs that encountered errors | Always expanded |
| **Running** | Active runs in progress | Collapsed |

Each run item displays:

- Status badge with color and icon
- Project and feature name
- Command that was invoked
- Current step (for running items)
- Relative timestamp ("2 min ago")

Click any item to view full run details.

### Empty State

When nothing needs attention, you'll see a calm message: "Nothing needs your attention. All your agent runs are proceeding smoothly."

### Refresh

Click the Refresh button in the header to manually fetch updated data. The dashboard also receives real-time updates via WebSocket when runs change status.

---

## Runs List

The runs list (`/runs`) shows all agent runs with filtering capabilities.

### Filters

| Filter | Options |
|--------|---------|
| **Status** | All, Running, Completed, Failed, Waiting |
| **Project** | Dropdown of registered projects |
| **Date Range** | Today, This Week, This Month, All Time |

Filters combine with AND logic. Clear all filters with the "Clear filters" button.

Filter state syncs to URL parameters for shareable links.

### Project-Scoped View

Navigate to `/projects/:projectId/runs` to view runs filtered to a specific project.

---

## Run Detail

The run detail view (`/runs/:runId`) shows complete information about a single run.

### Header

- Large status badge
- Command invoked (e.g., `/build`, `/pr-review`)
- Feature/branch name
- Started time and duration
- Breadcrumb navigation: Project > Feature > Run

### Step Timeline

Horizontal timeline showing workflow progression:

| Step State | Visual |
|------------|--------|
| Completed | Green checkmark |
| Current | Blue filled circle (animated for running) |
| Pending | Gray empty circle |
| Failed | Red X |

### Agent Sub-State Panel

When a workflow step has associated agent activity, the step timeline displays a nested agent activity panel below the workflow diagram. This provides hierarchical visibility into what agents are doing within each phase.

**What it shows**:
- Agent name (humanized, e.g., "Task Builder" for `task-builder`)
- Current agent step and status badge
- Per-task tracking: individual task IDs (e.g., T1, T2) with independent state per task

**Behavior**:
- Steps with active (running) agents are auto-expanded
- Steps without agent activity render identically to before (no visual change)
- Updates in real-time via the existing WebSocket mechanism
- Each task within an agent progresses through the agent's state machine independently

**Example**: During a `build` workflow's "build" phase, you might see:
- `task-builder`: building (T2) -- with T1 shown as completed

Agent activity shown here is driven by the workflow steps and status events that
rp1 records while a run is in progress.

### Artifacts Panel

Lists files produced or updated during the run:

- File type icons (markdown, diff, code, etc.)
- File path
- "New" badge for newly created artifacts

Click an artifact to open the file path.

### Event Stream

Collapsible panel showing the chronological event log:

| Event Type | Description |
|------------|-------------|
| step-start | Step began execution |
| step-complete | Step finished |
| warning | Non-fatal warning |
| error | Error occurred |
| artifact-updated | File was created/modified |
| task-batch | Summary of completed tasks |

Task-batch events show a summary like "12 tasks completed in Build step" rather than individual task events.

---

## Navigation

### Sidebar

The left sidebar provides navigation between views:

| Item | Route | Description |
|------|-------|-------------|
| Home | `/` | Attention dashboard |
| Runs | `/runs` | All runs list |
| Projects | `/projects` | Project list |

The sidebar can collapse to icon-only mode for more content space.

### Header

The header displays:

- Logo and branding
- Project switcher dropdown
- WebSocket connection status indicator
- Theme toggle (dark/light)
- Help button (links to documentation)

---

## Keyboard Shortcuts

The dashboard supports a comprehensive keyboard-first interaction model. See [Keyboard Shortcuts](keyboard-shortcuts.md) for the full reference.

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `?` | Toggle shortcut help overlay |
| `/` | Focus search input |
| `Escape` | Dismiss overlay or blur focus |
| `Cmd/Ctrl + \` | Toggle sidebar collapse |

### Go-To Chords

| Chord | Destination |
|-------|-------------|
| `g` then `h` | Home |
| `g` then `r` | Runs |
| `g` then `p` | Projects |

### List Navigation

| Key | Action |
|-----|--------|
| `j` / `Arrow Down` | Select next item |
| `k` / `Arrow Up` | Select previous item |
| `l` / `Arrow Right` | Drill into item |
| `h` / `Arrow Left` | Drill out to parent |
| `Enter` | Open selected item |
| `Escape` | Clear selection |

Keyboard navigation uses the roving tabindex pattern for accessibility.

### Run Detail

| Key | Action |
|-----|--------|
| `Escape` | Return to runs list |

---

## Theme

The dashboard uses the Catppuccin color palette:

| Theme | Description |
|-------|-------------|
| **Mocha** (dark) | Default theme with deep purple-blue tones |
| **Latte** (light) | Light theme with warm cream tones |

Toggle between themes using the sun/moon button in the header. Your preference is saved to localStorage.

### Status Colors

| Status | Color |
|--------|-------|
| Queued | Gray (Overlay) |
| Running | Blue |
| Waiting | Peach |
| Completed | Green |
| Failed | Red |
| Needs Review | Mauve |

---

## Real-time Updates

The dashboard maintains a WebSocket connection for real-time updates. When an agent run changes status, the UI updates automatically without page refresh.

If the WebSocket disconnects, the connection status indicator shows "reconnecting" and a 5-second polling fallback activates. Updates resume normally when the connection is restored.

---

## Related

- [Feature Development Guide](../guides/feature-development.md) - Using `/build` and other commands
- [PR Review Guide](../guides/pr-review.md) - Reviewing pull requests with agents
