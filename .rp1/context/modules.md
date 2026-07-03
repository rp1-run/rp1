# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-07-03
**Modules Analyzed**: 23

## Core Modules

| Module | Purpose | Files | Key Files |
|--------|---------|-------|-----------|
| `cli/commands` | User-facing CLI commands (build, arcade, migrate, init, settings, install, update, verify, uninstall) | 27 | build.ts, arcade.ts, settings.ts |
| `cli/agent-tools` | emit, workflow-bootstrap, resolve-args, state-machine, task, feedback | 59 | emit/index.ts, workflow-bootstrap.ts |
| `cli/build` | Multi-platform artifact pipeline with per-agent model tiering, effort resolution, and frontier tier | 59 | command.ts, models.ts, parser.ts, validator.ts, **tier-resolution.ts**, template-context.ts, platform-definitions.ts |
| `cli/settings` | **New** — install-time model tier remapping via `settings.toml` `[models]` sections and presets (budget/standard/premium) | 6 | apply.ts, rewriter.ts, presets.ts, loader.ts, models.ts, validator.ts |
| `cli/catalog` | Skill/agent catalog registry (distribution scope, arcadeTracked) | 3 | catalog-generator.ts |
| `cli/install` | Install artifacts into host tools (staging, backup/rollback, verify) for claude-code, codex, copilot, antigravity | 34 | verifier.ts, installer.ts, asset-extractor.ts |
| `cli/init` | Project init with context detection, fence markers, Ink UI | 23 | — |
| `cli/shared` | Errors, fp-ts helpers, events, logging, directory + settings path resolution | 15 | errors.ts, logger.ts, settings.ts |
| `web-ui/server` | Bun HTTP/WS server, REST APIs, file watching, notifications | 16 | registry.ts |
| `web-ui/daemon` | Daemon lifecycle + diagnostic logging | 4 | — |
| `web-ui/frontend` | React SPA: pages, hooks, providers, artifact viewers | 190 | — |
| `plugins/base` | KB, docs, writing, research, strategy, security, prompt pipeline | 98 | — |
| `plugins/dev` | Build workflows, blueprint, PR review/walkthrough, feature delivery | 58 | — |
| `plugins/utils` | Prompt tersification, eval helpers | 14 | — |
| `evals` | Prompt attestation, content-addressable hashing, dockerized exec | 26 | — |

## Key Components (build pipeline)

### tier-resolution (`cli/src/build/tier-resolution.ts`)
Centralized tier-to-model and effort-to-field resolution. Pure functions, called per-agent per-platform at build time AND by the settings module at install time.
- `resolveTier(tier, platform) → modelId | null` — maps abstract tier (frontier/deep/standard/fast) to platform model ID via exported `TIER_MODEL_MAP` (Claude Code, Codex, Antigravity; OpenCode/Copilot omitted = inherit); `null` for `inherit`/unmapped.
- `resolveEffort(effort, tier, platform) → {fieldName, value} | null` — `effort` (CC, 5 levels) or `model_reasoning_effort` (Codex, `max`→`xhigh` clamp); `null` for fast tier and no-effort platforms.
- Shared helpers for settings validation: `getValidModelIdsForPlatform`, `modelSupportsEffort`, `getPlatformsWithModelSupport` — single source of truth preventing build/remap divergence.

### build models (`cli/src/build/models.ts`)
`ModelTier` union (frontier/deep/standard/fast/inherit) + `VALID_MODEL_TIERS`; `TIER_RANK` ordered map (frontier=3, deep=2, standard=1, fast=0) for downgrade comparison; `EffortLevel` + `VALID_EFFORT_LEVELS`; `PROTECTED_AGENTS` set (14 reasoning-critical agents); **`BundleAgentEntry`** extending `BundleAssetEntry` with optional tier/effort carried through the build-to-install chain; `BuildConfig`, `ArtifactResult`, `BundleManifest`.

### build validator / command / template-context
`validator.ts`: L1+L2 validation plus `validateAgentTierAndEffort` (errors block, warnings advise on fast+effort and protected downgrade). `command.ts`: validation gate → `resolveTier`/`resolveEffort` → embeds tier/effort into `BundleAgentEntry`. `template-context.ts`: `BuildPlatform` union (opencode, claude-code, codex, copilot, antigravity), `AgentArtifactData` with optional `effortFieldName`/`effortValue`.

## Key Components (settings module — new)

### settings-apply (`cli/src/settings/apply.ts`)
Install-time remapping orchestrator: `resolveConfig` (preset + per-platform overrides, optional `globalSettingsPath` seam) → `validateTierRemappings` → `discoverAgents` (from `EMBEDDED_MANIFEST` via `getBundledAssets()`) → `applyRemappingsToAgents` (delegates to rewriter; counts modified vs `agentsAlreadyCurrent`) → report + CC plugin cache refresh (failures become warnings). `applyTierRemappingsIfConfigured` is the update-hook no-op wrapper. Filesystem ops injected via `ApplyDeps`.

### settings-rewriter (`cli/src/settings/rewriter.ts`)
Pure-function artifact rewriter: CC YAML frontmatter and Codex TOML targeted line replacement (multiline-string guard protects `developer_instructions` bodies); strips effort when the remapped model is fast-class; protected-agent downgrade warnings via reverse tier lookup + `TIER_RANK`. Only claude-code and codex are rewritable.

### settings-loader / presets / validator / models
`loader.ts`: parses `[arguments.*]` + `[models.*]` from TOML with project>user merge, module-level cache (`resetSettingsCache`), `TIER_KEYS` derived from `VALID_MODEL_TIERS`. `presets.ts`: budget/standard/premium complete tier-to-model profiles (CC + Codex; `RemappableTier` excludes frontier/inherit). `validator.ts`: TOML syntax + semantic checks (preset names, platforms, model IDs, effort preview) using tier-resolution helpers. `models.ts`: `PlatformTierMap`, `TierRemappingConfig`.

### settings-command (`cli/src/commands/settings.ts`)
`validate` (syntax + semantics, exit 1 on errors), `apply` (`--preset`, `--dry-run`; distinguishes "already up to date" from "nothing matched"), `presets` (list mappings).

## Module Dependencies (highlights)

- `cli/build/command` → `cli/build/tier-resolution` (per-agent resolution) → `cli/build/models`, `cli/build/template-context`.
- `cli/settings/apply` → `settings/{loader,rewriter,validator,presets}`, `cli/assets/reader` (embedded manifest), `cli/install/claudecode/marketplace`.
- `cli/settings/{rewriter,validator}` → `cli/build/tier-resolution` (canonical `TIER_MODEL_MAP` + helpers) and `cli/build/models` (`PROTECTED_AGENTS`, `TIER_RANK`).
- `cli/commands/update` → `cli/settings/apply` (auto re-apply after plugin update, try/catch isolated).
- `cli/scripts/generate-asset-imports.ts` → propagates `BundleAgentEntry.tier/effort` into `EMBEDDED_MANIFEST` (`if (import.meta.main)` guarded); `cli/assets/reader.ts` `AssetEntry` widened with optional tier/effort.
- `cli/agent-tools/emit` → `state-machine`, `web-ui/daemon` (lazy); `plugins/*` → `cli/agent-tools`; `plugins/dev` → `plugins/base` (runtime).
- External: fp-ts, liquidjs, commander, yaml, bun:sqlite, chalk.

## Module Metrics

| Module | Files | LOC (approx) | Components |
|--------|-------|--------------|------------|
| `cli/build` | 59 | ~9,562 | 6 |
| `cli/settings` | 6 | ~1,534 | 6 |
| `cli/install` | 34 | ~10,981 | 4 |
| `cli/catalog` | 3 | ~1,173 | 1 |

## Cross-Module Patterns

Skill-Agent Delegation · Tracked Workflow Bootstrap · State-Machine + Emit Discipline · Async-Mutex Registry · Notification Auto-Generation · Catalog Registry · Multi-Platform Build (5 targets) · **Abstract Tier Resolution** (one `TIER_MODEL_MAP` update propagates everywhere) · **Build-to-Install Tier Metadata Chain** (`BundleAgentEntry` → embedded manifest → apply) · **Settings Two-Level Merge** (project > user) · **Update Hook Auto-Reapply** (tier preferences survive plugin updates).

## Related KB

- System design: `architecture.md` · Conventions: `patterns.md` · Concepts: `concept_map.md`
