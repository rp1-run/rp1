# rp1 - Interaction Model

**Project**: rp1
**Analysis Date**: 2026-04-14
**Surfaces**: CLI, Host Tool Integration, Arcade Web UI, Agent Tools CLI, Reference Docs, Init Wizard

## Experience Principles

| Principle | Description |
|-----------|-------------|
| Keyboard-first monitoring | Arcade is keyboard-first and mouse-optional for run navigation, dialogs, command palette, and notification management |
| Observable workflows | Long-running skills expose named runs, explicit phase transitions, gate pauses, and registered artifacts |
| Evidence before questions | Interactive workflows read repo or KB material first and ask only for material-changing facts or decisions |
| Durable handoffs | Intermediate artifacts are source-of-truth handoffs preserved across review, block, and cancel paths |
| Contract-gated artifact views | Specialized artifact readers appear only after artifact contracts validate; markdown remains the source-of-truth fallback |
| Automation-aware CLI | CLI commands expose machine-friendly modes: JSON output, lint-only checks, hook-json format, daemon-only startup |
| Attention-proportional notification | Notifications categorized by attention level (action_required, attention, info). Bulk dismiss via "Read all" enables efficient triage |
| Exclusive overlay model | Only one overlay active at a time. Side panels (ToC, annotations) are mutually exclusive within artifact viewer |
| Progressive detail disclosure | Secondary metadata (frontmatter, run invocation context) hidden by default, surfaced via contextual commands. State persists in sessionStorage |

## Surfaces

| Surface | Role | Key Entry Points |
|---------|------|------------------|
| CLI | Project setup, maintenance, artifact build, daemon launch | `rp1 init`, `rp1 install`, `rp1 arcade`, `rp1 arcade --daemon-only`, `rp1 arcade --format hook-json`, `rp1 build` |
| Host Tool Integration | Conversational execution for slash-command workflows | `/write-content`, `/generate-user-docs`, `/build`, `/knowledge-build` |
| Arcade Web UI | Live observability, artifact review, walkthrough slide reading, notification, file browsing, feedback | `/`, `/projects`, `/runs/:runId`, `/runs/:runId/artifacts/:path`, `/projects/:projectId/files/:path` |
| Agent Tools CLI | Protocol surface for workflow state, path resolution, artifact registration | `rp1 agent-tools emit`, `resolve-args`, `rp1-root-dir`, `feedback` |
| Reference Docs | Preflight discovery for harness-specific invocation and parameters | `docs/reference/`, `docs/arcade/` |
| Init Wizard | Interactive terminal UI for project initialization | `rp1 init` |

## User-Visible States

| State | Meaning | Surfaces |
|-------|---------|----------|
| running | A workflow phase is actively executing | Arcade, Agent Tools |
| waiting_for_user | Workflow paused for user decision | Arcade, Host Tool, Agent Tools |
| completed | Workflow finished with final outputs | Arcade, Host Tool, Agent Tools |
| failed | Phase or run terminated with error | Arcade, Agent Tools |
| blocked | Required facts or decisions unresolved | Host Tool |
| cancelled | User chose to stop; work products preserved | Host Tool |
| kb_stale | KB behind HEAD but still readable; continue/rebuild/cancel gate | Host Tool |
| connection_status | Live-update health vs reconnecting/fallback | Arcade |
| annotation_status | Artifact feedback open or resolved | Arcade |
| artifact_view_mode | Supported walkthrough artifacts can render as slides or markdown; unsupported or failed slide rendering uses markdown | Arcade |
| notification_attention | Per-notification attention level (action_required, attention, info) | Arcade |
| frontmatter_visibility | Artifact/file frontmatter shown/hidden per view (sessionStorage) | Arcade |
| run_metadata_visibility | Run invocation metadata shown/hidden (sessionStorage) | Arcade |

## Feedback Loops

| Loop | Trigger | Behavior |
|------|---------|----------|
| Workflow gate | Phase needs user choice | Emit waiting_for_user -> Arcade shows pause -> Host tool asks -> Answer resumes/revises/cancels |
| Artifact registration | Workflow creates durable output | Emit artifact_registered with storageRoot -> Arcade resolves and shows file |
| Annotation feedback | User comments/edits artifact in Arcade | Runtime persists change -> Agents read via feedback read -> Replies update UI via WebSocket |
| Notification lifecycle | Events produce notifications | Emitted workflow events and notifications arrive over the project WebSocket -> Toast auto-dismiss (6s) with dedup guard -> Sidebar grouped by attention -> Individual dismiss via X, bulk via "Read all" |
| Contextual command registration | View mounts with commands | ShortcutRegistryProvider stores view commands -> Command palette shows view-labeled group -> User executes -> Cleanup on unmount |
| Emit-driven run projection | `event:notification` or `event:replay` arrives for a project | Browser stores `lastEventId`, reduces the event through `LiveRunIndex`, and patches only the affected run detail, feed rows, attention groups, and project summaries |
| Snapshot reconciliation | Reconnect gap is too large for replay | Browser reconnects with the saved project cursor -> Server sends `state:snapshot` -> Client replaces the project's active-run subset and only refetches visible collections whose membership may now be stale |
| Recovery fallback | Live socket is disconnected or replay was missed entirely | Persisted REST state plus disconnected-only polling restore the latest run truth without treating broad refresh as the normal workflow-status path |
| Artifact viewing mode | Supported PR walkthrough artifact content loads in Arcade | Browser parses the fetched markdown contract -> valid decks default to Slides mode -> user can switch to Markdown -> unsupported, malformed, or failed slide rendering shows markdown with a fallback notice |

## Artifact Surface Behavior

| Behavior | Contract |
|----------|----------|
| Walkthrough slide reader | File-backed markdown artifacts that declare `rp1_contract: pr-walkthrough-slide-source` and contain valid line-alone slide markers open in Slides mode from the existing artifact surface |
| Markdown fallback | The original markdown content stays available in Markdown mode and is shown for unsupported artifacts, invalid contracts, parser failures, or Reveal.js render failures |
| Reader navigation | Slides mode owns horizontal and vertical navigation, active-slide position, active notes, evidence labels, and current-slide announcements |
| Artifact context | Run artifact selection, content fetching, cache behavior, and path reconciliation stay on the existing artifact surface; no server API or artifact schema change is required |
| Annotation behavior | Inline annotations remain on the markdown path; slide mode disables transformed-DOM annotation anchoring for this phase |

## Keyboard & Command System

- **Global shortcuts**: `g h` (home), `g p` (projects), `Cmd+K` (command palette), `n` (notifications)
- **Navigation shortcuts**: Arrow keys with roving tabindex, `Enter` to open, `Escape` to close
- **Contextual shortcuts**: Views register `ShortcutDefinition[]` and `CommandDefinition[]` via `useContextualShortcuts`
- **Command palette**: Navigation, actions, theme toggle, and per-view contextual commands with keyword search
- **Chord timeout**: 500ms with visual `data-chordPending` indicator
- **Text input guard**: Single-key shortcuts suppressed during text entry

## Cross-Surface Behavior

| Behavior | Delta |
|----------|-------|
| Plugin installation | Claude Code uses MCP registration with scope; OpenCode copies filesystem artifacts; Codex uses its own path |
| Skill invocation syntax | Claude Code uses short slash commands; OpenCode uses rp1-prefixed names |
| Execution vs observability | Host tools do the work; Agent Tools carry protocol; Arcade shows passive status |
| Responsive layout | Desktop: icon-rail sidebar + resizable panels. Mobile: bottom tab bar + drawers |
| Workflow freshness source | Arcade: emitted workflow events hydrate `LiveRunIndex`, run detail, and attention/project surfaces via scope-aware global/project `lastEventId` cursors. Host tools: inline gates still come from the emitting workflow |
| Artifact reader source | Host tools produce and register markdown artifacts; Arcade may add a contract-gated slide reader for supported PR walkthrough artifacts while retaining markdown fallback |
| Browser/native runtime contract | Browser launch defaults to `hostMode=browser`; native launch appends `hostMode=native` and `cacheBust` while loading the same loopback Arcade SPA. Both host modes validate the no-store `/api/v2/runtime` contract before route-level WebSocket consumers mount |
| Notification delivery | Arcade: real-time toasts with dedup + dismissible sidebar driven by the same emit stream. Host tools: inline gates |
| Recovery semantics | Arcade reconnects with its saved cursor, replays missed events when possible, and falls back to bounded snapshot reconciliation or persisted REST recovery only when needed |
| Run invocation context | Hidden by default, toggled via contextual command; shows workflow, run policy, worktree state |
| Daemon lifecycle modes | Full mode (register + browser), daemon-only (start without project), hook-json (structured output for hooks) |

## Accessibility

- Roving tabindex for dense lists without trapping tab order
- Single-key shortcut suppression during text entry
- Reduced-motion fallback for all animations
- Screen-reader aria-labels on status dots, notification triggers, commands
- Live region announcements for ToC navigation and notifications
- Walkthrough slide reader controls have accessible names, disabled boundary states, keyboard navigation, active-slide announcements, and a markdown fallback for source-order reading
- Named emits and state-machine-aligned steps for meaningful dashboard labels
- Namespaced sub-agent steps prevent timeline collisions
- Notification items use attention-level-differentiated backgrounds for visual triage
