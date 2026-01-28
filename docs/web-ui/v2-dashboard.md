# V2 Status Dashboard

The V2 dashboard provides a glanceable status view for monitoring AI agent runs across all your projects. Access it at `/v2/` when the web UI is running.

**Time to orient**: Under 30 seconds to understand what needs attention.

---

## Accessing the Dashboard

Start the web UI with `rp1 view`, then navigate to `/v2/` in your browser:

```bash
rp1 view
# Opens http://localhost:3000

# Navigate to V2 dashboard
# http://localhost:3000/v2/
```

The V2 dashboard runs alongside the existing documentation viewer at `/`. Both are fully functional.

---

## Data Sources

The V2 dashboard displays real data from your local rp1 installation. All run data is sourced from the status database at `~/.rp1/status.db`, which is populated when AI agents report their progress using the `work update` agent tool.

### How Runs Are Populated

When an agent (or any workflow) reports status via `rp1 agent-tools work update`, a record is written to `status.db`. The V2 API queries this database to populate the dashboard:

1. **Agent executes workflow** - Agents call `rp1 agent-tools work update` at key milestones (feature started, task in progress, completed, failed)
2. **Status stored in database** - Each update creates a record in `~/.rp1/status.db` with project path, feature name, task, status, and message
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

1. Agents are using the `work-status` skill to report progress
2. The status database exists at `~/.rp1/status.db`
3. The project is registered (runs are filtered by registered projects)

---

## Home Dashboard (Now View)

The home dashboard (`/v2/`) shows what needs your attention across all projects. Runs are grouped into four sections displayed in priority order:

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

The runs list (`/v2/runs`) shows all agent runs with filtering capabilities.

### Filters

| Filter | Options |
|--------|---------|
| **Status** | All, Running, Completed, Failed, Waiting |
| **Project** | Dropdown of registered projects |
| **Date Range** | Today, This Week, This Month, All Time |

Filters combine with AND logic. Clear all filters with the "Clear filters" button.

Filter state syncs to URL parameters for shareable links.

### Project-Scoped View

Navigate to `/v2/project/:projectId/runs` to view runs filtered to a specific project.

---

## Run Detail

The run detail view (`/v2/runs/:runId`) shows complete information about a single run.

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

The left sidebar provides navigation between V2 views:

| Item | Route | Description |
|------|-------|-------------|
| Home | `/v2/` | Attention dashboard |
| Runs | `/v2/runs` | All runs list |
| Projects | `/v2/projects` | Project list |

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

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + B` | Toggle sidebar collapse |

### List Navigation

| Key | Action |
|-----|--------|
| `Arrow Up` | Select previous item |
| `Arrow Down` | Select next item |
| `Home` | Jump to first item |
| `End` | Jump to last item |
| `Enter` | Open selected item |
| `Escape` | Clear selection |

Keyboard navigation uses the roving tabindex pattern for accessibility.

### Run Detail

| Key | Action |
|-----|--------|
| `Escape` | Return to runs list |

---

## Theme

The V2 dashboard uses the Catppuccin color palette:

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
