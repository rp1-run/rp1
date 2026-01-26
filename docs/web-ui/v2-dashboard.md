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
