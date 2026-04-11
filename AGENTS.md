# rp1 Agent Authoring Guide

This file is intentionally narrow. Use it for agent and skill authoring rules that are specific to rp1.

1. Read `.rp1/context/index.md` first.
2. Then load only the KB files needed for the task.

Project understanding belongs in `.rp1/context/`. This file covers runtime and authoring constraints.

## Core Rules

### Namespace prefixes

Use these prefixes exactly:

- Skills: `/rp1-base:skill-name`, `/rp1-dev:skill-name`, `/rp1-utils:skill-name`
- Agent references: `subagent_type: rp1-base:agent-name` for Claude Code, `subagent_type: @rp1-dev/agent-name` for OpenCode

### Subagent limitations

Subagents generally cannot spawn other agents. If an agent is designed to run as a subagent:

- Do not use SlashCommand to call other commands.
- Do not call `/rp1-base:knowledge-load` from inside the subagent.
- Inline only the prompt text or KB guidance the subagent actually needs.

### Codex task shorthand

For Codex agents, interpret any instruction in the form `Task: <sub-agent-name>` as:

- spawn `<sub-agent-name>`

Treat this as an execution directive, not as descriptive text.

### Codex subagent waiting

When Codex agents spawn subagents in this repo:

- Do not assume a subagent failed just because it does not answer quickly.
- Use longer wait windows for artifact-producing or workflow-heavy subagents.
- Prefer waiting for the spawned subagent to complete before declaring it stalled or rerouting around it, unless the user explicitly wants parallel speculative work.
- Check for expected side effects such as artifact files before concluding the subagent is stuck.
- If the subagent is on the critical path, babysit it with patient polling instead of replacing it after a short timeout.

### Cross-plugin dependency rule

- Dev agents may depend on base.
- Base agents must not call dev commands.
- If a dev workflow needs `/rp1-base:knowledge-load` and it is unavailable, tell the user to install `rp1-base`.

## Parameters and templating

### Argument style

Define parameters using structured `arguments` arrays in frontmatter. Skills nest arguments under `metadata`; agents place them at the top level.

**Skills** (`metadata.arguments`):

```yaml
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
      aliases:
        - "afk"
        - "no prompts"
```

**Agents** (top-level `arguments`):

```yaml
arguments:
  - name: FEATURE_ID
    type: string
    required: true
    description: "Feature identifier"
  - name: CONTEXT
    type: string
    required: false
    description: "Optional context"
```

The build pipeline auto-derives the `argument-hint` string from these definitions. Do not write manual `argument-hint` strings or hand-written `## Parameters` / `## 0. Parameters` tables -- both trigger build errors.

Argument names use UPPER_SNAKE_CASE. Supported types: `string`, `boolean`, `enum`. See [docs/concepts/skill-format.md](docs/concepts/skill-format.md) for the full field reference.

### Canonical variable assignment

The build pipeline automatically injects a `## 0. Resolve Arguments` section into every parameterized skill that declares `metadata.arguments`. This section calls `rp1 agent-tools resolve-args --name rp1-{plugin}:{skill}` to resolve both user-supplied arguments and environment variables, returning structured JSON. Skill authors do **not** write this section — it is generated from frontmatter. See [docs/concepts/skill-format.md](docs/concepts/skill-format.md) for details.

**Agents are excluded** from this requirement -- they receive pre-resolved named parameters from parent skills and do not call `resolve-args` themselves.

#### Directory resolution

All project directories are deterministic from the project root. The `RP1_PROJECT_ROOT`, `RP1_KB_ROOT`, and `RP1_WORK_ROOT` environment variables have been removed. Skills and agents should not declare them in `environment` schemas.

To discover project directories, use `rp1 agent-tools rp1-root-dir` which returns:

- `projectRoot` -- the project root (directory containing `.rp1/project_id`)
- `kbRoot` -- always `<projectRoot>/.rp1/context`
- `workRoot` -- always `<projectRoot>/.rp1/work`

#### Path interpolation

When referencing paths in prompts, use relative paths from the project root:

```markdown
.rp1/context/index.md
.rp1/work/features/{FEATURE_ID}/
```

Do not use `${}` shell parameter expansion in Bash snippets intended for Claude Code.

### Artifact Path Contract

When emitting `artifact_registered` events via `rp1 agent-tools emit`, artifact paths must follow these rules:

- **Always include `storageRoot` explicitly.** Do not rely on implicit defaults.
- **Work artifacts** (`storageRoot: "work_dir"`): Paths must be relative to the work root (`.rp1/work/`) without any prefix. Example: `features/my-feature/design.md` (not `work/features/...`).
- **KB artifacts** (`storageRoot: "project"`): Paths must be relative to the project root. Example: `.rp1/context/index.md`.
- **Absolute paths**: Used as-is regardless of `storageRoot`.

The system automatically resolves relative paths against the correct base directory based on `storageRoot`. Agents do not need to construct absolute paths manually.

### XML tags vs inline parameters

- Use XML tags when a command spawns subagents, passes multiline content, or needs strongly delimited instructions.
- Use inline positional parameters for simple single-agent delegation.

## Skill frontmatter

All invocable prompts use the canonical `SKILL.md` format described in [docs/concepts/skill-format.md](docs/concepts/skill-format.md).

If a skill executes shell commands, add `allowed-tools` in frontmatter. Default to:

```yaml
allowed-tools: Bash(echo *), Bash(rp1 *)
```

Add `Bash(printf *)` only when the skill actually needs it.

`allowed-tools` is required on skills, not on agent files. Subagents inherit Bash permissions from the invoking skill.

## State machines

Skills and agents may opt into workflow state tracking by adding a `## STATE-MACHINE` section with a `stateDiagram-v2` Mermaid block.

Required rules:

- State IDs must match the `--step` values sent to `rp1 agent-tools emit`.
- `--run-id` is mandatory for state-machine-enabled skills and agents.
- `--unit` enables per-task tracking.
- Follow graph transitions exactly; invalid steps are rejected with actionable error messages listing valid states and transitions.
- Sub-agents emitting into a parent run must namespace their step names with the agent identifier and a colon separator to avoid collision with parent workflow states.

### Sub-agent step namespacing

Sub-agents prefix `--step` values with `{agent-name}:` so their steps are distinguishable from parent workflow states and bypass parent state machine validation:

```bash
# Correct: namespaced sub-agent step
rp1 agent-tools emit --workflow build --step task-builder:building ...

# Wrong: bare step collides with parent workflow
rp1 agent-tools emit --workflow build --step building ...
```

Examples of correctly namespaced steps:

- `task-builder:building`, `task-builder:completed`, `task-builder:failed`
- `feature-verifier:verifying`, `feature-verifier:completed`, `feature-verifier:failed`
- `task-reviewer:reviewing`, `task-reviewer:completed`, `task-reviewer:failed`

For the full pattern and command examples, see [docs/concepts/state-machines.md](docs/concepts/state-machines.md).

## Repo-specific development defaults

- Prefer Bun and its ecosystem for new code. Fall back to Node.js only when Bun is not viable.
- Keep the single-executable CLI build in mind when adding assets or runtime files.
- Use fp-ts pragmatically; prefer clear `match`, `map`, `flatMap`, and `isLeft` flows over overengineered abstractions.
- For frontend work in `cli/web-ui/`, use `frontend-design` and `playwright-cli`; run `just serve-web-ui` before browser validation and use `/tmp` for temporary screenshots.

## Commit discipline

- When making commits, stage only the intended changes and verify the worktree state before committing.
- Use Conventional Commits for every commit message: `<type>(<optional-scope>): <imperative summary>`.
- Prefer scopes when they add clarity, such as `feat(web-ui): move notifications into dedicated sidebar` or `docs(agent): require conventional commits`.
- Do not use vague commit messages like `updates`, `fix stuff`, or `wip` for final commits.

## Delivery checklist

After changes:

- Verify namespace prefixes are correct.
- Keep agent prompts concise and non-redundant.
- Ensure cross-plugin calls handle missing dependencies.
- Update relevant docs in `docs/` when behavior changes.
- Run `just` to inspect available test, lint, and format commands when code changes require validation.

## Environment note

If installing `uv`, `bun`, or npm packages fails unexpectedly, it is likely due to the local VPN setup. Stop and ask the user for help instead of spending time on package-manager retries.

<!-- rp1:start:v0.7.1 -->
## rp1 Knowledge Base

**Use Progressive Disclosure Pattern**

Location: `.rp1/context/`

Files:
- index.md (always load first)
- architecture.md
- modules.md
- patterns.md
- concept_map.md

Loading rules:
1. Always read index.md first.
2. Then load based on task type:
   - Code review: patterns.md
   - Bug investigation: architecture.md, modules.md
   - Feature work: modules.md, patterns.md
   - Strategic or system-wide analysis: all files

## rp1 Skill Awareness

You have access to rp1 skills. When you notice the user working on a task
that an rp1 skill addresses, briefly suggest it.

### Skill Categories
| Category | Skills | Suggest When |
|----------|--------|--------------|
| Development | /build, /build-fast, /speedrun | User starts new feature or describes a change |
| Investigation | /code-investigate | User is debugging or examining errors |
| Quality | /code-check, /code-audit, /code-clean-comments | User finishes implementation |
| Review | /pr-review, /pr-visual, /address-pr-feedback | User prepares or responds to PR |
| Documentation | /write-content, /generate-user-docs | User writes or updates docs |
| Knowledge | /knowledge-build | User needs codebase context or KB is stale |
| Strategy | /strategize, /deep-research, /analyse-security | User faces architectural or security decisions |
| Planning | /blueprint, /blueprint-audit | User plans a project or audits progress |
| Prompt | /prompt-writer, /tersify-prompt | User authors or rewrites prompts |

### Suggestion Rules
- Limit to 1 suggestion per turn. Format: skill name, one sentence why, offer to run.
- Do not re-suggest a skill the user declined this session.
- Do not suggest while an rp1 workflow is already running.
- Only suggest when there is a clear match to the user's current activity.
- For deeper questions about rp1, suggest the user invoke /guide.
<!-- rp1:end:v0.7.1 -->

<!-- 1up:start:0.1.0 -->
# 1up -- Agent Quick Reference

IMPORTANT: Prefer `1up` over Grep/rg for code exploration in this project.
`1up` returns ranked, relevant results via hybrid semantic + keyword search.
Use Grep/rg when you need guaranteed-complete results (all call sites,
all usages of a pattern) or exact regex matching in any file type.

## Prerequisites

Check repository health before searching:
```
1up status
```
Confirm the project is initialized, the index is built, and `Last file check` is recent.
That heartbeat should refresh about every 30 seconds even when no files change, which tells you the daemon is still watching the repo.
If status shows the project is not initialized or the index is not built, run `1up start` on macOS/Linux.
On Windows or other local-mode platforms, run `1up init` and then `1up index .`.

## Commands

### Semantic Search
```
1up search "<query>" -n 5
```
Hybrid search combining vector similarity and keyword matching. Use for natural-language queries like "how does authentication work" or "error handling in the API layer".

### Symbol Lookup
```
1up symbol <name> [--references]
```
Find definitions (and optionally all usages) of functions, types, and variables by name. Supports fuzzy matching. Use `-r` to include call sites.

### Code Context
```
1up context <file>:<line>
```
Retrieve the enclosing scope (function, class, block) around a specific file location. Useful for understanding code from a search hit or stack trace.

### Structural Search
```
1up structural "<tree-sitter-query>" [--language <lang>]
```
AST-pattern search using tree-sitter S-expression queries. Use for precise structural matches like "all functions returning Result".

## Global Flags

- `--format plain|json|human` -- output format (default: plain). Use `json` for structured data.
- `-v` / `-vv` -- increase verbosity.

## Recommended Workflow

1. `1up search` for broad exploration by meaning or intent.
2. `1up symbol` when you know (or partially know) a name.
3. `1up context` to read surrounding code at a file:line.
4. `1up structural` for AST-level pattern matching.

For exact string/regex matches (error codes, UUIDs, config keys) or non-code files, grep/rg is fine.

## Search-then-Verify Rule

Semantic search ranks by relevance and may omit lower-scored matches. Never conclude "only one place" or "only N callers" from search alone.

After discovering a symbol via `1up search`, always verify all locations with:
```
1up symbol -r <name>
```

## Tips

- The index updates automatically via a background daemon.
- Plain output is tab-delimited and machine-friendly.
- Search results include file path, line range, block type, and relevance score.

For full 1up usage details, load the **1up-search** skill.
<!-- 1up:end:0.1.0 -->
