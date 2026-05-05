# Implementation Patterns

**Project**: rp1
**Last Updated**: 2026-04-29

## Naming Conventions

- **Files**: Feature-scoped directories (`cli/src/commands/`, `cli/src/build/`); prompt assets use kebab-case skill folders with `SKILL.md`; React: PascalCase components, camelCase hooks
- **Functions**: CLI camelCase verbs; React hooks prefix `use`; error factories match their `_tag` (usageError, runtimeError)
- **Parameters**: UPPER_SNAKE_CASE enforced by `/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/`
- **Imports**: Relative TS imports keep `.js` suffixes; web-ui uses `@/` path alias; CSS classes use `rp1-` prefix to avoid Tailwind collisions

## Type Patterns

- **Discriminated unions**: `_tag` field on CLIError, `type` field on EventPayload
- **Enum tables**: SkillCategory, WorkflowRunPolicy, Status, EventType as string literal unions with parallel `VALID_*` arrays
- **Immutability**: `readonly` properties and `as const` assertions throughout; persisted artifacts as source-of-truth snapshots
- **Template strictness**: LiquidJS uses `strictVariables` and `strictFilters`

## Error Handling

- **Strategy**: Returns `Either` or `TaskEither<CLIError, A>`; formats errors once at CLI boundary via `formatError`; `tryCatchTE` wraps async
- **Propagation**: Parent skills gate on hard failures; batch workflows tolerate partial success
- **Validation staging**: L1 (syntax) then L2 (schema) in build pipeline
- **Error discrimination**: `isValidProject` distinguishes ENOENT from transient I/O errors instead of swallowing all
- **Common types**: UsageError, NotFoundError, ConfigError, RuntimeError, PrerequisiteError, ParseError, ValidationError, GenerationError, TransformError, PortInUseError

## Validation

- **Location**: Workflow intake and command boundaries
- **Method**: Explicit enum/default tables, existence checks, compatibility aliases
- **Additive-field propagation**: New fields (e.g., `arcadeTracked`) flow parser -> models -> validator -> template -> registry without breaking existing paths
- **Argument validation**: Each definition validated field-by-field with early return on first error

## fp-ts Pipeline Pattern

- Arcade command uses `pipe(loadConfig, TE.fromEither, TE.chain(...))` for all operation modes
- `tryCatchTE` wraps async operations with error factories
- `map`, `flatMap`, `isLeft` preferred over overengineered abstractions

## Concurrency Patterns

- **Async mutex**: `withRegistryLock` in server/registry.ts serializes read-modify-write cycles via promise-chain mutex
- **Toast dedup guard**: `NotificationContainer` uses functional state updater (`setToasts(prev => ...)`) to prevent duplicate toasts from concurrent WebSocket messages
- **Request identity tracking**: Web-UI hooks use `useCallback`/`useRef` to handle stale async responses
- **Lazy loading**: Heavy subsystems (daemon, emit relay) loaded via dynamic `import()` at runtime

## I/O Patterns

- **Database**: SQLite via `bun:sqlite` for runs, events, artifacts, annotations, notifications. Upsert semantics; dedup via `hasNotificationForSource`
- **File I/O**: Atomic writes via temp-file + rename (registry `saveRegistry`); PID file with mode 0o600; diagnostic log uses `appendFileSync`
- **Workflow event transport**: `rp1 agent-tools emit` persists canonical workflow events, then the daemon relays typed project-scoped WebSocket envelopes for status-bearing and attention-bearing live updates
- **Run artifact locations**: File artifacts keep the `path` plus `storageRoot` contract. Curated external links register as URL artifacts with `locationKind: "url"`, `type: "link"`, `url`, `label`, and `relationship`; optional `sourceContext` and `sourceArtifactPath` tie the link back to a report. URL artifact identity is deterministic per run, relationship, and canonical URL so completion retries update one artifact instead of creating duplicates
- **Link artifact scope**: Workflows should register only curated external links that represent run outputs, not every URL found in generated markdown. PR review is the first concrete workflow and registers only the reviewed PR URL as a `Reviewed PR` link artifact when available
- **HTTP clients**: Web-UI SPA seeds surfaces from `/api/v2/` and uses targeted hydration such as `GET /api/v2/runs/:id/summary`; reconnect polling stays limited to disconnected recovery instead of routine freshness
- **Freshness split**: Workflow status and attention come from emitted event delivery plus replay/snapshot recovery; file watching remains responsible only for artifact and file-content freshness
- **Directory-scoped agent I/O**: Code-writing agents resolve source-file paths against `codeRoot` (the worktree path when in a worktree, `projectRoot` otherwise). Work-artifact reads and writes use `workRoot` and KB reads use `kbRoot`, both of which always point to the canonical `.rp1/` tree. This separation ensures edits land in the user's active working tree while Arcade-visible artifacts remain at the shared canonical location

## PR/Review Workflow Patterns

- **Direct evidence source**: Review-orientation workflows should gather PR metadata, changed files, diffs, stats, and commits directly through `gh` and `git`; generated review artifacts are outputs, not source material for later synthesis
- **Evidence IDs**: Walkthrough-style artifacts assign stable IDs such as `E-PR-###`, `E-FILE-###`, `E-DIFF-###`, and `E-COMMIT-###`, then cite those IDs inline for major purpose, change, reviewer-focus, and risk claims
- **Markdown artifact registration**: Plain markdown review artifacts live under purpose-specific workRoot directories, such as `pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md`, and register with `artifact_registered` using a relative path plus explicit `storageRoot: "work_dir"`
- **Workflow separation**: `/pr-walkthrough` orients reviewers without posting comments or verdicts; `/pr-review` remains the verdict/finding workflow and `/pr-visual` remains the diagram generator

## UI Patterns

- **Contextual commands**: Views register `CommandDefinition[]` via `useContextualShortcuts` hook, surfaced in command palette alongside navigation/action commands
- **SessionStorage persistence**: `showFrontmatter`/`showMetadata` use `useState` + `sessionStorage` for per-tab, per-view toggle persistence; WebSocket cursors follow the same pattern with `rp1:last-event-id:global` and `rp1:last-event-id:{projectId}`
- **Notification lifecycle**: Toasts auto-dismiss 6s with dedup guard; sidebar groups by attention level; "Read all" bulk dismiss
- **Attention-level styling**: `itemClassForLevel` maps attention levels to differentiated background colors for visual triage
- **Runtime contract boundary**: `RuntimeProvider` loads the no-store `/api/v2/runtime` contract before WebSocket consumers mount, validates browser/native host mode, exposes reconnect policy, and performs one cache-busted reload before controlled runtime-load failure
- **LiveRunIndex projection**: Feed, runs, attention, project summaries, and run detail seed from REST, then scope-aware emitted workflow activity flows through a shared `LiveRunIndex` keyed by `runId` to patch only affected surfaces
- **Scope-aware Activity replay**: Global Activity stores `rp1:last-event-id:global`, project Activity stores `rp1:last-event-id:{projectId}`, and global live events advance both the global cursor and the event project's cursor when project identity is available
- **Server-side Activity search projection**: Search feed requests refresh compact `activity_search_runs` rows, match normalized tokens against Activity-visible fields before pagination, then apply runtime visibility and reuse `runRecordToListRun` so search and browse keep the same feed item contract
- **Snapshot reconciliation**: Project `state:snapshot` replaces the project's active-run subset; global snapshots upsert/hydrate without pruning unrelated project runs. Both paths trigger bounded refetch only for currently visible collections whose membership may have changed
- **Targeted hydration**: Unknown run events hydrate a single run summary before reducers apply queued updates, avoiding collection-wide invalidation for routine workflow activity
- **Policy-driven Activity recovery**: `useReconnectRecovery`, `useFeed`, and `useRuns` read reconnect timing and `activityRecoveryLimit` from the runtime contract, reconcile in the background after reconnect, and merge replay/REST overlap through stable run identity

## Observability

- **CLI logging**: consola-based logger with `--verbose`/`--trace` mapping to numeric levels
- **Daemon diagnostics**: Append-only NDJSON to `daemon.log` via `logDaemonEvent` with structured event/data fields; failures silently swallowed
- **Correlation**: `runId`, `projectId`, and source IDs in notification and event records

## Progressive-Disclosure Pipeline

- Skills with large instruction sets split content into subdirectories (`references/`, `pipeline/`) loaded on demand
- Entry-point SKILL.md contains a manifest table mapping companion files to load conditions
- Pipeline stages are standalone `.md` files with consistent structure (Purpose, Input, Process, Output)
- Agents execute stages sequentially, accumulating context across stages in conversation state
- Exemplar: `prompt-writer` with three reference layers (`references/`) and six pipeline stages (`pipeline/`)

## Extension Points

- Commands registered centrally via `program.addCommand` in `main.ts`
- Agent tools register via `registerTool()`
- Build pipeline uses LiquidJS templates with registered lint rules and filters
- State machines declared in `stateDiagram-v2` blocks with auto-skip and auto-complete
- Views register contextual commands via `useContextualShortcuts` hook for command palette integration
- Prompt pipeline stages loaded progressively via companion reference files in skill subdirectories (`prompt-writer` as first exemplar)

## Testing

- Tests under `cli/src/__tests__/` mirror feature areas with shared helpers
- Common patterns: temp directories, explicit env save/restore, Either/TaskEither unwrap helpers
- Unit-heavy with integration-style setup for CLI, filesystem, config, and build pipeline
- Golden-file tests validate rendered template output
- Evals share assertions under `evals/suites/shared/`
