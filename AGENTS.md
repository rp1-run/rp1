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

#### Environment schema declarations

Declare environment-resolved parameters in the `environment` schema. The three directory variables are:

- `RP1_PROJECT_ROOT` -- repository root (for code access)
- `RP1_KB_ROOT` -- knowledge base directory (for reading KB files)
- `RP1_WORK_ROOT` -- work artifact directory (for reading/writing work artifacts)

**Skills** (`metadata.environment`):

```yaml
metadata:
  environment:
    - name: RP1_KB_ROOT
      source: "rp1 agent-tools resolve-args --name RP1_KB_ROOT"
      description: "Knowledge base directory"
    - name: RP1_WORK_ROOT
      source: "rp1 agent-tools resolve-args --name RP1_WORK_ROOT"
      description: "Work artifact directory"
```

**Agents** (top-level `environment`):

```yaml
environment:
  - name: RP1_KB_ROOT
    source: "rp1 agent-tools resolve-args --name RP1_KB_ROOT"
    description: "Knowledge base directory"
  - name: RP1_WORK_ROOT
    source: "rp1 agent-tools resolve-args --name RP1_WORK_ROOT"
    description: "Work artifact directory"
```

#### Inline resolution (deprecated for parameterized skills)

The inline pattern below is **deprecated** for skills that have `metadata.arguments` defined. The build template auto-injects `resolve-args --name` instead, which handles both arguments and environment variables in one call.

```markdown
$RP1_KB_ROOT = !`rp1 agent-tools resolve-args --name RP1_KB_ROOT`
```

This inline pattern remains valid only for agents and for non-parameterized skills (those with no `metadata.arguments`).

#### Path interpolation

When interpolating paths:

```markdown
{{$RP1_WORK_ROOT}}/features/{FEATURE_ID}/
{{$RP1_KB_ROOT}}/index.md
```

Do not use `${}` shell parameter expansion in Bash snippets intended for Claude Code.

### Artifact Path Contract

When emitting `artifact_registered` events via `rp1 agent-tools emit`, artifact paths must follow these rules:

- **Work artifacts** (`storageRoot: "work_dir"`): Paths must be relative to `RP1_WORK_ROOT` without any prefix. Example: `features/my-feature/design.md` (not `work/features/...`).
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

## Delivery checklist

After changes:

- Verify namespace prefixes are correct.
- Keep agent prompts concise and non-redundant.
- Ensure cross-plugin calls handle missing dependencies.
- Update relevant docs in `docs/` when behavior changes.
- Run `just` to inspect available test, lint, and format commands when code changes require validation.

## Environment note

If installing `uv`, `bun`, or npm packages fails unexpectedly, it is likely due to the local VPN setup. Stop and ask the user for help instead of spending time on package-manager retries.

<!-- rp1:start -->
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
<!-- rp1:end -->
