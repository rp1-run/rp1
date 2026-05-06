# rp1 - Interaction Model

**Repository**: rp1
**Analysis Date**: 2026-05-06
**Surfaces**: CLI, Init Wizard, host-tool workflows, agent-tools CLI, Arcade web UI, native Arcade shell, reference docs

## Experience Principles

- **Event-sourced workflow observability**: User-visible progress is projected from emitted run, step, artifact, notification, and snapshot events. Arcade observes and recovers; workflow prompts own execution semantics.
- **Explicit gates over inferred progress**: Workflows stop at decisions, contract gaps, stale prerequisites, dirty worktrees, or quality gates by emitting waiting states and asking bounded questions.
- **Durable artifact handoffs**: Structured artifacts are stable handoffs between agents, CLI, Arcade, and later workflows. File and URL artifacts are registered explicitly with storage roots and relationships.
- **Keyboard-first workspace shell**: Arcade prioritizes command palette access, navigation chords, drawer toggles, roving list focus, and workspace tab controls while preserving text input behavior.
- **Progressive detail disclosure**: Feeds, badges, filters, and notification groups stay glanceable; metadata, frontmatter, steps, file trees, TOCs, annotations, and commands are opt-in drill-down layers.
- **Contract-gated rich readers**: Specialized artifact readers appear only when contracts validate. PR walkthrough slide mode falls back to markdown when unsupported or malformed.
- **Fail-closed quality boundaries**: Review, verification, cleanup, and publication surface missing evidence as warnings, waiting gates, or failures rather than silently proceeding.
- **Automation-aware command surfaces**: CLI and workflows expose dry-run, JSON, hook, daemon-only, AFK, and non-interactive modes for humans and hosts.
- **Project-scoped recovery**: Arcade preserves tabs, replay cursors, activity history, file context, and search indexes per project across reloads and daemon restarts.

## Actors & Surfaces

| Actor | Surfaces | Goals |
|-------|----------|-------|
| Developer or operator | CLI, Init Wizard, Arcade, host workflows | Initialize projects, run workflows, monitor progress, inspect artifacts, respond to gates. |
| Arcade monitor and reviewer | Activity, Run Detail, Artifact Viewer, Notifications, Project Browser | Scan activity, open run workspaces, triage notifications, annotate artifacts, follow external links. |
| Workflow orchestrator agent | Host workflows, agent-tools CLI, Arcade run detail | Emit transitions, delegate work, register artifacts, pause for user decisions, close runs accurately. |
| PR reviewer or maintainer | PR Review, PR Walkthrough, Address Feedback, Artifact Viewer | Review PRs, generate walkthroughs, address feedback, inspect CI-aware results. |
| Project and knowledge maintainer | Knowledge Build, User Docs, Birds-Eye View, Work Search | Refresh KB context, generate user docs, produce overviews, search work artifacts. |
| Prompt or governance author | Prompt Writer, Build Prompt, Socratic Duel | Build governed prompts, run structured debates, capture confidence and decisions. |

## Surface Responsibilities

### CLI
**Role**: Primary command surface for starting Arcade, installing integrations, verifying setup, migrating state, updating rp1, and developer simulations.
**Entry points**: `rp1 arcade`, `rp1 init`, `rp1 install`, `rp1 verify`, `rp1 migrate`, `rp1 update`, `rp1 fake`.
**Primary actions**: Start/reuse daemon, register project, open/stop Arcade, install/verify hosts, dry-run migrations, update plugins.

### Init Wizard
**Role**: Terminal onboarding surface with stepwise prompts, progress, warnings, and recovery decisions.
**Primary actions**: Choose git-root, ancestor/nested project, reinitialization, gitignore, and health-check behavior.

### Host Tool Workflows
**Role**: Skill and agent invocation surface where workflows run, ask questions, delegate, and emit state.
**Entry points**: `/build`, `/build-fast`, `/speedrun`, `/pr-review`, `/pr-walkthrough`, `/knowledge-build`, `/generate-user-docs`, `/socratic-duel`, `/build-prompt`.
**Primary actions**: Resolve arguments, emit run states, ask approvals, spawn sub-work, register artifacts, close runs.

### Agent Tools CLI
**Role**: Machine-facing contract for event emission, argument resolution, root discovery, work search, and run/artifact registration.
**Entry points**: `emit`, `resolve-args`, `rp1-root-dir`, `workflow-bootstrap`, `workflow-state`, `work-search`.

### Arcade Web UI
**Role**: Browser workspace for monitoring projects, activity, runs, files, notifications, command palette actions, and persistent tabs.
**Entry points**: `/`, `/projects`, `/runs/:runId`, `/projects/:projectId`, `/projects/:projectId/files`, `/artifacts/:artifactId`.

### Run Detail and Artifact Viewer
**Role**: Focused inspection surface for a run, steps, invocation, artifacts, links, markdown, slide reader, and annotations.
**Primary actions**: Cancel live run, select artifacts, open external links, toggle metadata/frontmatter, switch markdown/slides, add/resolve annotations.

### Project File Browser
**Role**: Project-scoped browsing surface for files, markdown, table of contents, and live file refresh without artifact annotation semantics.

### Reference Documentation
**Role**: User-facing semantic contract for Arcade, keyboard behavior, artifact reading, Socratic Duel, and work search.

## User-Visible States

| State | Meaning | Surface Signals |
|-------|---------|-----------------|
| `running` | Workflow or step is actively executing and may stream events. | Status badge, activity row, current step, WebSocket updates. |
| `waiting` | Execution is paused for a user decision or contract gate. | Waiting badge, ask-user prompt, action-required notification, run message. |
| `completed` | Workflow reached intended terminal outcome and required artifacts should be registered. | Completed badge, closed run, artifact list, success row. |
| `failed` | Terminal blocker, invalid contract, missing prerequisite, or failed verification. | Failed badge, error panel, terminal refetch. |
| `cancelled` | User or workflow intentionally stopped before completion. | Cancelled badge, cancel confirmation, end-run event. |
| `inactive` / `abandoned` | Run is no longer progressing but did not complete normally. | Terminal grouping, activity filter, status label. |
| `not_started` / skipped | Step exists in workflow model but has not run or was intentionally bypassed. | Step list status, workflow graph state, skipped init step. |
| Artifact file | Run output that Arcade can render. | Artifact sidebar item, new/updated badge, markdown/slides/outline affordances. |
| Artifact link | URL output that should open outside the local artifact reader. | Link sidebar item, external-open action, copy URL action. |
| Annotation open/resolved/orphaned | Artifact comment is actionable, complete, or detached after content changes. | Inline markers, sidebar grouping, orphan status. |
| Notification action_required/attention/info | Updates grouped by urgency. | Drawer groups, summary counts, toast, read-all action. |
| Connection connecting/connected/disconnected | Arcade live event stream status. | Connection status, replay, snapshot reconciliation, polling fallback. |
| Workspace tab active/persisted/closed | Durable destinations and closable workspaces preserve navigation state. | Tab strip, active tab, close button, restored route. |
| Readiness `PASS`/`WARN`/`FAIL`/`WAITING` | Build verification outcome for release or follow-up decisions. | Readiness artifact, release gate, follow-up options. |

## Feedback Loops

- **Workflow gate loop**: A workflow reaches a decision checkpoint, stale prerequisite, dirty tree, oversized scope, or retry exhaustion -> emits waiting status -> asks a bounded question.
- **Live event projection loop**: Workflows emit status, step, artifact, notification, or file-change events -> Arcade updates feeds, run details, artifacts, notifications, and summaries.
- **Reconnect and reconciliation loop**: WebSocket reconnects or receives replay/snapshot -> Arcade replays from last event id and falls back to polling when needed.
- **Artifact registration loop**: Workflow emits `artifact_registered` -> run detail gains a readable file or external link.
- **Annotation collaboration loop**: User selects text, opens annotation, replies, resolves, or reloads changed content -> inline markers and sidebars reconcile state.
- **Notification lifecycle loop**: Run emits notification or user dismisses one -> toasts, groups, counts, and read-all state update through REST/WebSocket.
- **Workspace lifecycle loop**: User opens run, project, file browser, or artifact route -> Arcade deduplicates tabs, persists active workspace, and restores routes.
- **Activity search and filter loop**: User changes query/filter/page -> local history updates matching feed rows, preview selection, empty states, and pagination.
- **Builder-reviewer readiness loop**: Task is implemented and reviewed -> retries, follow-ups, readiness status, and release gates determine next work.
- **Setup verification loop**: User installs, verifies, migrates, uninstalls, or updates -> CLI reports OK/MISS/WARN, dry-run actions, remediation, restart reminders, or nonzero exit codes.

## Accessibility & Discoverability

- Single-key shortcuts are suppressed in text inputs; modifier shortcuts remain available.
- Navigation lists and artifact sidebars use roving focus and arrow-key movement.
- Workspace tabs support normal tab order plus arrow, Home, End, Enter, Space, Delete, and Backspace behavior.
- Overlays and drawers close with Escape and expose dialog or drawer semantics.
- Status changes and transient notifications use visible labels and live-region style announcements.
- Reduced motion short-circuits toast removal animation.
- Annotation reply and save flows support keyboard confirmation.
- Mobile and narrow layouts convert dense side panels into explicit drawers and workspace navigation.
- Fallback, loading, empty, and error states are explicit surfaces.
- Init wizard prompts expose selected options, descriptions, arrow navigation, and Enter selection.

## Cross-Surface Deltas

| Behavior | Surfaces | Delta | Reason |
|----------|----------|-------|--------|
| Execution vs observation | Host workflows, agent-tools, Arcade | Workflows own prompts, transitions, delegation, and artifacts; Arcade observes, filters, navigates, annotates, and opens links. | Keeps workflow authority in prompts while giving users durable monitoring. |
| Waiting state naming | Host workflows, Arcade | Emits may use `waiting_for_user`; Arcade presents `waiting`. | Separates machine specificity from dashboard status language. |
| Durable destinations vs closable workspaces | Arcade | Activity and Projects are stable; run detail, project overview, and file browsers are closable tabs. | Separates anchors from temporary investigative contexts. |
| Desktop vs narrow navigation | Arcade Activity, Run Detail | Wide screens show split inbox/preview; narrow screens open/focus a run tab. | Preserves scan-and-compare on desktop without cramped mobile split views. |
| File vs URL artifacts | Artifact Viewer, Link Sidebar | Files render in Arcade; URLs appear as external links. | External review targets remain external records. |
| Slide vs markdown reader | Artifact Viewer | Slides require valid PR walkthrough slide-source; markdown is universal and annotation-capable. | Specialized affordances depend on explicit contracts. |
| Interactive vs AFK workflows | Build, Build Fast, Speedrun, Init | Interactive modes ask; AFK/non-interactive modes choose deterministic defaults or skip optional prompts. | Supports unattended automation without removing manual gates. |
| Local vs CI PR review | PR Review, GitHub/CI | Local review may pause for dirty worktree/description; CI mode cannot prompt. | Automated environments cannot wait for cleanup decisions. |
| Tracked vs passive workflows | Knowledge Build, Arcade | Most workflows emit Arcade-visible run state; knowledge-build is passive and reports no Arcade-visible run. | KB refresh is context maintenance rather than an interactive tracked run. |
| Human vs machine CLI output | CLI, hooks, daemon | Commands offer text, dry-run summaries, JSON, hook payloads, and hidden daemon modes. | One command layer supports terminals, shell hooks, and host automation. |

## Related KB Links

- **System topology**: [architecture.md](architecture.md)
- **Modules and projects**: [modules.md](modules.md)
- **Terminology**: [concept_map.md](concept_map.md)
- **Implementation details**: [patterns.md](patterns.md)
