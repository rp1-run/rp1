# SKILL.md Format (rp1)

rp1 uses the [Agent Skills open standard](https://agentskills.io) for all 31 invocable prompts. Each skill is a SKILL.md file that works natively on Claude Code and generates platform-specific artifacts for OpenCode via the build pipeline.

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
  argument-hint: "[development-request...] [--afk] [--review] [--git-commit]"
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
| `metadata.argument-hint` | nested | No | Usage hint string for argument notation |
| `metadata.sub_agents` | nested | No | List of agent references this skill delegates to |

*Required for the build pipeline to produce valid manifests.

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

| Notation | Meaning | Example |
|----------|---------|---------|
| `<param>` | Required parameter | `<feature-id>` |
| `[param]` | Optional parameter | `[context]` |
| `[param...]` | Variadic optional | `[files...]` |
| `[--flag]` | Optional flag | `[--afk]` |

---

## Standard `## Parameters` Section

The `## Parameters` section provides model-driven parameter parsing. Instead of a CLI round-trip, the model extracts parameters directly from the user's natural language input.

### Template

```markdown
## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | Yes | - | The freeform development request text |
| `AFK` | No | `false` | Non-interactive mode. Set `true` if user says "afk", "no prompts", or "unattended" |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)
```

### Rules

1. **Parameter table**: Each parameter has a name, required flag, default value, and description with natural language extraction hints.
2. **Environment values**: Use `` !`command` `` shell execution syntax for values from the environment. Confirmed cross-platform (Claude Code, OpenCode, Codex).
3. **No `$ARGUMENTS`**: Do not use platform-specific `$ARGUMENTS` substitution.
4. **No `$1`, `$2` positional params**: The model infers parameters from context.
5. **Flag detection via natural language**: Boolean flags extracted by matching user phrases (e.g., "afk" -> `AFK=true`).

### Skills Without Parameters

Omit the `## Parameters` section entirely. Environment values can appear inline:

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
  argument-hint: "[mode]"
---
```

### What Changed

| Change | Detail |
|--------|--------|
| **Directory** | `commands/knowledge-load.md` -> `skills/knowledge-load/SKILL.md` |
| **Frontmatter** | `version`, `tags`, `created`, `updated`, `author`, `argument-hint` moved into `metadata` map |
| **allowed-tools** | Comma-separated string format |
| **PARSE ARGUMENTS** | Entire section removed; replaced by `## Parameters` |
| **`$1` reference** | Replaced with `{LOAD_MODE}` named parameter |
| **Prompt body** | Unchanged (all workflow logic preserved) |

---

## Migration Checklist

Use this checklist when creating a new skill:

- [ ] Create directory: `plugins/{plugin}/skills/{skill-name}/`
- [ ] Create `SKILL.md` with frontmatter (standard fields at top, rp1 fields in `metadata`)
- [ ] Add `## Parameters` section with parameter table and extraction hints
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

The tag produces the correct spawn instructions for each platform, including the full spawn/wait protocol on Codex.

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
