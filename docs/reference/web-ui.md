# Web UI Reference

The rp1 web UI provides a browser-based interface for viewing documentation and monitoring agent activity.

## Launching the Web UI

```bash
rp1 view
```

This opens the documentation viewer at `http://localhost:7710`.

---

## Status Dashboard

The Status Dashboard provides real-time visibility into agent workflow progress across your projects.

### Route

```
/project/:id/status
```

Where `:id` is the project identifier (typically the project directory name).

### Features

- **Active Features**: Shows features currently being worked on by agents
- **Recently Completed**: Features completed within the last 24 hours (collapsible)
- **Real-time Updates**: Automatic refresh via WebSocket connection
- **Fallback Polling**: 5-second polling interval when WebSocket unavailable

### UI Components

#### Feature Card

Each feature displays:

| Element | Description |
|---------|-------------|
| Status Indicator | Visual symbol showing current status |
| Feature Name | The feature identifier (kebab-case) |
| Current Task | Active task within the feature (if set) |
| Message | Human-readable status message |
| Relative Time | Time since last update (e.g., "2 min ago") |

#### Status Indicators

| Status | Symbol | Color | Description |
|--------|--------|-------|-------------|
| `started` | Circle (empty) | Mauve | Work has begun |
| `in_progress` | Circle (filled) | Green | Active work in progress |
| `completed` | Checkmark | Muted | Work finished successfully |
| `failed` | X mark | Red | Work encountered an error |

### Auto-Refresh Behavior

The dashboard updates automatically through two mechanisms:

1. **WebSocket Connection**: Real-time push notifications when status changes
2. **Polling Fallback**: 5-second interval refresh when WebSocket is unavailable

The "Auto" toggle in the header enables/disables automatic refresh. When enabled, a green indicator shows; when disabled, manual refresh via the "Refresh" button is required.

### Connection Status

The footer displays the current connection state:

| State | Indicator | Description |
|-------|-----------|-------------|
| Connected | Green dot + "Live updates active" | WebSocket connected, real-time updates enabled |
| Disconnected | Red dot + "Reconnecting..." | WebSocket disconnected, attempting reconnection |

### Example Display

```
> Status Dashboard                          [Refresh] Auto *

## Active Features

+---------------------------------------------------+
| * auth-refactor                     in_progress   |
|   task: requirements                              |
|   "Gathering requirements from PRD"               |
|                                      2 min ago    |
+---------------------------------------------------+

+---------------------------------------------------+
| o api-optimization                      started   |
|   "Starting feature implementation"               |
|                                      5 min ago    |
+---------------------------------------------------+

## Recently Completed (1)                       [v]

+---------------------------------------------------+
| / bug-fix-123                       completed     |
|                                    3 hours ago    |
+---------------------------------------------------+

                 * Live updates active
```

### API Endpoint

The dashboard fetches data from:

```
GET /api/projects/:id/status
```

#### Response Format

```typescript
interface StatusResponse {
  projectId: string;
  active: FeatureStatus[];
  recentlyCompleted: FeatureStatus[];
  lastUpdated: string;
}

interface FeatureStatus {
  feature: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  currentTask: string | null;
  message: string | null;
  lastUpdate: string;
  updates: StatusUpdate[];
}

interface StatusUpdate {
  id: number;
  task: string | null;
  status: string;
  message: string | null;
  createdAt: string;
}
```

---

## Keyboard Shortcuts

The web UI supports vim-style keyboard navigation for efficient workflow management. These keys work alongside arrow keys without requiring a mode toggle.

### List Navigation

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Down | `j` | Move to next item |
| Arrow Up | `k` | Move to previous item |

### Drill Navigation

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Right / Enter | `l` | Drill into selected item |
| Arrow Left | `h` | Drill out to parent (go back) |

### Selection

| Key | Action |
|-----|--------|
| Enter | Open/select current item |
| Escape | Clear selection |

Vim keys are automatically disabled when focus is in a text input field.

For detailed keyboard shortcut documentation, see [Keyboard Shortcuts](../web-ui/keyboard-shortcuts.md).

---

## Related

- [`work` Agent Tool](cli/work.md) - CLI tool for recording status updates
- [Feature Development Guide](../guides/feature-development.md) - Using `/build` workflow
- [Keyboard Shortcuts](../web-ui/keyboard-shortcuts.md) - Complete keyboard shortcut reference
