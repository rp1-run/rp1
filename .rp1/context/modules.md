# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-07-25
**Modules Analyzed**: 23

## Core Modules

| Module | Purpose | Files | Key Files |
|--------|---------|-------|-----------|
| `cli/commands` | User-facing CLI commands (build, arcade, migrate, init, settings, install, update, verify, uninstall) | 34 | build.ts, arcade.ts, settings.ts |
| `cli/agent-tools` | emit, workflow-bootstrap, resolve-args, state-machine, task, feedback, rp1-root-dir (storage-mode-aware directory resolution), work-search (FTS indexer for work artifacts), mmd-validate (Puppeteer-backed Mermaid validation), github-pr, socratic-duel, comment-extract, change-manifest, build-task-plan, workflow-state | 80 | emit/index.ts, workflow-bootstrap.ts, rp1-root-dir, work-search/indexer.ts |
| `cli/build` | Multi-platform artifact pipeline with per-agent model tiering, effort resolution, and frontier tier | 59 | command.ts, models.ts, parser.ts, validator.ts, **tier-resolution.ts**, template-context.ts, platform-definitions.ts |
| `cli/settings` | Install-time model tier remapping via `settings.toml` `[models]` sections and presets (budget/standard/premium); Arcade settings via `[arcade]` section (theme, downsampling) with two-level merge and daemon grace fallback; harness selection via `[harnesses]` section with comment-preserving TOML writer (`harness-writer.ts`) | 8 | apply.ts, rewriter.ts, arcade-writer.ts, harness-writer.ts, presets.ts, loader.ts, models.ts, validator.ts |
| `cli/migrate` | Project structure migration: project ID, work dirs, gitignore, DB backfill, stanza upgrades, Arcade settings JSON→TOML migration, and opt-in central-store conversion (`central-store.ts`: `relocateToCenter` moves `.rp1/context` + `.rp1/work` to `~/.rp1/projects/<project_id>/` with cross-device fallback; `writeStorageSection` writes `[storage] mode = "central"` with comment-preserving TOML edits; `updateGitignoreCentral` replaces fenced gitignore content with the central preset; `gitUnstageTracked` runs `git rm --cached` on relocated paths; `removeProjectStanzas` strips fenced content from `CLAUDE.md`/`AGENTS.md`; all gated behind `MigrateOptions.toCentral` with `homeDir` test-isolation seam; `arcade-settings.ts`: detect legacy JSON at global+project paths, write via arcade-writer, rename to `.migrated`; dry-run + `globalConfigDir` test seam; result in `MigrateResult.arcadeSettings` and `MigrateResult.centralStore`) | 7 | index.ts, central-store.ts, arcade-settings.ts, db-backfill.ts, stanza-upgrade.ts |
| `cli/catalog` | Skill/agent catalog registry (distribution scope, arcadeTracked) | 4 | catalog-generator.ts |
| `cli/install` | Install artifacts into host tools (staging, backup/rollback, verify) for claude-code, codex, copilot, antigravity | 35 | verifier.ts, installer.ts, asset-extractor.ts |
| `cli/init` | Project init with context detection, fence markers, Ink UI, storage-mode-aware directory model, health checks | 28 | directory-model.ts, steps/project-setup.ts, steps/harness-selection.ts |
| `cli/shared` | Errors, fp-ts helpers, events, logging, directory + settings path resolution, storage-mode resolution, project-id management | 15 | errors.ts, logger.ts, settings.ts, directory-resolution.ts, storage-mode.ts |
| `web-ui/server` | Bun HTTP/WS server, REST APIs, file watching, notifications, annotation service with markdown projection, activity search, project path resolution (storage-mode-aware section routing with legacy alias support) | 20 | registry.ts, annotation-service.ts, markdown-projection.ts, project-paths.ts |
| `web-ui/daemon` | Daemon lifecycle, diagnostic logging, platform-specific config directory resolution, state persistence | 7 | config-dir.ts |
| `web-ui/frontend` | React SPA: pages, hooks, providers, artifact viewers, editable text node filtering for annotations | 159 | — |
| `plugins/base` | KB, docs, writing, research, strategy, security, prompt pipeline; agents declare `KB_ROOT` in frontmatter arguments | 105 | — |
| `plugins/dev` | Build workflows, blueprint, PR review/walkthrough, feature delivery; agents declare `KB_ROOT`/`WORK_ROOT` arguments | 67 | — |
| `plugins/utils` | Prompt tersification, eval helpers | 9 | — |
| `evals` | Prompt attestation, content-addressable hashing, dockerized exec | 28 | — |

## Key Components (build pipeline)

### tier-resolution (`cli/src/build/tier-resolution.ts`)
Centralized tier-to-model and effort-to-field resolution. Pure functions, called per-agent per-platform at build time AND by the settings module at install time.
- `resolveTier(tier, platform) → modelId | null` — maps abstract tier (frontier/deep/standard/fast) to platform model ID via exported `TIER_MODEL_MAP` (Claude Code uses fable/opus/sonnet/haiku; Codex uses gpt-5.6-sol/terra/luna; Antigravity uses gemini-3.1-pro/3.5-flash); `null` for `inherit`/unmapped.
- `resolveEffort(effort, tier, platform) → {fieldName, value} | null` — `effort` (CC, 5 levels) or `model_reasoning_effort` (Codex, `max`→`xhigh` clamp); `null` for fast tier and no-effort platforms.
- Shared helpers for settings validation: `getValidModelIdsForPlatform`, `modelSupportsEffort`, `getPlatformsWithModelSupport` — single source of truth preventing build/remap divergence.

### build models (`cli/src/build/models.ts`)
`ModelTier` union (frontier/deep/standard/fast/inherit) + `VALID_MODEL_TIERS`; `TIER_RANK` ordered map (frontier=3, deep=2, standard=1, fast=0) for downgrade comparison; `EffortLevel` + `VALID_EFFORT_LEVELS`; `PROTECTED_AGENTS` set (14 reasoning-critical agents); **`BundleAgentEntry`** extending `BundleAssetEntry` with optional tier/effort carried through the build-to-install chain; `BuildConfig`, `ArtifactResult`, `BundleManifest`.

### build validator / command / template-context
`validator.ts`: L1+L2 validation plus `validateAgentTierAndEffort` (errors block, warnings advise on fast+effort and protected downgrade). `command.ts`: validation gate → `resolveTier`/`resolveEffort` → embeds tier/effort into `BundleAgentEntry`. `template-context.ts`: `BuildPlatform` union (opencode, claude-code, codex, copilot, antigravity), `AgentArtifactData` with optional `effortFieldName`/`effortValue`.

## Key Components (settings module)

### settings-apply (`cli/src/settings/apply.ts`)
Install-time remapping orchestrator: `resolveConfig` (preset + per-platform overrides, optional `globalSettingsPath` seam) → `validateTierRemappings` → `discoverAgents` (from `EMBEDDED_MANIFEST` via `getBundledAssets()`) → `applyRemappingsToAgents` (delegates to rewriter; counts modified vs `agentsAlreadyCurrent`) → report + CC plugin cache refresh (failures become warnings). `applyTierRemappingsIfConfigured` is the update-hook no-op wrapper. Filesystem ops and `getBundledAssets` injected via `ApplyDeps` (production binding imports `getBundledAssetsReal` explicitly to avoid a circular dependency).

### settings-rewriter (`cli/src/settings/rewriter.ts`)
Pure-function artifact rewriter: CC YAML frontmatter and Codex TOML targeted line replacement (multiline-string guard protects `developer_instructions` bodies); strips effort when the remapped model is fast-class; protected-agent downgrade warnings via reverse tier lookup + `TIER_RANK`. Only claude-code and codex are rewritable.

### settings-loader / presets / validator / models
`loader.ts`: parses `[arguments.*]`, `[models.*]`, `[harnesses]`, `[storage]`, and `[arcade]` from TOML with project>user merge, module-level cache (`resetSettingsCache`), `TIER_KEYS` derived from `VALID_MODEL_TIERS`; `loadArcadeSettings(projectRoot, globalSettingsPath?)` performs two-level merge for arcade settings with defaults (theme="system", thresholdHours=24); `loadEnabledHarnesses()` reads `[harnesses].enabled` from user-level TOML. `harness-writer.ts`: comment-preserving `writeHarnessSelection()` that appends/merges `[harnesses]` into existing TOML files using targeted line edits. `arcade-writer.ts`: comment-preserving `writeArcadeSection()` that appends/merges `[arcade]` into existing TOML files using targeted line edits (used by migration step and daemon grace fallback). `presets.ts`: budget/standard/premium complete tier-to-model profiles (CC + Codex; `RemappableTier` excludes frontier/inherit). `validator.ts`: TOML syntax + semantic checks (preset names, platforms, model IDs, effort preview) using tier-resolution helpers. `models.ts`: `PlatformTierMap`, `TierRemappingConfig`, `ArcadeSettings`, `ArcadeTheme`, `ParsedHarnessesSection`.

### settings-command (`cli/src/commands/settings.ts`)
`validate` (syntax + semantics, exit 1 on errors), `apply` (`--preset`, `--dry-run`; distinguishes "already up to date" from "nothing matched"), `presets` (list mappings).

## Key Components (shared directory resolution)

### directory-resolution (`cli/shared/directory-resolution.ts`)
Two-phase project root discovery: (1) git worktree detection via `readGitContext` — if in a worktree, resolves to the main repo's project root so worktrees with their own `.rp1/project_id` don't register as separate projects; (2) walk-up directory tree search for `.rp1/project_id` with home-directory safety guard. Delegates path computation to `storage-mode.ts`. Exports `resolveDirectorySet` returning `ResolvedDirectorySet` (projectRoot, projectId, kbRoot, workRoot, codeRoot, isWorktree, worktreeName, storageMode). Consumed by emit, resolve-args, rp1-root-dir, init, work-search, and web-ui.

### storage-mode (`cli/shared/storage-mode.ts`)
Storage mode resolution: `computeDirectoryPaths(projectRoot, projectId, mode)` returns kbRoot/workRoot based on mode — local mode uses `.rp1/context` and `.rp1/work` under projectRoot; central mode redirects to `~/.rp1/projects/<projectId>/context|work`. `readStorageMode` reads `[storage].mode` from project-level then user-level TOML. `isContainerEnvironment()` forces local mode in Docker/Codespaces (with `RP1_TEST_HOME_BOUNDARY` escape hatch for test isolation).

## Key Components (emit / event system)

### emit database (`cli/src/agent-tools/emit/database.ts`)
SQLite database layer (schema v19) with 10 tables: runs, events, artifacts, annotations, tasks, notifications, projects, project_registry_meta, activity_search_runs, socratic_duels + socratic_duel_participants. Provides CRUD operations, run status derivation, skipped-step detection, inactivity reaper, artifact location deduplication (`dedupeArtifactLocations` — merges duplicate file-artifact rows by keeping the doc_id with the most recent artifact_registered event), and 19 schema migrations. WAL journal mode with 5s busy timeout.

### doc-id (`cli/src/agent-tools/emit/doc-id.ts`)
Stable document identity utility: `generateDocId` (UUID), `parseFrontmatter`/`injectFrontmatter` for markdown doc_id management, `readFrontmatterDocId` (read-only identity probe — never writes before the registration transaction picks the winner), `overwriteDocIdFrontmatter` (stamps the winning identity after transaction settles).

### emit index (`cli/src/agent-tools/emit/index.ts`)
Unified event recording pipeline handling all 6 event types: flow-mismatch check → run auto-create → step validation against state machine → skipped-step detection with predecessor auto-completion → artifact registration (file or URL with `locationKind` discriminator, link doc_id derivation via SHA-256) → annotation upsert → event insert → run status derivation → daemon notification (bounded by `NOTIFY_DEADLINE_MS` = 500ms) → structured result. Also provides `executeBatchEmit` for strict-order multi-event batches and `executeEndRun` for manual run termination.

## Module Dependencies (highlights)

- `cli/build/command` → `cli/build/tier-resolution` (per-agent resolution) → `cli/build/models`, `cli/build/template-context`.
- `cli/settings/apply` → `settings/{loader,rewriter,arcade-writer,harness-writer,validator,presets}`, `cli/assets/reader` (embedded manifest), `cli/install/claudecode/marketplace`.
- `cli/settings/{rewriter,validator}` → `cli/build/tier-resolution` (canonical `TIER_MODEL_MAP` + helpers) and `cli/build/models` (`PROTECTED_AGENTS`, `TIER_RANK`).
- `cli/commands/update` → `cli/settings/apply` (auto re-apply after plugin update, try/catch isolated).
- `cli/web-ui/server` → `cli/src/settings/{loader,arcade-writer}` (cross-package import via `arcade-settings-bridge.ts` — narrow interface: `loadArcadeSettings`, `writeArcadeSection`, `resetSettingsCache`).
- `cli/web-ui/server/project-paths` → `cli/shared/{storage-mode,project-id}` (storage-mode-aware artifact path resolution with section routing and legacy alias matching).
- `cli/web-ui/server/annotation-service` → `cli/web-ui/server/{markdown-projection,project-paths}` → `cli/src/agent-tools/emit/database` (annotation and artifact persistence).
- `cli/scripts/generate-asset-imports.ts` → propagates `BundleAgentEntry.tier/effort` into `EMBEDDED_MANIFEST` (`if (import.meta.main)` guarded); `cli/assets/reader.ts` `AssetEntry` widened with optional tier/effort.
- `cli/agent-tools/emit` → `state-machine`, `web-ui/daemon` (lazy); `plugins/*` → `cli/agent-tools`; `plugins/dev` → `plugins/base` (runtime).
- `cli/shared/directory-resolution` → `cli/shared/{storage-mode,project-id}` — consumed by emit, resolve-args, rp1-root-dir, init/directory-model, work-search/indexer, and web-ui/server/project-paths.
- `plugins/*/skills` → `cli/agent-tools/rp1-root-dir` (runtime, via workflow-bootstrap/resolve-args): skills receive `{kbRoot}`/`{workRoot}` and pass them to agents as `KB_ROOT`/`WORK_ROOT` dispatch arguments — 30 agents declare `KB_ROOT`, 21 declare `WORK_ROOT`.
- External: fp-ts, liquidjs, commander, yaml, bun:sqlite, chalk.

## Module Metrics

| Module | Files | LOC (approx) | Components |
|--------|-------|--------------|------------|
| `cli/build` | 59 | ~9,562 | 6 |
| `cli/settings` | 8 | ~2,160 | 9 |
| `cli/migrate` | 7 | ~2,917 | 6 |
| `cli/install` | 35 | ~11,193 | 4 |
| `cli/catalog` | 4 | ~1,173 | 1 |

## Cross-Module Patterns

Skill-Agent Delegation · Tracked Workflow Bootstrap · **Variable-Based Path Interpolation** (skills resolve `{kbRoot}`/`{workRoot}` via bootstrap, agents receive `KB_ROOT`/`WORK_ROOT` arguments; no literal `.rp1/` paths in prompts — prerequisite for `[storage]` mode redirection) · **Two-Phase Directory Resolution** (`directory-resolution.ts` handles worktree detection + walk-up discovery; delegates to `storage-mode.ts` for local/central path computation — single entry point consumed by 6 modules) · State-Machine + Emit Discipline · **Transactional Doc-Id Resolution** (read-only frontmatter probe before transaction; winner stamped after settlement; prevents concurrent registration races) · Async-Mutex Registry · Notification Auto-Generation · Catalog Registry (body-content checksums) · Multi-Platform Build (5 targets) · **Abstract Tier Resolution** (one `TIER_MODEL_MAP` update propagates everywhere) · **Build-to-Install Tier Metadata Chain** (`BundleAgentEntry` → embedded manifest → apply) · **Settings Two-Level Merge** (project > user for `[arguments]`, `[models]`, `[harnesses]`, `[storage]`, `[arcade]`) · **Comment-Preserving TOML Writers** (arcade-writer + harness-writer use targeted line edits, not full serialization) · **Update Hook Auto-Reapply** (tier preferences survive plugin updates) · **Daemon Grace Fallback** (legacy JSON auto-migrated to TOML on daemon start) · **Migrate-Integrated Settings Migration** (`rp1 migrate` runs the same JSON→TOML arcade migration explicitly, with `.migrated` audit trail) · **Markdown Projection Pipeline** (mdast-to-plaintext with per-character offset map for precise annotation source anchoring) · **Artifact Location Deduplication** (DB migration v19 merges duplicate file-artifact rows by event-recency, re-points annotations).

## Related KB

- System design: `architecture.md` · Conventions: `patterns.md` · Concepts: `concept_map.md`
