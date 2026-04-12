# rp1 - Interaction Model

**Project**: rp1
**Analysis Date**: 2026-04-12
**Surfaces**: CLI, Host Tool Integration, Arcade Web UI, Agent Tools CLI, Reference Docs, Init Wizard

## Experience Principles

- **Keyboard-first monitoring**: Arcade remains keyboard-first and mouse-optional for run navigation, dialogs, command palette usage, dense list movement, and notification management.
- **Observable workflows**: Long-running skills expose named runs, explicit phase transitions, gate pauses, and registered artifacts so progress is legible across host tools and Arcade.
- **Evidence before questions**: Interactive workflows should read repo or KB material first and ask only for facts or decisions that materially change the output.
- **Durable handoffs**: Intermediate artifacts are source-of-truth handoffs rather than disposable scratchpads; workflows preserve them across review, block, and cancel paths.
- **Outcome-first documentation**: User-facing docs should start from the reader's outcome, prefer one clear path, and use concrete commands, paths, defaults, and examples while matching repo style.
- **Automation-aware CLI**: CLI commands stay human-usable but expose explicit machine-friendly modes such as JSON output, lint-only checks, and lazy-loaded agent tooling.
- **Attention-proportional notification**: Notifications are categorized by attention level (action required, attention, informational) so high-priority items surface prominently while low-priority items remain accessible without interrupting flow.
- **Exclusive overlay model**: Only one overlay (command palette, notifications sidebar) is active at a time, preventing state confusion and ensuring keyboard shortcuts always have unambiguous targets.

## Actors & Surfaces

| Actor | Surfaces | Goals | Entry Points |
|-------|----------|-------|--------------|
| Developer | CLI, Init Wizard, Reference Docs | Set up rp1, install or build artifacts, launch monitoring, migrate projects, learn command and workflow entry points | `rp1 init`, `rp1 install`, `rp1 arcade`, `rp1 build`, `rp1 migrate`, `docs/reference/index.md` |
| Collaborating Developer | Host Tool Integration, Arcade Web UI | Invoke tracked workflows, answer gates, review drafts or docs updates, manage notifications, browse project files, decide whether to accept, revise, rebuild, or stop | `/write-content`, `/generate-user-docs`, `/prompt-writer`, `/build`, `/knowledge-build`, `/runs/:runId`, `/projects/:projectId/files` |
| AI Agent | Agent Tools CLI, Host Tool Integration, Arcade Web UI | Execute structured workflows, emit state and artifact events, process file batches, keep parent runs coherent | `rp1 agent-tools emit`, `rp1 agent-tools resolve-args`, `rp1 agent-tools rp1-root-dir` |

## Surface Detail

### CLI
**Role**: Project setup, maintenance, artifact build, daemon launch, project migration, and agent-tool entrypoint.
**Primary actions**: Initialize and configure rp1, install plugins to supported hosts (with scope options for Claude Code), launch Arcade, build artifacts, migrate existing projects to the project-local directory model, list installed skills with optional JSON output, and use JSON or lint-only build modes for automation.

### Host Tool Integration
**Role**: Conversational execution surface for slash-command workflows inside supported assistants.
**Primary actions**: Start tracked workflows, respond to `ask_user` gates, request revision or cancellation, and receive concise completion summaries with artifact paths.

### Arcade Web UI
**Role**: Live observability, artifact review, notification, file browsing, and feedback surface for workflow runs.
**Primary actions**: Watch named runs and phase timelines via the Activity feed, filter runs by status, project, and date range, see waiting gates and completion states, open registered artifacts with table-of-contents navigation and follow mode, browse project file trees, manage notifications grouped by attention level in a slide-out sidebar, view run invocation context (workflow, run policy, worktree state), annotate or resolve feedback, and use the command palette for navigation and actions.

### Agent Tools CLI
**Role**: Protocol surface for workflow state, path resolution, artifact registration, and feedback operations.
**Primary actions**: Emit `status_change`, `waiting_for_user`, and `artifact_registered` events, validate state-machine alignment, resolve arguments and project roots, and bridge agent work into Arcade-visible state.

### Reference Docs
**Role**: Preflight discovery surface explaining harness-specific invocation, parameters, outputs, and phase models before a workflow starts.
**Primary actions**: Compare Claude Code and OpenCode invocation syntax, inspect parameters and examples, and understand workflow phases and output paths.

### Init Wizard
**Role**: Interactive terminal UI for first-time or guided project initialization.
**Primary actions**: Select git-root behavior, choose reinit behavior, pick gitignore preset, and review detected tools and next steps.

## User-Visible States

| State | Meaning | Surface Signals |
|-------|---------|-----------------|
| `running` | A workflow phase is actively executing. | `status_change` with `running`, named phase in the dashboard timeline, pulsing amber status dot in Activity feed |
| `waiting_for_user` | The workflow is intentionally paused for a user decision or missing input. | `waiting_for_user` emit before prompt, host-tool options, Arcade gate pause, amber status dot and "waiting" label in Activity feed, action-required notification |
| `blocked` | The workflow cannot continue because required facts or decisions remain unresolved. | Concise gap report, failed terminal path, preserved brief or scan artifact |
| `cancelled` | The user chose to stop or reject a gate, and the workflow exits without silently discarding work products. | `skipped`-style terminal path, explicit stop/no option, preserved intermediate artifacts |
| `completed` | A workflow finished successfully and has surfaced its final outputs. | Final `completed` emit, artifact registration, short completion summary, ghost-colored status dot in Activity feed |
| `failed` | A workflow phase or run terminated with an error. | Red status dot in Activity feed, error message in run detail, attention-level notification |
| `kb_stale` | Docs sync detected that the KB is behind `HEAD` but still structurally readable. | Warning block with generated time, KB commit, `HEAD`, and a continue/rebuild/cancel gate |
| `partial_update` | A docs-sync file was usefully updated, but some edits failed or review markers remain. | Per-file `partial` status and final report counts separating partial files |
| `connection_status` | Arcade distinguishes live-update health from reconnecting or fallback behavior. | Terminal-green blinking cursor when connected, terminal-red cursor and reconnect tooltip when disconnected; reconnect recovery preserves scroll position |
| `annotation_status` | Artifact feedback is visibly open or resolved. | Yellow indicator and gutter highlight for open feedback, green indicator for resolved feedback |
| `notification_attention` | Each notification carries an attention level determining its visual priority. | Action-required: pulsing amber dot and amber badge count; Attention: amber dot; Informational: ghost dot |

## Feedback Loops

- **Workflow gate loop**: A phase needs a user choice or missing information, the workflow emits `waiting_for_user`, Arcade shows the pause, the host tool asks the question, and the answer resumes, revises, rebuilds, or cancels the run.
- **Content drafting loop**: `write-content` normalizes the request, writes `brief.md`, clarifies only blockers, drafts, self-reviews, opens a review gate, and preserves the brief on block or stop.
- **Docs sync loop**: `generate-user-docs` discovers docs, infers style, validates KB freshness, runs a stale-KB gate if needed, scans in parallel, preserves `scan_results.json`, asks once for approval, then processes batches and reports totals.
- **Prompt authoring loop**: `prompt-writer` analyzes the target, loads extra rp1 guidance when needed, writes or rewrites the prompt, validates it, and can cycle through revise until accepted or stopped.
- **Artifact registration loop**: When a workflow creates a durable output, it emits `artifact_registered` with explicit `storageRoot` so Arcade can resolve and show the file while the host tool reports the final path.
- **Annotation feedback cycle**: User comments or edits an artifact in Arcade, the runtime persists the change, agents read it through feedback tooling, and replies or resolutions update the UI in real time.
- **Notification lifecycle loop**: Workflow events (gates, failures, completions) produce notifications delivered via WebSocket. Toasts auto-dismiss after 6 seconds or on user click. Persistent notifications appear in the sidebar grouped by attention level and can be individually dismissed via API. Clicking a notification with a route navigates to the relevant run or artifact.
- **Activity feed refresh loop**: The Activity feed auto-refreshes when the WebSocket `attention` signal fires or when a reconnect recovery occurs, ensuring the run list stays current without manual polling.

## Keyboard Shortcuts

### Global (all views)
| Key | Action |
|-----|--------|
| `Cmd+K` | Toggle command palette |
| `Cmd+B` / `Cmd+\` | Toggle notifications sidebar |
| `Escape` | Close active overlay or blur focused element |
| `?` | Show keyboard shortcut help |
| `/` | Focus search |

### Navigation chords
| Chord | Destination |
|-------|-------------|
| `g h` | Home (Activity) |
| `g r` | Activity (runs) |
| `g p` | Projects |

### List navigation
| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `l` | Open selected item |
| `h` / ArrowLeft | Go back |

### Contextual (Artifact Viewer)
| Key | Action |
|-----|--------|
| `e` | Toggle table of contents |
| `c` | Copy artifact content |
| `[` / `]` | Previous / next artifact |
| `h` / ArrowLeft | Back to run detail |

### Contextual (File Browser)
| Key | Action |
|-----|--------|
| `e` | Toggle table of contents |
| `c` | Copy file content |
| `h` / ArrowLeft | Back to project |

## Accessibility & Discoverability

- **Roving tabindex** keeps dense run lists keyboard-navigable without trapping tab order inside every row.
- **Single-key shortcut suppression** protects text entry while preserving keyboard navigation elsewhere.
- **Chord timeout** (500ms) prevents accidental chord triggering and resets pending state visually via `data-chordPending`.
- **Reduced-motion fallback** replaces animated page transitions, toast animations, feed item animations, and command palette stagger effects with instant or zero-duration equivalents when the user prefers reduced motion.
- **Dialogs, focus rings, and status labels** remain screen-reader legible and should not rely on color alone.
- **Live region announcements**: Table-of-contents section changes are announced via `aria-live="polite"` regions in both the Artifact Viewer and File Browser. Notification toasts use an `aria-live="polite"` container.
- **`waiting_for_user` before any prompt** makes gate pauses visible in Arcade before the host tool asks the question.
- **Named first emits and state-machine-aligned steps** keep dashboard labels meaningful and prevent hidden phase drift.
- **Namespaced sub-agent steps** keep parent timelines readable and avoid collisions between parent and child workflow phases.
- **Explicit `storageRoot` on artifact registration** ensures outputs resolve predictably in the dashboard across work, project, and absolute paths.
- **Notification trigger badge**: The bell icon shows a numeric badge for actionable counts (action_required + attention) and a subtle dot for informational-only notifications, with a descriptive `aria-label` summarizing counts by category.
- **Shortcut registry**: A centralized `ShortcutRegistryProvider` tracks global, navigation, and contextual shortcuts so the help overlay always reflects the currently available bindings for the active view.

## Cross-Surface Deltas

| Behavior | Surfaces | Delta | Reason |
|----------|----------|-------|--------|
| Plugin installation | CLI, Host Tool Integration | Claude Code uses MCP registration with scope (user, project, local), OpenCode copies filesystem artifacts, and Codex uses its own artifact path. | Each host has a different plugin architecture. |
| Skill invocation syntax | Reference Docs, Host Tool Integration | Claude Code favors short slash commands with optional prefixes, while OpenCode uses rp1-prefixed slash names and `/skills` discovery. | Collision avoidance and host-specific browsing capabilities differ. |
| Semantic prompt authoring vs rendered harness output | CLI, Host Tool Integration, Agent Tools CLI | Prompt authors write semantic Liquid tags such as `dispatch_agent`, `ask_user`, `edit_model`, and `plan_tool`, and the build pipeline renders harness-specific instructions from that source. | One authored prompt needs to preserve intent across multiple assistants. |
| Execution vs observability | Host Tool Integration, Agent Tools CLI, Arcade Web UI | Host tools are the conversational work surface, Agent Tools carry the protocol events, and Arcade shows passive run status, gates, artifacts, and notifications. | rp1 separates doing the work from monitoring and intervening in it. |
| Artifact path resolution | Host Tool Integration, Agent Tools CLI, Arcade Web UI | Outputs can live under `.rp1/work`, the project root, or an absolute path, but every artifact must declare its root explicitly. | Intermediate workflow files and final deliverables have different lifetimes and locations. |
| Navigation model | Arcade Web UI, CLI, Host Tool Integration | Web UI uses spatial keyboard navigation, chord shortcuts, command palette, and contextual shortcut registry. CLI uses subcommands and flags. Host tools use slash commands and inline prompts. | Each surface follows its native interaction idiom. |
| Responsive layout | Arcade Web UI | Desktop uses an icon-rail sidebar, resizable panels, and slide-out notification drawer. Mobile uses a bottom tab bar with notification trigger, drawer-based artifact/ToC/annotation panels, and horizontal step selectors. | Desktop and mobile require different density and reach tradeoffs. |
| Notification delivery | Arcade Web UI, Agent Tools CLI | Agent Tools emit events that create notifications server-side. Arcade delivers them as real-time toasts (auto-dismiss 6s) and persists them in a dismissible sidebar grouped by attention level. Host tools receive gates inline. | Arcade is the passive monitoring surface; host tools handle active decisions. |
| Run invocation context | Arcade Web UI, Agent Tools CLI | The Arcade run detail page shows a dedicated invocation card with workflow name, run policy, decision (new/resumed/legacy), canonical and requested roots, worktree state, and work identity. Sensitive identity values are redacted server-side. Agent Tools record this context during workflow bootstrap. | Gives operators full provenance for debugging run behavior without exposing secrets. |

## Related KB Links

- **System topology**: See [architecture.md](architecture.md)
- **Component inventory**: See [modules.md](modules.md)
- **Terminology**: See [concept_map.md](concept_map.md)
- **Implementation details**: See [patterns.md](patterns.md)
