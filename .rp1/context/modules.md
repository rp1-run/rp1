# Module & Component Breakdown

**Project**: rp1
**Analysis Date**: 2026-06-30
**Modules Analyzed**: 22

## Core Modules

| Module | Purpose | Files | Key Files |
|--------|---------|-------|-----------|
| `cli/commands` | User-facing CLI commands (build, arcade, migrate, init) | 27 | build.ts, arcade.ts |
| `cli/agent-tools` | emit, workflow-bootstrap, resolve-args, state-machine, task, feedback | 59 | emit/index.ts, workflow-bootstrap.ts |
| `cli/build` | Multi-platform artifact pipeline with per-agent model tiering + effort resolution | 51 | command.ts, models.ts, parser.ts, validator.ts, **tier-resolution.ts**, template-context.ts, template-engine.ts |
| `cli/catalog` | Skill/agent catalog registry (distribution scope, arcadeTracked) | 3 | catalog-generator.ts |
| `cli/install` | Install artifacts into host tools (staging, backup/rollback, verify) | 22 | verifier.ts |
| `cli/init` | Project init with context detection, fence markers, Ink UI | 23 | — |
| `cli/shared` | Errors, fp-ts helpers, events, logging, directory resolution | 15 | errors.ts, logger.ts |
| `web-ui/server` | Bun HTTP/WS server, REST APIs, file watching, notifications | 16 | registry.ts |
| `web-ui/daemon` | Daemon lifecycle + diagnostic logging | 4 | — |
| `web-ui/frontend` | React SPA: pages, hooks, providers, artifact viewers | 190 | — |
| `plugins/base` | KB, docs, writing, research, strategy, security, prompt pipeline | 98 | — |
| `plugins/dev` | Build workflows, blueprint, PR review/walkthrough, feature delivery | 58 | — |
| `plugins/utils` | Prompt tersification, eval helpers | 14 | — |
| `evals` | Prompt attestation, content-addressable hashing, dockerized exec | 26 | — |

## Key Components (build pipeline)

### tier-resolution (`cli/src/build/tier-resolution.ts`) — new
Centralized tier-to-model and effort-to-field resolution dictionary. Pure functions, no side effects, called per-agent per-platform during the build loop.
- `resolveTier(tier, platform) → modelId | null` — maps abstract tier to platform-specific model ID via `TIER_MODEL_MAP` (3 tiers × 5 platforms); returns `null` for `inherit`, unmapped platforms (copilot), so the template omits the field.
- `resolveEffort(effort, tier, platform, resolvedModel) → {fieldName, value} | null` — platform/provider-specific effort field; derives provider (anthropic/openai) from the resolved model ID for OpenCode; clamps 5-level effort to 3-level for OpenAI/Codex; returns `null` for fast tier and unsupported platforms.
- Depends on `models` (ModelTier/EffortLevel) and `template-context` (BuildPlatform).

### build models (`cli/src/build/models.ts`)
Defines `ModelTier`/`EffortLevel` unions + parallel `VALID_MODEL_TIERS`/`VALID_EFFORT_LEVELS` arrays, the `PROTECTED_AGENTS` set (14 frontier-critical agents), and `ClaudeCodeAgent.effort?`. Also `BuildConfig`, `ArtifactResult`, `BundleManifest`, and platform artifact interfaces.

### build validator (`cli/src/build/validator.ts`)
L1 (syntax) + L2 (schema) validation plus `validateAgentTierAndEffort(agent, model, effort, file) → {errors, warnings}` for **all** platforms: errors on unknown tier/effort (blocking); warnings on fast+effort and protected-agent downgrade (advisory).

### build command (`cli/src/build/command.ts`)
Orchestrates multi-platform builds. Integrates the validation gate then `resolveTier`/`resolveEffort` into the agent build loop before constructing template context. Uses `fp-ts` `pipe(... TE.chain ...)`.

### template-context (`cli/src/build/template-context.ts`) / codex/models.ts
`AgentArtifactData` and `CodexAgent` gain optional `effortFieldName`/`effortValue`, consumed by Liquid templates at render time.

### agent Liquid templates (`cli/src/build/templates/`)
Per-platform conditional emission: Claude Code (YAML `model` + `effort`), Codex (TOML `model` + `model_reasoning_effort`), OpenCode (YAML `model` + provider-keyed effort pass-through). Inherit/undefined/unsupported → field omitted (byte-identical opt-out).

## Module Dependencies (highlights)

- `cli/build/command` → `cli/build/tier-resolution` (resolveTier/resolveEffort per agent/platform).
- `cli/build/tier-resolution` → `cli/build/models`, `cli/build/template-context`.
- `cli/build/validator` → `cli/build/models` (VALID_* arrays, PROTECTED_AGENTS).
- `cli/build/templates` → `cli/build/template-context` (consume effortFieldName/effortValue at render).
- `cli/agent-tools/emit` → `state-machine`, `web-ui/daemon` (lazy).
- `plugins/*` → `cli/agent-tools` (emit, resolve-args, bootstrap conventions); `plugins/dev` → `plugins/base` (runtime).
- External: fp-ts, liquidjs, commander, yaml, bun:sqlite.

## Module Metrics

| Module | Files | LOC (approx) | Components |
|--------|-------|--------------|------------|
| `cli/build` | 51 | ~15,159 | 12 |

## Cross-Module Patterns

Skill-Agent Delegation · Tracked Workflow Bootstrap · State-Machine + Emit Discipline · Async-Mutex Registry · Notification Auto-Generation · Catalog Registry · Multi-Platform Build · **Abstract Tier Resolution** (one `TIER_MODEL_MAP` update propagates to all agents at that tier on next build).

## Related KB

- System design: `architecture.md` · Conventions: `patterns.md` · Concepts: `concept_map.md`
