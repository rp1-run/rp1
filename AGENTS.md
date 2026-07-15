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
- Do not invoke other skills for KB context; read KB files directly using the resolved `{KB_ROOT}` path (index.md first, then task-relevant files).
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
- If a dev workflow depends on an `rp1-base` skill (such as `rp1-base:artifact-templates`) and it is unavailable, tell the user to install `rp1-base`.

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

Project directories are resolved at runtime based on the active storage mode. The `RP1_PROJECT_ROOT`, `RP1_KB_ROOT`, and `RP1_WORK_ROOT` environment variables have been removed. Skills and agents should not declare them in `environment` schemas.

To discover project directories, use `rp1 agent-tools rp1-root-dir` which returns:

- `projectRoot` -- the project root (directory containing `.rp1/project_id`)
- `kbRoot` -- the knowledge base directory (respects active storage mode; defaults to `<projectRoot>/.rp1/context`)
- `workRoot` -- the work artifacts directory (respects active storage mode; defaults to `<projectRoot>/.rp1/work`)

When referencing KB or work directories in agent and skill prompts, use the resolved variables `{kbRoot}` and `{workRoot}` (in skills) or `{KB_ROOT}` and `{WORK_ROOT}` (in agent arguments). Do not hardcode literal `.rp1/context` or `.rp1/work` paths -- these may not resolve correctly when a non-default storage mode is active.

#### Path interpolation

When referencing KB or work paths in prompts, use the resolved directory variables, not literal paths:

```markdown
{kbRoot}/index.md
{workRoot}/features/{FEATURE_ID}/
```

Skills use `{kbRoot}` and `{workRoot}` from `resolve-args` output. Agents use `{KB_ROOT}` and `{WORK_ROOT}` from their declared arguments. Do not use `${}` shell parameter expansion in Bash snippets intended for Claude Code.

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

## Artifact templates

Agents that produce structured markdown artifacts (requirements, design docs, task lists, reports, KB files) must read the canonical template from the `rp1-base:artifact-templates` skill rather than embedding output formats inline. All 20 producer agents use this pattern.

**Two-hop discovery flow** (two Read calls):

1. Read `plugins/base/skills/artifact-templates/SKILL.md` -- scan the Template Index table for the matching producer and artifact name.
2. Read the template file at the path listed in the index -- it contains YAML frontmatter with routing metadata (`scope`, `path_pattern`, `emit_hint`) and the markdown body with placeholder patterns.

The agent fills placeholders (`{FEATURE_ID}`, `{Date}`, `[Feature Title]`, etc.) and writes the artifact to the location specified by `scope` + `path_pattern`. If the template includes an `emit_hint` and the agent has no existing emit logic, use it to register the artifact via `rp1 agent-tools emit`.

### Instruction variants

Choose the variant that matches the agent's output type:

**Variant A -- Single-document producer** (14 agents): Insert a "Template Loading" section before the output section. Remove inline template blocks. Retain content guidance (how to fill placeholders, conditional sections, business rules).

**Variant B -- Multi-document producer** (2 agents: feature-architect, feature-tasker): Same as Variant A but the instruction lists multiple template lookups, one per artifact. Each artifact gets its own template read instruction.

**Variant C -- Section-type producer** (3 agents: feature-editor, task-builder, task-reviewer): The instruction specifies the section template path from `templates/_sections/` and explicitly states append semantics -- append to existing file, not create standalone document. The template `type: section` frontmatter reinforces this.

**Variant D -- Format reference** (1 agent: hypothesis-tester): The agent reads and updates existing documents, not creates them. The instruction reads the template for format verification while preserving the agent's append-findings workflow.

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

If `uv`, `bun`, or npm package installs fail unexpectedly for network-related reasons, there may be environment-specific handling that applies. Consult your memory / local environment notes for the relevant steps before retrying repeatedly or escalating to the user.

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
| Development | /task, /bootstrap, /build, /build-fast, /feature-archive, /feature-edit, /feature-unarchive, /phase-plan, /speedrun | User starts a new feature, describes a change, or needs to scaffold a project |
| Investigation | /code-investigate, /validate-hypothesis | User is debugging, examining errors, or testing a design hypothesis |
| Quality | /code-comments, /code-audit, /code-check, /code-clean-comments | User finishes implementation and needs hygiene checks, audits, or comment cleanup |
| Review | /address-pr-feedback, /arcade-collab, /pr-review, /pr-visual, /pr-walkthrough | User prepares a PR, receives review feedback, or needs visual diff understanding |
| Documentation | /fix-mermaid, /generate-user-docs, /markdown-preview, /mermaid, /project-birds-eye-view, /write-content | User writes, updates, or previews docs, diagrams, or project overviews |
| Knowledge | /guide, /knowledge-build, /self-update | User needs codebase context, KB is stale, or wants KB templates |
| Strategy | /analyse-security, /deep-research, /socratic-duel, /socratic-duel-run, /strategize | User faces architectural decisions, security concerns, or needs deep research |
| Planning | /blueprint, /blueprint-archive, /blueprint-audit | User plans a project, audits a PRD, or manages blueprint lifecycle |
| Prompt | /prompt-writer | User authors, rewrites, or evaluates agent prompts |

### Suggestion Rules
- Limit to 1 suggestion per turn. Format: skill name, one sentence why, offer to run.
- Do not re-suggest a skill the user declined this session.
- Do not suggest while an rp1 workflow is already running.
- Only suggest when there is a clear match to the user's current activity.
- For deeper questions about rp1, suggest the user invoke /guide.
<!-- rp1:end:v0.7.1 -->

<!-- 1up:start:0.1.7 -->
# 1up — Agent Quick Reference

## Tool Selection

Pick by what you know, not by habit:

| You know... | Use | Reason |
|---|---|---|
| Concept, not files/keywords | `1up search` | Semantic search needs no vocabulary |
| Symbol/keyword name | `1up symbol -r` or `grep` | Literal match = precise, low noise |
| Keyword, need ALL instances | `grep` | Guaranteed-complete, best signal:noise |
| Nothing (new codebase) | `1up search` | Works w/o prior knowledge |

**Sub-agents**: Include this section in sub-agent prompts.

## Setup

`1up status` before searching. Confirm index built + `Last file check` recent (~30s refresh). If not initialized: `1up start` (macOS/Linux) or `1up init && 1up index .`.

## Commands

```
1up search "<query>" -n 5          # semantic + keyword hybrid
1up symbol <name> [-r]             # def lookup; -r = all references
1up context <file>:<line>          # enclosing scope at location
1up impact --from-symbol <name>    # blast radius from symbol
1up impact --from-file <path>      # blast radius from file
1up impact --from-segment <id>     # blast radius from segment
1up structural "<ts-query>"        # tree-sitter AST pattern search
```

Flags: `--format plain|json|human` (default: plain), `-v`/`-vv`.

## Workflow

1. `search` — explore by meaning/intent
2. `symbol` — known or partial name lookup
3. `context` — read scope at file:line
4. `impact` — dependency/blast-radius analysis
5. `structural` — AST-level pattern matching

## Search-then-Verify

Semantic search ranks by relevance; may omit matches. Never conclude "only N callers" from search alone. Verify completeness w/ `1up symbol -r <name>` or `grep`.
<!-- 1up:end:0.1.7 -->
