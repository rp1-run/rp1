# SKILL.md Format (rp1)

rp1 uses the [Agent Skills open standard](https://agentskills.io) for all 39 invocable prompts. Each skill is a SKILL.md file that works natively on Claude Code and generates platform-specific artifacts for OpenCode via the build pipeline.

For the full standard specification (directory layout, frontmatter fields, tool permissions, etc.), see [agentskills.io](https://agentskills.io).

This page documents **rp1-specific conventions** layered on top of the standard.

---

## Frontmatter Schema

rp1 skills place platform-specific fields in the `metadata` map to comply with the Agent Skills whitelist (`name`, `description`, `license`, `allowed-tools`, `metadata`).

```yaml
---
name: build-fast
description: "Quick-iteration development for small/medium scope changes with persistent artifacts and optional review."
allowed-tools: Bash(echo *), Bash(rp1 *), Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
metadata:
  version: 3.0.0
  tags:
    - core
    - code
    - feature
  created: 2026-01-01
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: DEVELOPMENT_REQUEST
      type: string
      required: false
      variadic: true
      description: "The freeform development request text"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
      aliases:
        - "afk"
        - "no prompts"
        - "unattended"
    - name: REVIEW
      type: boolean
      required: false
      default: false
      description: "Run review after build"
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: false
      description: "Commit changes after build"
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 project context and work artifacts"
---
```

### rp1 Metadata Fields

| Field | Level | Required | Notes |
|-------|-------|----------|-------|
| `metadata.version` | nested | Yes* | Semantic version (e.g., `2.1.0`) |
| `metadata.tags` | nested | No | Category tags as YAML list |
| `metadata.created` | nested | Yes* | Creation date (YYYY-MM-DD) |
| `metadata.updated` | nested | No | Last update date (YYYY-MM-DD) |
| `metadata.author` | nested | Yes* | Author identifier (e.g., `cloud-on-prem/rp1`) |
| `metadata.arguments` | nested | No | Structured argument definitions (see below) |
| `metadata.environment` | nested | No | Environment parameter definitions (see below) |
| `metadata.sub_agents` | nested | No | List of agent references this skill delegates to |

*Required for the build pipeline to produce valid manifests.

### `metadata.arguments`

The `arguments` field defines structured parameter schemas for skills. Each argument is an object with the following fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | UPPER_SNAKE_CASE identifier |
| `type` | string | Yes | `"string"`, `"boolean"`, or `"enum"` |
| `required` | boolean | Yes | Whether the argument must be supplied |
| `default` | string/boolean | No | Default value (booleans default to `false` if omitted) |
| `description` | string | Yes | Human-readable description |
| `aliases` | string[] | No | Natural-language trigger phrases (boolean args) |
| `implies` | string[] | No | Other boolean args set to `true` when this arg is `true` |
| `enum_values` | string[] | No | Valid values (required when `type: enum`) |
| `variadic` | boolean | No | Accept multiple values (string args only) |
| `source` | object | No | ENV var fallback, e.g., `{ env: "VAR_NAME" }` |

The build pipeline auto-derives the `argument-hint` string from structured arguments (see Argument-Hint Notation below). Manual `argument-hint` strings are no longer needed and will trigger a build error if present alongside `arguments`.

### `metadata.environment`

The `environment` field declares parameters resolved from the shell environment, not from user input. These are kept separate from `arguments` and do not appear in argument hints.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Parameter name (e.g., `RP1_ROOT`) |
| `source` | string | Yes | Resolution command or description |
| `description` | string | Yes | Human-readable description |

```yaml
metadata:
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 project context and work artifacts"
```

Environment parameters are resolved at invocation time via `rp1 agent-tools resolve-args` and returned as a separate `environment` section in the resolved output.

### `metadata.sub_agents`

Skills that delegate work to agents via the Task tool should declare their sub-agent inventory in the `metadata.sub_agents` field. Each entry uses the `rp1-{plugin}:{agent-name}` format, matching the agent's `.md` file in the corresponding plugin's `agents/` directory.

```yaml
metadata:
  version: 3.0.0
  tags:
    - core
  sub_agents:
    - "rp1-dev:task-builder"
    - "rp1-dev:task-reviewer"
    - "rp1-dev:code-checker"
```

**Build-time validation**: The Codex build pipeline validates declared sub-agents against actual agent files. A missing agent `.md` file causes a build error. Undeclared content references and dead declarations produce warnings.

**Format**: `rp1-{plugin}:{agent-name}` where `{plugin}` is `base`, `dev`, or `utils`, and `{agent-name}` matches the filename (without `.md`) in `plugins/{plugin}/agents/`.

**Cross-platform**: The `sub_agents` field is ignored by Claude Code and OpenCode (unknown metadata fields are safely skipped). It is used by the Codex build pipeline for agent name translation and validation.

### `allowed-tools` Defaults

rp1 skills that resolve environment variables or call rp1 CLI tools should include both `Bash(echo *)` and `Bash(rp1 *)`:

- `Bash(echo *)` -- Shell echo commands
- `Bash(rp1 *)` -- rp1 CLI invocations including RP1_ROOT resolution (`rp1 agent-tools rp1-root-dir`, `rp1 agent-tools emit`, `rp1 agent-tools mmd-validate`, etc.)

**Important**: Do NOT use `echo ${VAR:-default}` syntax in skills. Claude Code blocks `${}` parameter substitution in Bash commands. Use `rp1 agent-tools rp1-root-dir` instead.

### Argument-Hint Notation

When `metadata.arguments` is defined, the build pipeline auto-derives the `argument-hint` string. You do not need to write it manually. The derivation rules are:

| Condition | Rendered As | Example |
|-----------|-------------|---------|
| `required: true`, `type: string` | `<name>` | `<feature-id>` |
| `required: false`, `type: string` | `[name]` | `[context]` |
| `required: false`, `type: boolean` | `[--name]` | `[--afk]` |
| `variadic: true` | `[name...]` | `[files...]` |
| `type: enum` | `<name>` or `[name]` | `<platform>` |

Names are transformed from UPPER_SNAKE_CASE to lower-kebab-case (e.g., `FEATURE_ID` becomes `feature-id`).

If a skill defines `metadata.arguments`, the build pipeline will reject any manually specified `argument-hint` (L007 build error). Skills without structured arguments that still use a manual `argument-hint` will also trigger a build error (L009), as all skills must use the structured format.

---

## Argument Resolution

Arguments are resolved programmatically at invocation time via the `rp1 agent-tools resolve-args` CLI subcommand. Skills and agents no longer use hand-written `## Parameters` tables or text-based parsing instructions in their bodies.

### How It Works

1. The skill/agent defines its parameters in frontmatter using `metadata.arguments` and `metadata.environment`.
2. At invocation time, the agent calls `rp1 agent-tools resolve-args` with the raw user input.
3. The CLI merges values from five layers (highest precedence first): explicit user input, project settings (`.rp1/settings.toml`), user settings (`~/.config/rp1/settings.toml`), ENV var fallback (`source.env`), and schema `default`.
4. The CLI resolves implies chains (e.g., `GIT_PR=true` implies `GIT_PUSH=true` implies `GIT_COMMIT=true`).
5. The resolved arguments are returned as structured JSON for the agent to consume directly.

### Rules

1. **No `## Parameters` tables**: Do not add hand-written parameter tables to skill bodies. The build pipeline will reject them (L008 build error) when `arguments` is defined.
2. **No `$ARGUMENTS`**: Do not use platform-specific `$ARGUMENTS` substitution.
3. **No `$1`, `$2` positional params**: Parameters are defined in frontmatter and resolved via CLI.
4. **Boolean defaults**: Boolean arguments default to `false` unless an explicit `default` is provided. The CLI enforces this, preventing model inference errors.
5. **Implies chains**: Use the `implies` field to declare boolean flag dependencies. The CLI resolves these transitively.

### Skills Without Parameters

Skills that accept no parameters omit the `arguments` field entirely. Environment values can still be declared in the `environment` field or resolved inline:

```markdown
$RP1_ROOT = !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)
```

---

## Reference Example: knowledge-load

### Before (Legacy Command Format)

```
plugins/base/commands/knowledge-load.md
```

```yaml
---
name: knowledge-load
version: 2.1.0
description: Ingests and prepares codebase documentation...
allowed-tools:
  - Bash(echo *)
  - Bash(rp1 *)
argument-hint: "[mode]"
tags:
  - core
  - documentation
  - deprecated
created: 2025-10-25
updated: 2025-12-06
author: cloud-on-prem/rp1
---
```

### After (Canonical SKILL.md Format)

```
plugins/base/skills/knowledge-load/SKILL.md
```

```yaml
---
name: knowledge-load
description: "Ingests and prepares codebase documentation, builds internal knowledge graphs, and creates optimized context representations for downstream analysis tasks."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 2.1.0
  tags:
    - core
    - documentation
    - deprecated
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: LOAD_MODE
      type: enum
      required: false
      default: full
      description: "Knowledge loading mode"
      enum_values:
        - full
        - incremental
        - refresh
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 project context"
---
```

### What Changed

| Change | Detail |
|--------|--------|
| **Directory** | `commands/knowledge-load.md` -> `skills/knowledge-load/SKILL.md` |
| **Frontmatter** | `version`, `tags`, `created`, `updated`, `author` moved into `metadata` map |
| **allowed-tools** | Comma-separated string format |
| **argument-hint** | Replaced by `metadata.arguments` (hint auto-derived by build pipeline) |
| **PARSE ARGUMENTS** | Entire section removed; arguments resolved via `rp1 agent-tools resolve-args` |
| **`$1` reference** | Replaced with structured `LOAD_MODE` argument definition |
| **Environment** | `RP1_ROOT` declared in `metadata.environment` |
| **Prompt body** | Unchanged (all workflow logic preserved) |

---

## Migration Checklist

Use this checklist when creating a new skill:

- [ ] Create directory: `plugins/{plugin}/skills/{skill-name}/`
- [ ] Create `SKILL.md` with frontmatter (standard fields at top, rp1 fields in `metadata`)
- [ ] Define parameters in `metadata.arguments` with structured schema (name, type, required, default, description)
- [ ] Define environment parameters in `metadata.environment` where applicable (e.g., `RP1_ROOT`)
- [ ] Do NOT add a hand-written `## Parameters` table or manual `argument-hint`
- [ ] Include `Bash(echo *)` and `Bash(rp1 *)` in `allowed-tools` if the skill uses environment resolution or rp1 CLI tools
- [ ] Preserve all prompt logic, agent spawning, workflow sections
- [ ] Extract significant embedded examples to `EXAMPLES.md` only if warranted
- [ ] Verify skill is discoverable and invocable on Claude Code
- [ ] Verify OpenCode build pipeline generates correct artifact from skill source

---

## Platform Tags

Skills that reference platform-varying behavior (agent dispatch, user input, planning, web access, file editing, permissions) should use semantic Liquid tags instead of raw `{% if platform %}` conditionals or CC-native tool names.

### Example: Agent Dispatch

Instead of writing CC-native syntax:

```markdown
Use the Task tool to invoke the code-writer agent:

subagent_type: rp1-dev:code-writer
```

Use the `dispatch_agent` tag:

```markdown
{% dispatch_agent "rp1-dev:code-writer", "Write the implementation" %}
```

The tag produces the correct spawn instructions for each platform, including explicit `fork_context: false` and the full wait protocol on Codex by default. Use `context: "inherit"` only when the child needs parent conversation history.

### Example: User Input

```markdown
{% ask_user "Which approach do you prefer?", options: "Approach A", "Approach B" %}
```

### Example: File Editing

```markdown
{% edit_model "update the configuration file" %}
```

For the full tag reference, see [Platform Tags Reference](../reference/platform-tags.md). For the conceptual guide, see [Platform Tags](platform-tags.md).

---

## Related Concepts

- [Agent Skills Standard](https://agentskills.io) - The open standard for agent skills
- [Skill-Agent Pattern](command-agent-pattern.md) - How skills delegate to agents
- [Constitutional Prompting](constitutional-prompting.md) - How agent prompts are structured
- [Platform Tags](platform-tags.md) - Semantic tags for platform-varying behavior
