# Core Capabilities Required for RP1 Platform Support

**Generated**: 2026-03-14
**Last Updated**: 2026-05-11
**Current Baseline**: `/Users/prem/Development/rp1` at `v0.7.7` / `da8446bc`
**Scope**: strategic-analysis
**Purpose**: Reference document for evaluating whether a new AI agentic tool can serve as an RP1 harness
**Derived From**: Original Dec 2025 - Mar 2026 internal research plus current repo evidence through May 2026

## Executive Summary

RP1 is a plugin-driven workflow system that delivers markdown-authored skills and agents to AI coding tools through a platform-aware build pipeline. The original report was written when Claude Code and OpenCode were supported, Codex had been judged too costly, and GitHub Copilot CLI support did not yet exist.

That posture is now stale. The current repository has first-class build/install/verify/documentation paths for **Claude Code**, **OpenCode**, **Codex CLI**, and **GitHub Copilot CLI**. Codex is no longer merely an abandoned experiment: current code emits Codex skills, per-agent TOML, `openai.yaml`, managed `config.toml` sections, and Codex session hooks. Copilot is now a fourth generated target with native plugin-marketplace install support.

The original capability framework still holds, but the decision rule needs one refinement: a harness can be viable when RP1 can compensate for missing native behavior through generated prompts, installer configuration, and runtime tools. Those compensations are not free. They become permanent build, install, verification, and support obligations.

The most important new blocking requirement is **workflow bootstrap compatibility**. Since the original report, tracked workflows now rely on generated `rp1 agent-tools workflow-bootstrap` stanzas for argument resolution, run identity, directory resolution, `codeRoot`, and harness attribution. A new harness that cannot reliably execute that bootstrap, parse the result, and preserve the returned variables cannot support current RP1 workflows with Arcade parity.

## Current Support Snapshot

| Harness                    | Current repo support                                         | Invocation shape             | Integration path                                             | Current posture                                   |
| -------------------------- | ------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Claude Code                | Build, install, verify, hooks, docs                          | `/knowledge-build`, `/build` | Native Claude plugin artifacts                               | Primary / high confidence                         |
| OpenCode                   | Build, install, verify, docs                                 | `/rp1-base-knowledge-build`  | OpenCode config and generated skills/agents                  | Supported / high confidence                       |
| Codex CLI                  | Build, install, verify, hooks, docs                          | `$rp1-base-knowledge-build`  | `.codex/skills`, `.codex/agents/rp1`, managed `config.toml`  | Supported with compensations                      |
| GitHub Copilot CLI         | Build, install, verify, docs                                 | `/rp1-base-knowledge-build`  | Native Copilot plugin marketplace via `gh copilot -- plugin` | Supported, but tracked-workflow parity is partial |
| Goose and other candidates | No `supported-tools` entry, no `BuildPlatform`, no templates | N/A                          | N/A                                                          | Unevaluated                                       |

Copilot deserves a specific caveat: `cli/src/build/templates/copilot/skill.liquid` currently injects `resolve-args` guidance for parameterized skills, but it does not inject the tracked `workflow-bootstrap` section that Claude Code, OpenCode, and Codex templates inject. Treat Copilot as supported for generated skills/agents/install, but not yet proven equivalent for current tracked workflow state semantics until that gap is closed or intentionally accepted.

## Change Evidence Since 2026-03-14

| Evidence | What changed | Matrix impact |
|----------|--------------|---------------|
| `c4c7f3f4 feat!: support codex (#295)` | Codex artifacts, config management, validators, install/verify paths, parameter transforms, and docs were added or hardened. | Codex status changes from "dropped" to "supported with compensations." |
| `5c97bf41 feat: add GitHub Copilot CLI support (#311)` | Copilot registry, templates, tags, install/verify commands, marketplace lifecycle, docs, and tests were added. | Add Copilot as a fourth evaluated harness. |
| `490cb761 feat(cli): implement deterministic workflow bootstrap (#318)` | Tracked workflows now bootstrap run identity, arguments, directories, and run policy through a single agent tool. | Add workflow bootstrap as a Tier 1 capability. |
| `d208e63d feat: add codeRoot to bootstrap for worktree-aware code edits (#343)` | Source edits now use `codeRoot` while artifacts stay in canonical `workRoot`/`kbRoot`. | Worktree awareness is now a runtime contract, not only a convenience. |
| `cli/src/config/supported-tools.yaml` | Authoritative tool registry lists Claude Code, OpenCode, Codex, and Copilot with minimum versions and instruction files. | Current support snapshot must include four supported tools. |
| `cli/src/build/template-context.ts` | `BuildPlatform` now includes `opencode`, `codex`, `claude-code`, and `copilot`. | New harnesses require an explicit build target. |
| `cli/src/build/platform-definitions.ts` | Platform definitions centralize templates, registries, naming, hooks, and bundle behavior. | Build-pipeline compatibility is now data-driven but still requires per-harness definitions. |
| `cli/src/build/tags/dispatch-agent.ts` | `dispatch_agent` renders Claude `Task`, OpenCode `task`, Codex `Spawn agent`, and Copilot `create_agent`. | Sub-agent capability is now compiled per harness through semantic tags. |
| `cli/src/build/filters/param-transform.ts` | Codex and Copilot replace `$ARGUMENTS` / `$1` with model-extraction prose. | Native parameter passing remains degraded but no longer blocks generated support by itself. |
| `plugins/base/hooks/codex-hooks.json` and Codex config patching | Codex hook support is enabled with `codex_hooks = true` and a generated hook file. | Codex hook status changes from "No" to "Yes, through managed config." |
| `docs/getting-started/installation.md` and `docs/reference/platforms/copilot.md` | Public docs describe Codex and Copilot setup, invocation, install, and verification. | Support claims are user-facing, not only internal build code. |

## Tier 1: Must Have (Blocking)

These capabilities are non-negotiable. If a harness lacks any of these and RP1 cannot supply a reliable generated/configuration workaround, RP1 should not claim support.

### 1. Sub-Agent Spawning (Single Level)

**What**: The ability for a running skill/prompt to spawn at least one bounded worker and receive or retrieve its result.

**Why**: Current RP1 still depends heavily on skill-to-agent delegation. In the current tree, 31 of 44 skills contain dispatch patterns, 16 skills are tracked workflows, and there are 52 agent files. Build, PR review, knowledge build, deep research, docs generation, prompt build, and strategy workflows all depend on delegation.

**Minimum Requirements**:

* Spawn at least one sub-agent from a skill/prompt context.

* Pass a prompt/instructions payload to the sub-agent.

* Retrieve a result through the harness response or a durable file-backed contract.

* Support parallel/background spawning for map-reduce workflows.

* Depth of 1 is sufficient. RP1 sub-agents should not spawn other sub-agents.

**How Current Platforms Deliver This**:

| Platform           | Mechanism                                                                                                                | Status                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Claude Code        | `Task` tool with `subagent_type`                                                                                         | Working                                                            |
| OpenCode           | `task` tool with `subagent_type` / `@rp1-*` names                                                                        | Working                                                            |
| Codex              | Generated `Spawn agent` / wait instructions with managed TOML agents and `multi_agent = true`                            | Supported with Codex-specific flow                                 |
| GitHub Copilot CLI | Generated `create_agent` instructions and `.agent.md` definitions; result handoff points to `.rp1/work/agent-output/...` | Supported in generated prompts, runtime parity should be validated |

**Evidence**: `cli/src/build/tags/dispatch-agent.ts`, `cli/src/build/codex/*`, `cli/src/build/copilot/registry.ts`, `cli/src/__tests__/build/tags/dispatch-agent.test.ts`

***

### 2. Custom Prompt / Skill Loading

**What**: The ability to load and execute markdown-based RP1 skills with frontmatter metadata.

**Why**: Skills are RP1's user-facing interface. Without skill loading, RP1 can only ship ad hoc prompt text, not a discoverable workflow suite.

**Minimum Requirements**:

* Load `SKILL.md` or equivalent markdown prompt files.

* Preserve at least `name` and `description`.

* Support a discovery or install mechanism.

* Gracefully ignore or preserve unknown metadata fields used by RP1.

* Prefer structured argument metadata, even if runtime argument passing is degraded.

**How Current Platforms Deliver This**:

| Platform           | Mechanism                                                            | Status  |
| ------------------ | -------------------------------------------------------------------- | ------- |
| Claude Code        | Native plugin skills and `.claude` plugin packaging                  | Working |
| OpenCode           | Generated OpenCode skills under config-managed install paths         | Working |
| Codex              | `.codex/skills/{rp1-*}/SKILL.md` plus `$rp1-*` invocation            | Working |
| GitHub Copilot CLI | Native plugin `skills/` directory through Copilot plugin marketplace | Working |

**Evidence**: `cli/src/build/templates/*/skill.liquid`, `cli/src/install/*`, `docs/getting-started/installation.md`

***

### 3. Shell Command Execution

**What**: The ability to run shell commands from skill and agent contexts.

**Why**: RP1's runtime is exposed through CLI calls such as `rp1 agent-tools emit`, `workflow-bootstrap`, `resolve-args`, `feedback`, `mmd-validate`, and `rp1-root-dir`. Without shell execution, workflows cannot update state, register artifacts, validate diagrams, or resolve project directories.

**Minimum Requirements**:

* Execute shell commands and capture stdout/stderr.

* Support commands that take 10+ seconds.

* Allow `rp1` storage writes outside the source tree, especially `~/.rp1` and platform config directories.

* Provide a way to reduce approval fatigue for repeated `rp1`, `git`, `gh`, and filesystem commands.

**How Current Platforms Deliver This**:

| Platform           | Mechanism                                                             | Status                             |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------- |
| Claude Code        | `Bash` with `allowed-tools`                                           | Working                            |
| OpenCode           | Bash/tool permission map                                              | Working                            |
| Codex              | `functions.exec_command` plus managed writable roots in `config.toml` | Working with sandbox configuration |
| GitHub Copilot CLI | `run_terminal_command` / skill `shell(...)` permissions               | Working in generated artifacts     |

**Evidence**: `cli/src/build/filters/allowed-tools.ts`, `cli/src/install/codex/config.ts`, `cli/src/build/templates/copilot/skill.liquid`

***

### 4. File System Read and Write

**What**: The ability to read, write, edit, and search local files.

**Why**: RP1 workflows read KB files, write `.rp1/work` artifacts, inspect source code, and edit user projects. Current workflows also separate source-code edits (`codeRoot`) from canonical KB/work artifacts (`kbRoot`, `workRoot`).

**Minimum Requirements**:

* Read file contents by path.

* Write/create files at specified paths.

* Edit existing files with a precise method.

* Search file names and contents.

* Respect `codeRoot`, `kbRoot`, and `workRoot` rather than assuming all files live under one root.

**How Current Platforms Deliver This**:

| Platform           | Read                             | Write                      | Edit                    | Search                       |
| ------------------ | -------------------------------- | -------------------------- | ----------------------- | ---------------------------- |
| Claude Code        | `Read`                           | `Write`                    | `Edit`                  | `Glob`, `Grep`               |
| OpenCode           | `read_file`                      | `write_file`               | `edit_file`             | `glob_pattern`, `grep_file`  |
| Codex              | Shell reads (`sed`, `cat`, `rg`) | `functions.apply_patch`    | `functions.apply_patch` | Shell search (`rg`)          |
| GitHub Copilot CLI | `read_file`                      | `write_file`               | `edit_file`             | `grep_search`, `file_search` |

**Evidence**: `cli/src/build/*/registry.ts`, `cli/src/build/filters/tool-prose.ts`, `docs/reference/platforms/copilot.md`

***

### 5. Project-Level Instruction File

**What**: A persistent instruction file loaded at session start.

**Why**: `rp1 init` injects KB loading rules, skill awareness, host guidance, and managed fence markers into host instruction files. Without an instruction file, a harness does not reliably know to load `.rp1/context/index.md` first or how to follow RP1 conventions.

**Minimum Requirements**:

* A project-level file automatically loaded by the harness.

* Versioned/fenced managed sections so RP1 can migrate stale content without overwriting user text.

* Enough capacity for KB instructions and host-specific guidance.

* Compatibility with `CURRENT_HOST` self-identification guidance.

**How Current Platforms Deliver This**:

| Platform           | File        | Status  |
| ------------------ | ----------- | ------- |
| Claude Code        | `CLAUDE.md` | Working |
| OpenCode           | `AGENTS.md` | Working |
| Codex              | `AGENTS.md` | Working |
| GitHub Copilot CLI | `AGENTS.md` | Working |

**Evidence**: `cli/src/init/templates/*`, `cli/src/config/supported-tools.yaml`, `docs/getting-started/installation.md`

***

### 6. Workflow Bootstrap and Harness Identity

**What**: The ability to execute a generated bootstrap command at the start of tracked workflows, parse its JSON, and carry the returned values through the workflow.

**Why**: Since `490cb761`, tracked workflows should not hand-generate `RUN_ID`s or manually call `resolve-args`/`rp1-root-dir`. The generated `workflow-bootstrap` section returns the canonical argument values, run identity, directories, `codeRoot`, run policy, and harness identity. Arcade tracking, resumability, worktree correctness, and artifact routing depend on those values.

**Minimum Requirements**:

* Run `rp1 agent-tools workflow-bootstrap`.

* Pass the workflow name, schema path, raw user arguments, project root, and `CURRENT_HOST`.

* Parse the JSON response.

* Preserve `RUN_ID`, `projectRoot`, `kbRoot`, `workRoot`, `codeRoot`, workflow metadata, and run decision values for later steps.

* Pass `--harness $CURRENT_HOST` on subsequent `rp1 agent-tools emit` calls.

**How Current Platforms Deliver This**:

| Platform           | Status                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| Claude Code        | Template injects workflow bootstrap for tracked workflows                               |
| OpenCode           | Template injects workflow bootstrap for tracked workflows                               |
| Codex              | Template injects workflow bootstrap for tracked workflows, with argument prose fallback |
| GitHub Copilot CLI | Partial: current template injects `resolve-args`, not full `workflow-bootstrap`         |

**Evidence**: `cli/src/build/templates/claude-code/skill.liquid`, `cli/src/build/templates/opencode/skill.liquid`, `cli/src/build/templates/codex/skill.liquid`, `cli/src/build/templates/copilot/skill.liquid`, `cli/src/build/lint/rules/tracked-workflow-bootstrap.ts`, `cli/src/agent-tools/workflow-bootstrap/*`

***

## Tier 2: Should Have (Significant Degradation Without)

These capabilities are important for a complete experience. Missing one can be handled through generated prompt workarounds; missing several usually makes support fragile.

### 7. Agent Definition Files

**What**: Reusable agent personas with specific instructions, tool access, and optional model/configuration.

**Why**: RP1 currently has 52 agent files. Inlining those instructions into every skill would make workflow prompts too large and hard to maintain.

| Platform           | Format                                             | Status  |
| ------------------ | -------------------------------------------------- | ------- |
| Claude Code        | Bare `.md` agents in plugin `agents/`              | Working |
| OpenCode           | `.md` with subagent frontmatter                    | Working |
| Codex              | Per-agent `.toml` plus aggregate `rp1-agents.toml` | Working |
| GitHub Copilot CLI | `.agent.md` files in plugin `agents/`              | Working |

**Evidence**: `plugins/*/agents/*.md`, `cli/src/build/templates/*/agent*`, `cli/src/build/platform-definitions.ts`

***

### 8. Parameter Passing to Skills

**What**: The ability to pass invocation arguments into skill content.

**Why**: RP1 skills accept feature IDs, PR numbers, file paths, topics, and mode flags. Weak argument handling causes workflows to start with the wrong target.

**Current Rule**: Native substitution is best. Model-extracted arguments are acceptable only when paired with `resolve-args`/`workflow-bootstrap` and clear generated instructions.

| Platform           | Mechanism                                                                                         | Status                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Claude Code        | `$ARGUMENTS`, `$1`, `$2`                                                                          | Working                                      |
| OpenCode           | Argument forwarding to generated skill                                                            | Partial/working enough for current templates |
| Codex              | No native `$ARGUMENTS`; generated prose says "the arguments provided by the user in their prompt" | Supported fallback, lower reliability        |
| GitHub Copilot CLI | Same generated prose fallback as Codex                                                            | Supported fallback, lower reliability        |

**Evidence**: `cli/src/build/filters/param-transform.ts`, `cli/src/build/arguments.ts`, `cli/src/agent-tools/resolve-args/*`

***

### 9. Explicit Skill Invocation Syntax

**What**: A way for users to invoke one exact RP1 skill by name.

**Why**: RP1 workflows are too stateful and intent-specific to rely only on ambient matching.

| Platform           | Syntax        | Example                     |
| ------------------ | ------------- | --------------------------- |
| Claude Code        | `/skill-name` | `/build my-feature`         |
| OpenCode           | `/rp1-*`      | `/rp1-dev-build my-feature` |
| Codex              | `$rp1-*`      | `$rp1-dev-build my-feature` |
| GitHub Copilot CLI | `/rp1-*`      | `/rp1-dev-build my-feature` |

**Evidence**: `docs/getting-started/installation.md`, `cli/src/build/filters/slash-commands.ts`

***

### 10. Structured Output from Sub-Agents

**What**: Sub-agents return data that the orchestrator can consume reliably.

**Why**: PR review, knowledge build, prompt build, and verification workflows expect JSON or schema-like sections from worker agents.

**Minimum Requirements**:

* Sub-agent can produce JSON or a tightly constrained markdown section.

* Parent can retrieve the output without context truncation.

* For background work, durable file-backed handoff is acceptable.

**Current Platform Notes**:

* Claude Code and OpenCode generally return sub-agent output through native task results.

* Codex uses generated wait/check instructions around spawned agents.

* Copilot generated prompts currently direct the parent to read `.rp1/work/agent-output/{run-id}/...json`; that convention needs runtime validation and producer discipline.

**Evidence**: `cli/src/build/tags/dispatch-agent.ts`, `plugins/*/agents/*.md`, `plugins/base/skills/artifact-templates/*`

***

### 11. Concurrent Sub-Agent Execution

**What**: Multiple sub-agents can run concurrently or in the background.

**Why**: RP1 map-reduce workflows spawn 4-14 workers in a single phase. Sequential fallback can make workflows several times slower.

| Platform           | Mechanism                                                  | Status                                                   |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| Claude Code        | Multiple `Task` calls in one turn                          | Working                                                  |
| OpenCode           | Multiple `task` calls                                      | Working                                                  |
| Codex              | `Spawn agent (background)` plus later result check         | Supported with different flow                            |
| GitHub Copilot CLI | `create_agent (background)` plus file-backed result lookup | Supported in generated prompts, needs runtime validation |

**Evidence**: `plugins/base/skills/knowledge-build/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`, `cli/src/build/tags/dispatch-agent.ts`

***

### 12. Interactive User Input Gates

**What**: The harness can pause a workflow, ask the user a bounded question, and resume with the answer.

**Why**: Current workflows use human gates for stale KB decisions, dirty worktree handling, requirements approval, implementation readiness, and review posting.

**Minimum Requirements**:

* Ask a question with optional choices.

* Stop the workflow at the gate.

* Preserve enough state to resume after the user's answer.

| Platform           | Mechanism                                                                         | Status                    |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------- |
| Claude Code        | `AskUserQuestion`                                                                 | Working                   |
| OpenCode           | `ask_user`                                                                        | Working                   |
| Codex              | `request_user_input` when available plus generated plain-text checkpoint fallback | Partial                   |
| GitHub Copilot CLI | `ask_user`                                                                        | Working in generated tags |

**Evidence**: `cli/src/build/tags/ask-user.ts`, `plugins/dev/skills/build/SKILL.md`, `plugins/dev/skills/pr-review/SKILL.md`

***

## Tier 3: Nice to Have (Enhances UX)

These capabilities improve support quality but are not required for core RP1 functionality when the Tier 1 and Tier 2 contracts are satisfied.

### 13. Dynamic Context / Shell Expansion in Prompts

**What**: Prompt-load shell expansion such as injecting command output before model execution.

**Current Assessment**: This is less important than in the original report. Current generated templates should call `workflow-bootstrap` or `resolve-args` at runtime instead of relying on prompt-load shell expansion.

**Impact of Absence**: Low, as long as shell execution and bootstrap work.

***

### 14. Tool Permission Pre-Authorization

**What**: A way to pre-authorize common tool patterns.

**Why**: RP1 workflows make many shell and file operations. Without pre-authorization, approval prompts make workflows tedious.

| Platform           | Current coverage                                                 |
| ------------------ | ---------------------------------------------------------------- |
| Claude Code        | Per-skill `allowed-tools`                                        |
| OpenCode           | Generated tool permission map                                    |
| Codex              | Managed `config.toml`, writable roots, and allowed tool prose    |
| GitHub Copilot CLI | Skill `allowed-tools` permission patterns such as `shell(rp1:*)` |

**Evidence**: `cli/src/build/filters/allowed-tools.ts`, `cli/src/build/templates/copilot/skill.liquid`, `cli/src/install/codex/config.ts`

***

### 15. Lifecycle Hooks

**What**: Hooks that run on session start or other host events.

**Why**: RP1 uses hooks to start Arcade and check for updates. Workflows still function if the user starts Arcade manually.

| Platform           | Current coverage                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Claude Code        | Session hooks shipped under plugin hooks                                                                      |
| OpenCode           | Host hook support exists; RP1 coverage depends on generated install path                                      |
| Codex              | `codex_hooks = true` and `plugins/base/hooks/codex-hooks.json`                                                |
| GitHub Copilot CLI | Template supports plugin hook path if `copilot-hooks.json` exists; no shipped hook file found in current tree |

**Impact of Absence**: Medium UX degradation, not a core workflow blocker.

***

### 16. Web Search and Fetch

**What**: Tools for searching the web and fetching URL content.

**Why**: Research workflows benefit from external evidence, but most RP1 workflows can operate on local repo and KB evidence.

| Platform           | Current coverage                                                          |
| ------------------ | ------------------------------------------------------------------------- |
| Claude Code        | Web search and fetch                                                      |
| OpenCode           | Web search and fetch                                                      |
| Codex              | Partial: generated `web_access` degrades toward search; fetch unavailable |
| GitHub Copilot CLI | Partial: `fetch_url`; web search unavailable                              |

**Evidence**: `cli/src/build/tags/web-access.ts`, `cli/src/build/filters/tool-prose.ts`

***

### 17. Planning / Task Tracking Tools

**What**: Built-in plan/todo tools.

**Why**: Helps users see work breakdown in the host UI. RP1's durable workflow state still lives in emitted events and artifacts.

| Platform           | Current coverage                                                       |
| ------------------ | ---------------------------------------------------------------------- |
| Claude Code        | `TodoWrite`, plan-mode tools                                           |
| OpenCode           | `manage_todos`                                                         |
| Codex              | `update_plan`                                                          |
| GitHub Copilot CLI | No dedicated tool; generated fallback says to write status to markdown |

**Evidence**: `cli/src/build/tags/plan-tool.ts`

***

### 18. LSP Integration

**What**: Language Server Protocol tools for go-to-definition, references, and diagnostics.

**Why**: Improves code navigation quality in large repositories.

**Current Assessment**: Helpful, not required. File search, semantic search, and shell tooling are acceptable fallbacks.

| Platform           | Current coverage                                  |
| ------------------ | ------------------------------------------------- |
| Claude Code        | Yes                                               |
| OpenCode           | Yes                                               |
| Codex              | No dedicated LSP surface in RP1 mapping           |
| GitHub Copilot CLI | Unknown / not represented in current RP1 registry |

***

### 19. MCP Server Support

**What**: Model Context Protocol support for external service tools.

**Why**: Useful for Slack, GitHub, databases, and internal systems, but RP1 core workflows use the local `rp1` CLI and filesystem.

**Current Assessment**: MCP is not a Tier 1 support requirement. It should influence prioritization only when a planned workflow depends on external services that cannot be reached through shell or host-native tools.

***

### 20. Implicit Skill Invocation

**What**: Automatic skill activation by description matching.

**Why**: Improves discoverability but risks invoking the wrong stateful workflow.

**Current Assessment**: Do not require this. Explicit invocation is safer for RP1. Codex generation now writes `allow_implicit_invocation: false` in `openai.yaml`, which is the right default for stateful RP1 workflows.

**Evidence**: `cli/src/build/templates/codex/openai-yaml.liquid`

***

### 21. Git Worktree Awareness

**What**: Correct behavior when the user invokes RP1 from a linked worktree while `.rp1/` lives in a canonical project root.

**Why**: RP1 users often work in multiple linked worktrees. Current code separates:

* `codeRoot`: source reads and writes

* `kbRoot`: project knowledge base

* `workRoot`: durable workflow artifacts

**Current Assessment**: This is no longer just a convenience. The harness must preserve generated `codeRoot`/`workRoot` values through delegated work, especially for code-writing agents.

**Evidence**: `cli/src/agent-tools/workflow-bootstrap/*`, `cli/src/agent-tools/rp1-root-dir/*`, `docs/concepts/skill-format.md`

***

## Quick Reference: Evaluation Checklist

Use this checklist when evaluating a new agentic tool for RP1 support.

### Must Have (All Required)

| # | Capability | Test |
|---|------------|------|
| 1 | Sub-agent spawning                      | Can a skill spawn a named worker and retrieve its result?                             |
| 2 | Custom prompt / skill loading           | Can generated RP1 skill files be loaded and invoked?                                  |
| 3 | Shell command execution                 | Can `rp1 agent-tools workflow-bootstrap` and `emit` run successfully?                 |
| 4 | File read/write/search/edit             | Can agents read KB, write artifacts, search code, and edit `codeRoot`?                |
| 5 | Project instruction file                | Is there a loaded `CLAUDE.md`/`AGENTS.md` equivalent with managed fences?             |
| 6 | Workflow bootstrap and harness identity | Can the prompt parse bootstrap JSON and preserve `RUN_ID`, roots, and `CURRENT_HOST`? |

### Should Have (Degraded Without)

| # | Capability | Test |
|---|------------|------|
| 7  | Agent definition files      | Can reusable RP1 agents be defined separately from skills?                  |
| 8  | Parameter passing           | Does invocation context reach `resolve-args`/`workflow-bootstrap` reliably? |
| 9  | Explicit invocation syntax  | Can users invoke one exact RP1 skill?                                       |
| 10 | Structured sub-agent output | Can the parent parse JSON or read a durable result file?                    |
| 11 | Concurrent sub-agents       | Can 4+ workers run concurrently or in background?                           |
| 12 | Interactive user gates      | Can a workflow ask a bounded question and resume later?                     |

### Nice to Have (Enhances UX)

| # | Capability | Test |
|---|------------|------|
| 13 | Dynamic context in prompts | Can prompt-load shell expansion work, or is runtime bootstrap enough?           |
| 14 | Tool permission pre-auth   | Can common `rp1`, `git`, `gh`, file, and shell patterns avoid repeated prompts? |
| 15 | Lifecycle hooks            | Can Arcade/update hooks run on session start?                                   |
| 16 | Web search/fetch           | Can research workflows gather external evidence?                                |
| 17 | Planning tools             | Is there a native todo/plan surface?                                            |
| 18 | LSP integration            | Are code intelligence tools available?                                          |
| 19 | MCP support                | Are external service tools available if needed?                                 |
| 20 | Implicit invocation        | Can it be disabled or made safe for stateful workflows?                         |
| 21 | Worktree awareness         | Does generated context keep `codeRoot`, `kbRoot`, and `workRoot` distinct?      |

***

## Platform Scorecard

Current support status as of 2026-05-11:

| Capability                                 |  Claude Code |    OpenCode    |      Codex     | GitHub Copilot CLI |
| ------------------------------------------ | :----------: | :------------: | :------------: | :----------------: |
| **Must Have**                              |      -       |       -        |       -        |         -          |
| 1. Sub-agent spawning                      |      Yes     |       Yes      |       Yes      |       Partial      |
| 2. Skill loading                           |      Yes     |       Yes      |       Yes      |         Yes        |
| 3. Shell execution                         |      Yes     |       Yes      |       Yes      |         Yes        |
| 4. File read/write/search/edit             |      Yes     |       Yes      |     Partial    |         Yes        |
| 5. Instruction file                        |      Yes     |       Yes      |       Yes      |         Yes        |
| 6. Workflow bootstrap and harness identity |      Yes     |       Yes      |       Yes      |       Partial      |
| **Should Have**                            |      -       |       -        |       -        |         -          |
| 7. Agent definitions                       |      Yes     |       Yes      |       Yes      |         Yes        |
| 8. Parameter passing                       |      Yes     |     Partial    |     Partial    |       Partial      |
| 9. Explicit invocation                     |   Yes (`/`)  | Yes (`/rp1-*`) | Yes (`$rp1-*`) |   Yes (`/rp1-*`)   |
| 10. Structured sub-agent output            |      Yes     |       Yes      |     Partial    |       Partial      |
| 11. Concurrent sub-agents                  |      Yes     |       Yes      |       Yes      |       Partial      |
| 12. Interactive user gates                 |      Yes     |       Yes      |     Partial    |         Yes        |
| **Nice to Have**                           |      -       |       -        |       -        |         -          |
| 13. Dynamic context                        | Not required |  Not required  |  Not required  |    Not required    |
| 14. Permission pre-auth                    |      Yes     |       Yes      |       Yes      |         Yes        |
| 15. Hooks                                  |      Yes     |       Yes      |       Yes      |       Partial      |
| 16. Web search/fetch                       |      Yes     |       Yes      |     Partial    |       Partial      |
| 17. Planning tools                         |      Yes     |       Yes      |       Yes      |         No         |
| 18. LSP                                    |      Yes     |       Yes      |       No       |       Unknown      |
| 19. MCP                                    |      Yes     |     Limited    |       Yes      |       Unknown      |
| 20. Implicit invocation                    |      No      |       No       |    Disabled    |         No         |
| 21. Worktree awareness                     |      Yes     |       Yes      |       Yes      |       Partial      |

Interpretation:

* **Claude Code** remains the canonical/highest-confidence target.

* **OpenCode** remains a strong supported target.

* **Codex** is supported, but its support is compensation-heavy: no native parameter substitution, file I/O mostly through shell/apply-patch, managed config changes, and a different multi-agent flow.

* **Copilot** has real support infrastructure, but should not be treated as fully parity-equivalent until tracked workflow bootstrap and file-backed sub-agent output are validated end-to-end.

***

## Build Pipeline Compatibility

Beyond target-harness runtime capabilities, RP1 must generate installable artifacts. A new harness now requires more than the original five implementation items.

### Required RP1 Build Work for a New Harness

1. **Supported tool registry**: Add the tool to `cli/src/config/supported-tools.yaml` with binary, minimum version, instruction file, and capabilities.
2. **Build platform type**: Add the platform to `BuildPlatform` in `cli/src/build/template-context.ts`.
3. **Platform registry**: Map canonical RP1/Claude-style tool names to target-harness tool names.
4. **Platform definition**: Add a `PlatformDefinition` with templates, naming, lifecycle hooks, bundle behavior, and platform config.
5. **Skill template**: Render frontmatter, arguments, host context, `workflow-bootstrap` for tracked workflows, parameter fallback, and semantic-tag output.
6. **Agent template**: Render standalone agent definitions in the harness format.
7. **Semantic tags and filters**: Support `dispatch_agent`, `ask_user`, `plan_tool`, `edit_model`, `web_access`, namespace references, slash commands, parameters, and tool prose.
8. **Installer**: Install or register generated artifacts without clobbering user-owned configuration.
9. **Verifier**: Detect healthy, partial, legacy, and missing installs.
10. **Uninstaller/update path**: Remove only RP1-managed content and preserve user content.
11. **Docs**: Add setup, invocation, troubleshooting, and platform caveats.
12. **Tests**: Add template golden tests, tag/filter tests, install/verify tests, and lint coverage.

The generic build loop is now data-driven, but adding a harness still requires per-harness product work. The work is cheapest when the new harness resembles Claude Code or OpenCode. It becomes more expensive when RP1 must generate config patches, role mappings, file-backed handoffs, or prose fallbacks for missing native tools.

***

## Revised Lessons from Codex

The original report concluded that Codex should be dropped. The current codebase proves a narrower lesson: Codex became supportable only after RP1 absorbed the incompatibilities into first-class build and install machinery.

Current Codex compensations:

1. **No native `$ARGUMENTS`**: RP1 rewrites parameter references into prose and relies on `resolve-args`/`workflow-bootstrap`.
2. **Different agent model**: RP1 emits per-agent TOML, an aggregate `rp1-agents.toml`, role heuristics, and sub-agent validation.
3. **Different tool names**: RP1 rewrites tool prose and filters unsupported tools.
4. **Sandbox/write restrictions**: RP1 patches writable roots into Codex config.
5. **Hooks require config**: RP1 enables `codex_hooks = true` and ships `codex-hooks.json`.
6. **Different invocation syntax**: RP1 emits `$rp1-*` commands and disables implicit invocation.

The lesson is not "never support a harness with gaps." The lesson is: support a gappy harness only when the workarounds are explicit, tested, installed safely, documented, and worth the maintenance burden.

***

## Decision Framework

When evaluating a new tool:

1. **Check all Tier 1 capabilities**. If any are missing and cannot be reliably generated or configured by RP1, stop.
2. **Identify required compensations**. For every non-native behavior, name the exact RP1 build/install/runtime workaround.
3. **Validate workflow bootstrap first**. Run a tracked workflow that exercises `workflow-bootstrap`, `emit`, artifact registration, and a user gate.
4. **Validate sub-agent scale**. Run a workflow with multiple background workers, not only a single toy agent.
5. **Validate codeRoot/workRoot behavior**. Test from a linked worktree and confirm source edits land in the worktree while artifacts land in canonical `.rp1/work`.
6. **Assess integration quality**. More transformation means more ongoing maintenance.
7. **Assess platform maturity**. Unstable APIs and config formats increase support cost.
8. **Assess demand**. A compensation-heavy target needs a clear user base.
9. **Document caveats honestly**. Do not list a harness as parity-equivalent when it only has build/install support.

***

## Known Gaps and Follow-Up

1. **Copilot tracked workflow parity**: `copilot/skill.liquid` should either inject full `workflow-bootstrap` for tracked workflows or the docs/scorecard should keep Copilot marked partial for Arcade-tracked workflows.
2. **Copilot file-backed sub-agent outputs**: Generated prompts reference `.rp1/work/agent-output/{run-id}/...json`; this needs end-to-end validation and a producer convention that actually writes those files.
3. **Codex/Copilot multi-agent scale**: Current build tests verify generated instructions. Runtime scale validation should run representative map-reduce workflows.
4. **`rp1 run` overlay**: Memory and prior research discuss a coalesced overlay launch model, but no `rp1 run` command exists in the current source tree. Do not treat it as current support evidence.
5. **New harnesses such as Goose**: No current registry/template/install evidence exists. Evaluate from Tier 1 rather than assuming support from branch names or adjacent experiments.

***

## Sources

### Original Research Inputs

| Document                                                             | Key Contributions                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `2026-03-08-codex-cli-support-for-rp1-gap-analysis.md`               | Original Codex capability mapping                     |
| `2026-03-09-codex-integration-issues-gap-analysis-and-fix-plan.md`   | Agent definition formats, content transformation gaps |
| `2026-01-31-opencode-compatibility-gaps.md`                          | OpenCode capability mapping and directory conventions |
| `2026-03-09-hook-system-compatibility-across-claude-code.md`         | Hook capability comparison                            |
| `2026-03-12-templating-differences-across-claude-code-opencode.md`   | Tool name mappings and behavioral differences         |
| `2026-03-13-codex-support-changes-regression-check.md`               | Build pipeline validation and artifact formats        |
| `2026-02-20-migrating-rp1-task-system-to-claudes-agent-teams.md`     | Agent teams and task coordination                     |
| `2026-02-26-migrating-rp1-custom-prompts-commands-to-skills.md`      | Skill loading and parameter passing                   |
| `2026-03-01-state-management-overhaul-declarative-state-machines.md` | Workflow visibility and state tracking                |
| `2026-03-10-templating-system-for-rp1-multi-harness-artifact.md`     | Multi-harness template architecture                   |
| `2025-12-29-git-worktrees-for-parallel-ai-agent-development.md`      | Worktree support and path resolution                  |

### Current Repo Evidence

| Source                                     | Evidence Used                                            |
| ------------------------------------------ | -------------------------------------------------------- |
| `cli/src/config/supported-tools.yaml`      | Current supported tool registry                          |
| `cli/src/build/template-context.ts`        | Current `BuildPlatform` union                            |
| `cli/src/build/platform-definitions.ts`    | Platform definitions and hooks for all generated targets |
| `cli/src/build/tags/*.ts`                  | Semantic tag rendering by platform                       |
| `cli/src/build/filters/*.ts`               | Tool, parameter, namespace, and prose transformations    |
| `cli/src/build/templates/*`                | Generated skill/agent/manifest shapes                    |
| `cli/src/install/codex/*`                  | Codex install, config patching, prerequisites            |
| `cli/src/install/copilot/*`                | Copilot marketplace install and verification             |
| `cli/src/agent-tools/workflow-bootstrap/*` | Tracked workflow bootstrap runtime contract              |
| `cli/src/agent-tools/rp1-root-dir/*`       | Directory and `codeRoot` resolution                      |
| `docs/getting-started/installation.md`     | User-facing platform setup and invocation docs           |
| `docs/reference/platforms/copilot.md`      | Copilot support, verification, and troubleshooting docs  |
