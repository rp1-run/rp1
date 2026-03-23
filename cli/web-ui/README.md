# rp1 Web UI

React-based web interface for the rp1 plugin system. Provides documentation viewing with live Mermaid diagram rendering and a real-time status dashboard for monitoring AI agent runs.

## Quick Start

```bash
# From project root, launch the web UI
rp1 arcade

# Opens http://localhost:3000
```

## Features

- Documentation viewer with syntax highlighting
- Live Mermaid diagram rendering with Catppuccin theming
- File tree navigation for `.rp1/` directory
- Real-time status dashboard
- WebSocket-based live reload
- Dark/light theme support (Catppuccin Mocha/Latte)

## Routes

### Status Dashboard

The dashboard provides a glanceable view of AI agent runs across all projects.

| Route | Description |
|-------|-------------|
| `/` | Home dashboard - attention-prioritized run overview |
| `/runs` | Runs list with filters (status, project, date range) |
| `/runs/:runId` | Run detail - timeline, artifacts, event stream |
| `/projects` | Project list |
| `/projects/:projectId/runs` | Project-scoped runs list |

See [Dashboard Documentation](../../docs/web-ui/dashboard.md) for detailed usage.

## Development

```bash
cd cli/web-ui

# Install dependencies
bun install

# Development server
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck
```

## Architecture

```
src/
  app/           # App entry, layouts, routing
    Layout.tsx     # Shell with sidebar
    routes.tsx     # Route configuration
  components/
    ui/          # Shared UI primitives (Radix-based)
    v2/          # Dashboard components
      StatusBadge.tsx
      RunCard.tsx
      StepTimeline.tsx
      AttentionSection.tsx
      FilterBar.tsx
      ArtifactList.tsx
      EventStream.tsx
  hooks/
    useAttention.ts    # Fetch attention-grouped runs
    useRuns.ts         # Fetch filtered runs list
    useRunDetail.ts    # Fetch single run
    useKeyboardNav.ts  # List keyboard navigation
  pages/
    v2/              # Page components
      HomePage.tsx
      RunsListPage.tsx
      RunDetailPage.tsx
      ProjectsPage.tsx
  providers/
    WebSocketProvider.tsx  # Real-time updates
    ThemeProvider.tsx      # Theme management
  server/
    routes/
      v2-api.ts      # API endpoints
  types/
    runs.ts          # Run data types
    websocket.ts     # WebSocket message types
```

## API Endpoints

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/runs` | GET | List runs with filters |
| `/api/v2/runs/:id` | GET | Single run detail |
| `/api/v2/runs/attention` | GET | Runs grouped by attention state |
| `/api/v2/projects` | GET | List projects |
| `/api/v2/projects/:id` | GET | Project detail |

Query parameters for `/api/v2/runs`:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `all` | Filter by status |
| `projectId` | string | - | Filter by project |
| `dateRange` | string | `all` | `today`, `week`, `month`, `all` |
| `limit` | number | `50` | Max results |
| `offset` | number | `0` | Pagination offset |

## WebSocket Events

Run status events:

| Event | Payload | Description |
|-------|---------|-------------|
| `run:status` | `{ runId, status, currentStep }` | Run status changed |
| `run:step` | `{ runId, stepId, status }` | Step status changed |
| `run:artifact` | `{ runId, artifact }` | Artifact created/updated |
| `run:event` | `{ runId, event }` | New event in stream |

## Tech Stack

- React 19
- Vite 6
- TypeScript
- Tailwind CSS (Catppuccin theme)
- Radix UI primitives
- Lucide React icons
- react-router-dom
- Bun runtime (server)
