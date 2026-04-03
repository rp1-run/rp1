# rp1 - Interaction Model

**Project**: rp1
**Analysis Date**: 2026-04-03
**Surfaces**: CLI, Arcade Web UI, Host Tool Integration, Agent Tools CLI, Init Wizard (Terminal UI)

## Experience Principles

- **Keyboard-first, mouse-optional**: Full keyboard navigation via vim keys (j/k/h/l), arrow keys, go-to chords (g then h/r/p), and command palette (Cmd+K). Single-key shortcuts suppressed in text inputs; modifier shortcuts always fire. Roving tabindex for accessibility.
- **Glanceable status, drill-down detail**: Home activity feed shows status dots, relative timestamps, harness icons, and command names at a glance. Drill into run detail for step timelines, artifact panels, and event streams. Target: under 30 seconds to orient.
- **TTY-aware progressive disclosure**: CLI commands adapt output to environment: TTY gets spinners (ora), colors, and interactive prompts; non-TTY gets line-by-line logs with icon prefixes. The --yes flag enables non-interactive mode for CI/automation.
- **Reduced motion respect**: Web UI checks prefers-reduced-motion and substitutes zero-duration opacity-only transitions for page and list item animations.
- **Bidirectional human-agent feedback loop**: Users leave annotations on artifacts in the web UI; agents read, reply, and resolve annotations via feedback agent-tools. Direct file edits detected via baseline diffing.
- **Real-time state via WebSocket with polling fallback**: Persistent WebSocket for live updates. On disconnect, exponential backoff reconnection with 5-second polling fallback activates automatically.

## Actors & Surfaces

| Actor | Surface | Goal | Entry Points |
|-------|---------|------|--------------|
| Developer | CLI | Set up rp1, manage plugins, control daemon | `rp1 init`, `rp1 install`, `rp1 arcade`, `rp1 self-update` |
| Developer | Arcade Web UI | Monitor runs, review artifacts, provide feedback | `/`, `/runs/:runId`, `/projects`, `Cmd+K` |
| AI Agent | Host Tool | Execute workflows via slash commands | `/build`, `/pr-review`, `/knowledge-build` |
| AI Agent | Agent Tools CLI | Emit events, manage feedback | `rp1 agent-tools emit`, `rp1 agent-tools feedback` |

## Primary Actions

### CLI
**Role**: Project setup, plugin management, system maintenance, and daemon control
**Primary actions**: Initialize project (interactive wizard or --yes), install plugins to host tools with scope selection, launch Arcade daemon, manage daemon lifecycle, validate settings, migrate legacy structure, self-update
**Intentional constraints**: Non-interactive by default in CI (--yes); TTY-adaptive output

### Arcade Web UI
**Role**: Real-time monitoring dashboard for agent runs, artifact viewing, and human-agent feedback
**Primary actions**: View activity feed with status/project/date filters, drill into run details with step timeline, annotate artifacts with text-selection comments, reply to and resolve annotations, dismiss notifications, navigate via command palette/go-to chords/vim keys, toggle theme (Catppuccin Mocha/Latte)
**Intentional constraints**: Keyboard-first; mouse optional; mobile uses bottom tab bar instead of sidebar

### Host Tool Integration
**Role**: Where developers invoke rp1 skills as slash commands within their coding assistant
**Primary actions**: Invoke workflow skills, receive structured agent output, interact with agent prompts
**Intentional constraints**: Platform-specific artifact format per host tool

### Agent Tools CLI
**Role**: Programmatic surface for agents to emit events, manage feedback, and resolve arguments. Not user-facing.
**Primary actions**: Emit workflow state transitions, read pending annotations/file edits, reply/resolve annotations, accept user file edits

### Init Wizard (Terminal UI)
**Role**: Interactive Ink-based terminal UI for project initialization
**Primary actions**: Select git root handling, choose reinit behavior, pick gitignore preset, view detected tools, review prioritized next steps

## User-Visible States

| State | Meaning | Surface Signals |
|-------|---------|-----------------|
| Running | Agent workflow actively executing | Amber pulsing status dot (animate-status-pulse) |
| Waiting | Agent blocked, needs user input | Amber dot (non-pulsing), accent-ghost highlight, 'waiting' badge, grouped under 'Waiting for you' |
| Completed | Workflow finished successfully | Ghost-colored status dot, green checkmark in timeline |
| Failed | Workflow encountered error | Red status dot (bg-failure), red X in timeline, grouped under 'Failed' |
| Needs Review | Work complete, artifacts await review | Mauve status color, grouped under 'Needs review' |
| WS Connected | Live updates flowing | Terminal-green blinking cursor after 'rp1' logo |
| WS Disconnected | Connection lost, auto-reconnecting | Terminal-red blinking cursor, tooltip 'Reconnecting...' |
| Init Step | Wizard progress | Spinner (running), checkmark (done), cross (failed), dash (skipped) |
| Annotation Open | Feedback requiring attention | Yellow vertical indicator line, yellow gutter highlight |
| Annotation Resolved | Feedback addressed | Green vertical indicator line, green gutter highlight |

## Feedback Loops

- **Annotation feedback cycle**: User selects text in artifact viewer -> submits comment -> persisted to DB + WebSocket broadcast -> agent reads via `feedback read` -> agent replies (agent-attributed) or resolves -> real-time UI update
- **Direct file edit detection**: User edits artifact file on disk -> agent detects via baseline diff -> shows unified diff -> agent accepts edit (clears baseline)
- **Run status live updates**: Agent emits state transition -> SQLite insert -> WebSocket broadcast -> activity feed updates with status dot change
- **Notification feed**: System events generate notifications -> interleaved with runs in feed -> dismissible via X -> clickable to navigate
- **Init wizard guided setup**: Step-by-step wizard with real-time progress (spinners, checkmarks) -> contextual prompts -> final summary with next steps
- **Self-update with version check**: Detects installation method -> checks for updates -> shows current->latest version -> executes update with signal handling

## Accessibility & Discoverability

- **Roving tabindex**: Only selected list item in tab order; arrow/vim keys move within list; Tab moves out. ARIA listbox pattern with aria-activedescendant.
- **Vim key suppression**: Single-key shortcuts (j/k/h/l/g/?//) disabled in text input/textarea/contenteditable elements.
- **Reduced motion**: Page transitions and list animations respect prefers-reduced-motion, substituting instant opacity transitions.
- **ARIA dialog roles**: Command palette and shortcut help use Radix Dialog primitives with focus trapping.
- **Status dot aria-labels**: Visual indicators include aria-label ('Running', 'Failed', 'Waiting') for screen readers.
- **Focus-visible rings**: Interactive elements show focus ring (focus-visible:ring-1) only on keyboard navigation.
- **Connection status**: Logo cursor doubles as WebSocket indicator with aria-label='rp1 - Connection status: {status}'.

## Cross-Surface Deltas

| Behavior | Surfaces | Delta | Reason |
|----------|----------|-------|--------|
| Plugin installation | CLI | Platform-specific: CC uses MCP registration with scope; OpenCode copies to filesystem; Codex copies to artifact dir | Each host tool has different plugin architecture |
| Navigation model | Web UI, CLI, Host Tool | Web: spatial (vim/chords/palette); CLI: subcommands+flags; Host: slash commands | Native idioms per surface |
| Feedback attribution | Web UI, Agent Tools | Web annotations: author='user'; Agent replies/resolutions: author='agent' | Structural distinction for collaborative loop |
| Responsive layout | Web UI | Desktop: IconRail sidebar; Mobile: fixed bottom MobileTabBar with palette access | Sidebar for desktop, thumb nav for mobile |
| Non-interactive mode | CLI, Init Wizard | --yes skips prompts with defaults; non-TTY suppresses spinners; --interactive forces wizard in non-TTY | CI/CD automation support |

## Related KB Links

- **System topology**: See [architecture.md](architecture.md)
- **Component inventory**: See [modules.md](modules.md)
- **Terminology**: See [concept_map.md](concept_map.md)
- **Implementation details**: See [patterns.md](patterns.md)
