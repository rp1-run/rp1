# Codex Platform Guide

Codex is a first-class rp1 platform alongside Claude Code, OpenCode, GitHub
Copilot CLI, and Antigravity CLI. Skills are invoked with `$skill-name` syntax
(e.g., `$rp1-dev-build`), and project-level instructions are delivered via
`AGENTS.md` (the Codex equivalent of `CLAUDE.md` for Claude Code).

## Invocation

Codex skills are invoked with `$skill-name` syntax, not the `/command` syntax used by Claude Code and OpenCode:

| Platform | Invocation |
|----------|-----------|
| Claude Code | `/build` |
| OpenCode | `/rp1-dev-build` |
| Codex | `$rp1-dev-build` |

## Instruction File

Codex uses `AGENTS.md` as its project-level instruction file. Running `rp1 init` for Codex generates or appends to `AGENTS.md` in the project root with KB loading instructions and rp1 conventions. This is equivalent to the `CLAUDE.md` file used by Claude Code.

## Installation

Running `rp1 install codex` copies skill directories to `~/.codex/skills/`, per-agent TOML files to `~/.codex/agents/rp1/`, and merges the slim config entries into `~/.codex/config.toml`. The managed section now also installs a Codex `notify` command that routes startup notices through `rp1 agent-tools codex-notify`. Uninstallation removes only rp1-managed artifacts (skill directories prefixed with `rp1-*`, the `~/.codex/agents/rp1/` directory, and the fenced Codex config section) while preserving user-created and third-party Codex configuration.

Use the same workflow name on Codex with the `$rp1-dev-build` form.

## Build Output and Artifact Layout (Advanced)

This section is for maintainers debugging Codex installation or generated
prompt artifacts. Normal Codex users only need the `$rp1-dev-build` invocation
above.

### Codex Build Artifact Layout

Each skill produces the following artifacts under `dist/codex/`:

| Artifact | Path | Purpose |
|----------|------|---------|
| Skill instructions | `skills/<namespace>:<skill>/SKILL.md` | Skill prompt loaded by Codex on `$skill-name` invocation |
| Agent manifest | `skills/<namespace>:<skill>/agents/openai.yaml` | Declares sub-agents with `allow_implicit_invocation: false` |
| Agent TOML files | `agents/rp1/<agent-name>.toml` | Per-agent config with `developer_instructions` |
| Config entries | `config.toml` (fenced section) | Slim `[agents.*]` registry entries for `~/.codex/config.toml` |

### Install Paths

All Codex artifacts install to user-level paths under `~/.codex/`:

| Artifact | Install Path |
|----------|-------------|
| Skills | `~/.codex/skills/<namespace>:<skill-name>/SKILL.md` |
| Agent TOML files | `~/.codex/agents/rp1/<agent-name>.toml` |
| Agent registry | `~/.codex/config.toml` (fenced section merged) |

### Parameter Handling

This maintainer detail keeps the exact Codex build-filter name because it is
useful when auditing generated Codex prompt output.

Codex does not have native argument substitution (`$1`, `$ARGUMENTS`). During the build, the `param_transform` filter rewrites parameter references into instructional text that Codex can model-extract from the user's prompt:

| Source | Codex Output |
|--------|-------------|
| `$1` | Descriptive text: "the value of the first argument (extracted from the user's prompt)" |
| `$ARGUMENTS` | Descriptive text: "the arguments provided by the user in their prompt" |

Parameter tables in skills are preserved as-is since they serve as instructional text for the model. The model extracts parameter values from the user's natural language prompt rather than relying on positional substitution.

### Main Config Entries

This maintainer detail keeps generated agent names because they appear in the
Codex config files installed under `~/.codex/`.

Slim `[agents.*]` sections are generated for inclusion in `~/.codex/config.toml`. Each entry contains only two fields:

```toml
[agents.task-builder]
description = "Implements tasks from feature task lists"
config_file = "./agents/rp1/task-builder.toml"
```

### Per-Agent TOML Files

Individual agent configuration files are generated at `~/.codex/agents/rp1/{name}.toml`. Each file contains the agent's model and full instructions using multiline syntax:

```toml
model = "o4-mini"
developer_instructions = """
Agent instructions here...
"""
```

### Content Transformations

This contributor detail keeps source tag and context names so prompt authors
can audit host-specific prompt build behavior.

During the Codex build, agent and skill content undergoes four transformations in order:

| Step | Input | Output | Example |
|------|-------|--------|---------|
| Namespace transform | `/rp1-dev:build` | `$rp1-dev-build` | Explicit plugin-qualified references |
| Plain slash-command transform | `/build` | `$rp1-dev-build` | Auto-discovered from `plugins/*/skills/*/` |
| Parameter transform | `$1`, `$ARGUMENTS` | Instructional text | Model-extracted parameters |
| Sub-agent ref translation | `rp1-dev:task-builder` | Codex role name | Agent name mapping |

The plain slash-command transformation auto-discovers all skill names from plugin directories. Adding a new skill is automatically picked up on the next build without any configuration.

Semantic `{% dispatch_agent %}` blocks render to Codex `Spawn agent:` instructions with explicit `fork_context: false` by default. Use `context: "inherit"` in the source tag only when a child agent truly needs parent conversation history.

## See Also

- [build](../dev/build.md) - The `/build` feature workflow
- [install](../cli/install.md) - Installing rp1 for Codex and other hosts
