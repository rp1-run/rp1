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

Use explicit positional arguments compatible with both Claude Code and OpenCode:

- `$1`, `$2`, `$3` for structured parameters
- `$ARGUMENTS` for freeform text

All commands with parameters must include this section:

```markdown
## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| FEATURE_ID | $1 | (required) | Feature identifier |
| CONTEXT | $2 | `""` | Optional context |
| RP1_ROOT | Environment | `.rp1/` | Root directory |
```

Use `argument-hint` in frontmatter with standard notation:

- `<param>` required
- `[param]` optional
- `[param...]` variadic optional
- `[--flag]` optional flag

### Canonical variable assignment

Resolve `RP1_ROOT` with:

```markdown
$RP1_ROOT = !`rp1 agent-tools rp1-root-dir`
```

When interpolating paths:

```markdown
{{$RP1_ROOT}}/work/features/{FEATURE_ID}/
```

Do not use `${}` shell parameter expansion in Bash snippets intended for Claude Code.

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
- Follow graph transitions exactly; invalid transitions are rejected.

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

Use the KB instead of duplicating project reference material in this file.

Location: `.rp1/context/`

Loading rules:

1. Always read `index.md` first.
2. Then load only the files needed for the task:
   - Code review: `patterns.md`
   - Bug investigation: `architecture.md`, `modules.md`
   - Feature work: `modules.md`, `patterns.md`
   - Strategic or system-wide analysis: all files
<!-- rp1:end -->
