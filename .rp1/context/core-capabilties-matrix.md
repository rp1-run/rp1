# Core Capabilities Required for RP1 Platform Support

**Generated**: 2026-03-14
**Scope**: strategic-analysis
**Purpose**: Reference document for evaluating whether a new AI agentic tool can serve as an RP1 harness
**Derived From**: 15+ internal research documents spanning Dec 2025 - Mar 2026

## Executive Summary

RP1 is a plugin-driven workflow system that delivers markdown-authored skills and agents to AI coding tools via a build pipeline. After supporting Claude Code (primary), OpenCode (second harness), and attempting Codex (abandoned due to capability gaps), we now have empirical data on what capabilities an agentic tool **must** provide before RP1 can target it.

This document distills those findings into a tiered capability checklist: **Must Have** (blocking -- RP1 fundamentally cannot work without these), **Should Have** (significant degradation without, but workarounds exist), and **Nice to Have** (enhances UX but not required for core functionality).

The decision to drop Codex support validates this framework -- Codex failed on multiple Must Have and Should Have capabilities simultaneously, making the integration cost exceed the value.

---

## Tier 1: Must Have (Blocking)

These capabilities are non-negotiable. If an agentic tool lacks **any** of these, RP1 cannot support it as a harness.

### 1. Sub-Agent Spawning (Single Level)

**What**: The ability for a running skill/prompt to spawn at least one sub-agent that executes independently and returns results.

**Why**: RP1's architecture is built on skill-to-agent delegation. 27 of 31 workflows spawn sub-agents. The build workflow spawns 14 agents; PR review spawns 7; knowledge-build spawns 5. Without sub-agent spawning, RP1 reduces to a collection of single-file prompts -- losing all orchestration, map-reduce, and builder-reviewer loop capabilities.

**Minimum Requirements**:
- Spawn at least one sub-agent from within a skill/prompt context
- Pass a prompt/instructions to the sub-agent
- Receive structured results back from the sub-agent
- Support parallel spawning (multiple sub-agents in a single turn)
- Depth of 1 is sufficient -- RP1 sub-agents never spawn other sub-agents

**How Each Platform Delivers This**:
| Platform | Mechanism | Status |
|----------|-----------|--------|
| Claude Code | `Task` tool with `subagent_type` parameter | Working |
| OpenCode | `@mention` pattern with `mode: subagent` | Working |
| Codex | `spawn_agent` / `wait` pattern | Untested -- Codex dropped before validation |

**Evidence**: Codex gap analysis F-002, templating differences F-003, sub-agent extraction research

---

### 2. Custom Prompt / Skill Loading

**What**: The ability to load and execute user-authored markdown-based prompts (skills) with at minimum `name` and `description` metadata.

**Why**: RP1's entire delivery mechanism is SKILL.md files following the Agent Skills open standard. Skills are the interface layer through which users access all RP1 workflows. Without skill loading, there is no way to deliver RP1 functionality to the tool.

**Minimum Requirements**:
- Load SKILL.md files with YAML frontmatter (`name`, `description`)
- Execute the markdown body as instructions for the model
- Support a discovery mechanism (directory-based, marketplace, or config registration)
- Gracefully ignore unknown frontmatter fields (RP1 uses a `metadata` map for extensions)

**How Each Platform Delivers This**:
| Platform | Mechanism | Status |
|----------|-----------|--------|
| Claude Code | Plugin marketplace + `.claude/skills/` directory | Working |
| OpenCode | `.opencode/skills/` + `.claude/skills/` compat | Working |
| Codex | `~/.agents/skills/` + `$skillname` invocation | Tested -- skill loading works |

**Evidence**: Codex gap analysis F-001 (agentskills.io compatibility), commands-to-skills migration F-001

---

### 3. Shell Command Execution

**What**: The ability to run arbitrary shell/bash commands from within a skill or agent context.

**Why**: RP1's runtime services are CLI tools invoked via `rp1 agent-tools ...` commands. State tracking (`work update`), artifact registration (`work artifact`), root directory resolution (`rp1-root-dir`), and mermaid validation (`mmd-validate`) all depend on shell execution. Without Bash, agents cannot interact with RP1's runtime layer.

**Minimum Requirements**:
- Execute shell commands and capture stdout/stderr
- Support long-running commands (some agent-tools operations take 10+ seconds)
- Allow pre-authorized command patterns to avoid per-invocation approval prompts

**How Each Platform Delivers This**:
| Platform | Mechanism | Status |
|----------|-----------|--------|
| Claude Code | `Bash` tool with pattern-based `allowed-tools` | Working |
| OpenCode | `bash_run` with glob permissions | Working |
| Codex | `functions.exec_command` with sandbox policy | Working (sandbox limitations apply) |

**Evidence**: All research documents reference Bash tool usage; Codex gap analysis F-003

---

### 4. File System Read and Write

**What**: The ability to read files from and write files to the local filesystem.

**Why**: Agents read knowledge base files (`index.md`, `architecture.md`, etc.), read/write feature artifacts (`requirements.md`, `design.md`, `tasks.md`), and produce research reports. File I/O is fundamental to every RP1 workflow.

**Minimum Requirements**:
- Read file contents given a path
- Write/create files at specified paths
- Edit existing files (string replacement or diff-based)
- Search files by name pattern (glob) and content (grep)

**How Each Platform Delivers This**:
| Platform | Read | Write | Edit | Search |
|----------|------|-------|------|--------|
| Claude Code | `Read` | `Write` | `Edit` (exact string replacement) | `Glob`, `Grep` |
| OpenCode | `read_file` | `write_file` | `edit_file` | `glob_pattern`, `grep_file` |
| Codex | `cat` via exec_command | `apply_patch` | `apply_patch` (unified diff) | `grep` via exec_command |

**Note**: Codex's file I/O is more limited -- no dedicated read tool (uses `cat` via shell), no dedicated search tools. This works but is less ergonomic. The minimum bar is having file read/write capability, even if through shell commands.

**Evidence**: Templating differences F-002, all workflow research documents

---

### 5. Project-Level Instruction File

**What**: A mechanism to inject persistent instructions that are loaded at the start of every session (CLAUDE.md, AGENTS.md, or equivalent).

**Why**: RP1 injects knowledge base loading instructions into this file during `rp1 init`. These instructions tell the model to read `index.md` first and then load task-specific KB files. Without this, agents don't know about the project's knowledge base and cannot follow RP1's progressive disclosure pattern.

**Minimum Requirements**:
- A file (or set of files) automatically loaded at session start
- Support for content fencing so RP1 can manage its section (`<!-- rp1:start/end -->` or equivalent)
- Sufficient size limit (RP1's injection is small, typically <1KB)

**How Each Platform Delivers This**:
| Platform | File | Discovery | Limit |
|----------|------|-----------|-------|
| Claude Code | `CLAUDE.md` | Git root + parent dirs | No documented limit |
| OpenCode | `CLAUDE.md` (compat) + `AGENTS.md` | Git root | No documented limit |
| Codex | `AGENTS.md` | Git root to CWD, cascading | 32 KiB combined (configurable) |

**Evidence**: Codex gap analysis F-010, OpenCode compatibility F-012

---

---

## Tier 2: Should Have (Significant Degradation Without)

These capabilities are important for a good experience. Missing any one is manageable; missing several makes the platform significantly less capable.

### 6. Agent Definition Files

**What**: The ability to define reusable agent personas with specific instructions, tool access, and model configuration -- separate from skill files.

**Why**: RP1 has 45+ agent files that define specialized roles (task-builder, code-checker, feature-verifier, etc.). Each agent has tailored instructions, anti-loop directives, output contracts, and tool lists. Without agent definition files, all agent instructions must be inlined into skill prompts, making skills massive and unmaintainable.

**How Each Platform Delivers This**:
| Platform | Format | Discovery |
|----------|--------|-----------|
| Claude Code | Bare `.md` files in plugin `agents/` directory | Via `Task` tool `subagent_type` parameter |
| OpenCode | `.md` with YAML frontmatter (`mode: subagent`, `tools: {}`) | Via `@mention` or Task tool |
| Codex | TOML sections in `config.toml` with `developer_instructions` | Via `[agents.<name>]` config |

**Evidence**: Codex gap analysis F-013, templating differences F-006

---

### 7. Parameter Passing to Skills

**What**: The ability to pass arguments from the user's invocation to the skill content (`$ARGUMENTS`, `$1`, `$2`).

**Why**: Most RP1 skills accept parameters -- feature IDs, PR numbers, file paths, freeform context. Without parameter substitution, users must type the full context into a natural language prompt and the model must parse it -- less reliable and more error-prone.

**Workaround**: Model-driven argument parsing where the skill prompt instructs the model to extract named parameters from the user's natural language input. This is platform-agnostic but less precise.

**How Each Platform Delivers This**:
| Platform | Mechanism | Status |
|----------|-----------|--------|
| Claude Code | `$ARGUMENTS`, `$1`, `$2` substitution | Working |
| OpenCode | Parameter substitution (limited) | Partial |
| Codex | NOT supported -- `$ARGUMENTS` stays as literal string | Missing (model-driven fallback) |

**Evidence**: Commands-to-skills migration F-004 (live Codex test confirmed `$ARGUMENTS` does NOT resolve)

---

### 8. Explicit Skill Invocation Syntax

**What**: A mechanism for users to explicitly invoke a specific skill by name (slash commands, `$` mentions, or equivalent).

**Why**: Users need to be able to say "run the build workflow" unambiguously. Implicit invocation (description matching) is unreliable for complex multi-step workflows where the wrong skill could be triggered.

**How Each Platform Delivers This**:
| Platform | Syntax | Example |
|----------|--------|---------|
| Claude Code | `/skill-name` | `/rp1-dev:build-fast feature-123` |
| OpenCode | `/user:rp1-dev:skill-name` | `/user:rp1-dev:build-fast` |
| Codex | `$skill-name` | `$rp1-dev-build-fast` |

**Evidence**: Codex gap analysis F-005, OpenCode compatibility F-012

---

### 9. Structured Output from Sub-Agents

**What**: Sub-agents can return structured data (JSON) to the orchestrator.

**Why**: RP1's map-reduce workflows depend on agents returning JSON output contracts. The PR review splitter returns review units as JSON. Knowledge build agents return findings as JSON. The orchestrator merges these structured results. Without structured output, orchestrators must parse free-text agent responses, which is unreliable.

**Minimum Requirements**:
- Sub-agent can write structured output (JSON or similar)
- Orchestrator can read the sub-agent's output programmatically
- Output survives context window boundaries (not truncated)

**Evidence**: Sub-agent extraction research F-001--F-005 (all propose JSON output contracts), all map-reduce workflow research

---

### 10. Concurrent Sub-Agent Execution

**What**: The ability to spawn multiple sub-agents in parallel (not just sequentially).

**Why**: RP1's map-reduce workflows spawn 4-14 agents simultaneously. PR review spawns all sub-reviewers in a single message. Knowledge build spawns 4 analysis agents in parallel. Sequential execution would make these workflows 4-14x slower.

**How Each Platform Delivers This**:
| Platform | Mechanism | Status |
|----------|-----------|--------|
| Claude Code | Multiple `Task` calls in a single message | Working |
| OpenCode | Multiple `task` calls in a single message | Working |
| Codex | `spawn_agent` + `wait` pattern (async) | Supported but different pattern |

**Evidence**: Task system migration F-002 (3 distinct map-reduce patterns), PR review and knowledge-build workflows

---

## Tier 3: Nice to Have (Enhances UX)

These capabilities improve the developer experience but are not required for core functionality.

### 11. Dynamic Context / Shell Expansion in Prompts

**What**: The ability to execute shell commands at prompt-load time and inject the results into the skill content (`` !`command` `` syntax).

**Why**: Used in 17 skills exclusively for `rp1 agent-tools rp1-root-dir`. However, this is syntactic sugar -- the model can simply run the same command as a regular Bash call at the start of skill execution. Not a hard requirement of the platform.

**Current Coverage**: Claude Code (working), Codex (working), OpenCode (unknown)

**Evidence**: Commands-to-skills migration F-004

---

### 12. Tool Permission Pre-Authorization

**What**: A mechanism to pre-approve specific tool usage patterns so that workflows can run without constant human approval prompts.

**Why**: RP1 workflows make dozens of shell calls per run. Without pre-authorization, every call triggers an approval prompt. Tedious but functional -- users can approve manually.

**Current Coverage**: Claude Code (per-skill `allowed-tools`), OpenCode (per-agent permission map), Codex (session-wide `[[shell.approved]]`)

**Evidence**: Codex gap analysis F-003, templating differences F-008

---

### 13. Lifecycle Hooks

**What**: Event-driven hooks that fire on session start, tool execution, task completion, etc.

**Why**: RP1 uses hooks for update checks and arcade daemon startup. These are convenience features, not core functionality.

**Current Coverage**:
| Platform | Session Start | Tool Events | Task Events |
|----------|---------------|-------------|-------------|
| Claude Code | Yes (hooks.json) | No | No |
| OpenCode | Yes (30+ event types) | Yes | Yes |
| Codex | No hook system | No | No |

**Impact of Absence**: Users must manually run `rp1 check-update` and `rp1 arcade`. Minor inconvenience.

**Evidence**: Hook system compatibility research

---

### 14. Web Search and Fetch

**What**: Tools for searching the web and fetching URL content.

**Why**: Research workflows (deep-research, requirements gathering) benefit from web access. Without it, research is limited to codebase analysis.

**Current Coverage**: Claude Code (WebFetch + WebSearch), OpenCode (web_fetch + web_search), Codex (web_search only, via Responses API)

**Evidence**: Templating differences F-008

---

### 15. Planning / Task Tracking Tools

**What**: Built-in tools for creating task lists, tracking progress, managing dependencies (TaskCreate, TodoWrite, update_plan).

**Why**: Enables real-time progress visibility in the RP1 web UI dashboard. Without it, workflow progress is only visible via state machine status updates (which work via shell commands).

**Evidence**: Task system migration research, state management overhaul research

---

### 16. LSP Integration

**What**: Language Server Protocol tools for code intelligence (go-to-definition, find-references, diagnostics).

**Why**: Improves code navigation accuracy for agents working on large codebases. Not required -- agents can use grep/glob as fallback.

**Current Coverage**: Claude Code (LSP tool), OpenCode (lsp tool), Codex (not available)

**Evidence**: Templating differences F-008

---

### 17. MCP Server Support

**What**: Model Context Protocol for connecting external services as tool providers.

**Why**: Enables integration with external systems (Slack, GitHub, databases). Useful but not part of RP1's core workflow.

**Current Coverage**: Claude Code (full), OpenCode (limited), Codex (full -- both consumer and provider)

**Evidence**: Codex gap analysis F-008

---

### 18. Implicit Skill Invocation

**What**: Automatic skill activation based on description matching (Codex-specific feature).

**Why**: Could improve discoverability -- users describe a task and the right skill auto-triggers. Risk of mis-triggering for complex workflows.

**Evidence**: Codex gap analysis F-011

---

### 19. Git Worktree Awareness

**What**: Proper handling of git worktrees for parallel development (resolving shared config, .rp1 directory discovery).

**Why**: Enables parallel feature development with isolated working directories. RP1 has its own workaround via `rp1 agent-tools rp1-root-dir`.

**Evidence**: Worktree research (3 documents)

---

## Quick Reference: Evaluation Checklist

Use this checklist when evaluating a new agentic tool for RP1 support.

### Must Have (all required)

| # | Capability | Test |
|---|-----------|------|
| 1 | Sub-agent spawning | Can a skill spawn an agent and get results back? |
| 2 | Custom prompt / skill loading | Can SKILL.md files be loaded and executed? |
| 3 | Shell command execution | Can `rp1 agent-tools work update ...` run from within a skill? |
| 4 | File system read/write | Can agents read KB files and write artifacts? |
| 5 | Project instruction file | Is there a CLAUDE.md/AGENTS.md equivalent auto-loaded at session start? |

### Should Have (degraded without)

| # | Capability | Test |
|---|-----------|------|
| 6 | Agent definition files | Can reusable agent personas be defined separately from skills? |
| 7 | Parameter passing | Does `/skill arg1 arg2` deliver args to the skill content? |
| 8 | Explicit invocation syntax | Can users invoke a skill by exact name? |
| 9 | Structured sub-agent output | Can sub-agents return JSON that the orchestrator can parse? |
| 10 | Concurrent sub-agents | Can 4+ sub-agents run in parallel? |

### Nice to Have (enhances UX)

| # | Capability | Test |
|---|-----------|------|
| 11 | Dynamic context in prompts | Does `` !`rp1 agent-tools rp1-root-dir` `` resolve at load time? |
| 12 | Tool permission pre-auth | Can `rp1 *` and `echo *` be pre-approved to avoid approval fatigue? |
| 13 | Lifecycle hooks | Session start hooks for update checks? |
| 14 | Web search/fetch | Can research agents search the web? |
| 15 | Planning tools | Built-in task/todo tracking? |
| 16 | LSP integration | Code intelligence tools? |
| 17 | MCP support | External service integration? |
| 18 | Implicit invocation | Auto-trigger skills by description? |
| 19 | Worktree awareness | Handles git worktrees correctly? |

---

## Platform Scorecard

Current platform support status as of 2026-03-14:

| Capability | Claude Code | OpenCode | Codex |
|-----------|:-----------:|:--------:|:-----:|
| **Must Have** | | | |
| 1. Sub-agent spawning | Yes | Yes | Yes (different API) |
| 2. Skill loading | Yes | Yes | Yes |
| 3. Shell execution | Yes | Yes | Yes (sandboxed) |
| 4. File read/write | Yes | Yes | Partial (via shell) |
| 5. Instruction file | Yes | Yes | Yes |
| **Should Have** | | | |
| 6. Agent definitions | Yes | Yes | Yes (TOML format) |
| 7. Parameter passing | Yes | Partial | No |
| 8. Explicit invocation | Yes (`/`) | Yes (`/user:`) | Yes (`$`) |
| 9. Structured output | Yes | Yes | Untested |
| 10. Concurrent sub-agents | Yes | Yes | Yes |
| **Nice to Have** | | | |
| 11. Dynamic context | Yes | Unknown | Yes |
| 12. Permission pre-auth | Yes (per-skill) | Yes (per-agent) | Yes (session-wide) |
| 13. Hooks | Yes | Yes (30+ events) | No |
| 14. Web search/fetch | Yes | Yes | Partial |
| 15. Planning tools | Yes | Partial | Yes |
| 16. LSP | Yes | Yes | No |
| 17. MCP | Yes | Limited | Yes |
| 18. Implicit invocation | No | No | Yes |
| 19. Worktree awareness | Via rp1 tooling | Via rp1 tooling | Via rp1 tooling |

---

## Build Pipeline Compatibility

Beyond runtime capabilities, RP1 also needs to **generate** platform-specific artifacts. The build pipeline transforms Claude Code-canonical SKILL.md and agent `.md` files into platform-specific formats. A new harness requires:

1. **PlatformRegistry** -- Tool name mappings (e.g., `Read` -> platform equivalent)
2. **Content transformations** -- Namespace syntax, slash commands, agent references
3. **Artifact generator** -- Produce platform-specific file formats (frontmatter, TOML, etc.)
4. **Installer** -- Copy artifacts to the correct platform directories
5. **Validator** -- Verify generated artifacts are well-formed

This is implementation work, not a capability requirement of the target platform. But it scales with how different the platform's formats are from Claude Code's canonical format. Codex required the most transformation work due to TOML agent configs, `$` invocation syntax, and `[[shell.approved]]` config injection.

---

## Lessons from the Codex Experience

Codex was dropped not because of a single missing capability, but because of **compounding friction**:

1. **Parameter passing doesn't work** -- `$ARGUMENTS` stays literal (Should Have #9)
2. **Sub-agent spawning untested at scale** -- spawn/wait API pattern is fundamentally different (Must Have #1 -- technically present but unvalidated)
3. **No hooks** -- Can't auto-start arcade or check updates (Nice to Have #13)
4. **Session-wide permissions only** -- Requires modifying user config files (Must Have #6 -- present but invasive)
5. **API instability** -- Rust rewrite in progress, interfaces may change (external risk)
6. **Sandbox restrictions** -- Limits on filesystem and network access (compounds with #3, #4)

The key insight: even when individual capabilities are technically present, **the integration quality matters**. A capability that exists but works differently from the canonical format (Claude Code) incurs ongoing build pipeline maintenance cost.

---

## Decision Framework

When evaluating a new tool:

1. **Check all 5 Must Haves** -- If any are missing, stop. RP1 cannot support this tool.
2. **Count Should Haves** -- If fewer than 3 of 5 are present, the degraded experience may not be worth the build pipeline investment.
3. **Assess integration quality** -- Even if capabilities exist, how different are they from Claude Code? More difference = more build pipeline work = more maintenance burden.
4. **Evaluate platform maturity** -- Is the platform stable or actively being rewritten? Unstable APIs mean rework.
5. **Consider user base** -- Is there sufficient demand for this platform to justify the investment?

---

## Sources

This document synthesizes findings from the following research reports:

| Document | Key Contributions |
|----------|-------------------|
| `2026-03-08-codex-cli-support-for-rp1-gap-analysis.md` | Must Haves 1-6, Codex capability mapping |
| `2026-03-09-codex-integration-issues-gap-analysis-and-fix-plan.md` | Agent definition formats, content transformation gaps |
| `2026-01-31-opencode-compatibility-gaps.md` | OpenCode capability mapping, directory conventions |
| `2026-03-09-hook-system-compatibility-across-claude-code.md` | Hook capability comparison across platforms |
| `2026-03-12-templating-differences-across-claude-code-opencode.md` | Tool name mappings, behavioral differences matrix |
| `2026-03-13-codex-support-changes-regression-check.md` | Build pipeline validation, platform artifact formats |
| `2026-02-20-migrating-rp1-task-system-to-claudes-agent-teams.md` | Agent teams, task coordination capabilities |
| `2026-02-26-migrating-rp1-custom-prompts-commands-to-skills.md` | Skill loading, parameter passing, platform constraints |
| `2026-03-01-state-management-overhaul-declarative-state-machines.md` | State tracking, workflow visibility requirements |
| `2026-03-10-templating-system-for-rp1-multi-harness-artifact.md` | Build pipeline architecture, template system |
| `2026-02-22-claude-code-tasks-vs-teams-separate-features.md` | Agent teams vs task list distinction |
| `2025-12-29-git-worktrees-for-parallel-ai-agent-development.md` | Worktree support, path resolution |
| `2026-01-01-extracting-more-sub-agents-from-build-md-command.md` | Sub-agent architecture, JSON output contracts |
| `2026-03-04-is-the-dedicated-work-status-skill-still-needed.md` | State machine integration, status reporting |
| `2026-03-09-rp1-meta-skill-a-self-aware-system-guide.md` | Skill discovery, documentation patterns |
