# SKILL.md Canonical Format Specification

The SKILL.md format is the single source of truth for all rp1 invocable prompts. Every rp1 command (31 total across base, dev, and utils plugins) is defined as a SKILL.md file that works natively on Claude Code and generates platform-specific artifacts for OpenCode via the build pipeline.

---

## Directory Layout

Each skill lives in its own directory under the plugin's `skills/` folder:

```
plugins/{plugin}/skills/{skill-name}/
  SKILL.md          # Required: frontmatter + prompt content
  EXAMPLES.md       # Optional: extracted examples (error patterns, usage samples)
  REFERENCE.md      # Optional: reference material (syntax guides, API docs)
  {other}.md        # Optional: additional supporting files (WORKFLOWS.md, etc.)
```

**Rules**:

- Directory name uses kebab-case matching the skill `name` field.
- `SKILL.md` is the only required file.
- Supporting files are created only when the source command contains significant embedded examples or reference material worth extracting (avoid empty boilerplate).
- Claude Code reads the directory directly. OpenCode receives generated artifacts from the build pipeline.

---

## Frontmatter Schema

SKILL.md frontmatter uses the Agent Skills open standard whitelist at the top level. All rp1-specific fields go in the `metadata` map.

```yaml
---
name: build-fast
description: "Quick-iteration development for small/medium scope changes with persistent artifacts and optional review."
allowed-tools: Bash(echo *), Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
metadata:
  version: 3.0.0
  tags:
    - core
    - code
    - feature
  created: 2026-01-01
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "[development-request...] [--afk] [--review] [--git-worktree]"
---
```

### Field Reference

| Field | Level | Required | Standard | Notes |
|-------|-------|----------|----------|-------|
| `name` | top | Yes | Agent Skills v1.0 | Skill identifier, kebab-case |
| `description` | top | Yes | Agent Skills v1.0 | Min 20 chars; ~500 char guideline for context budget |
| `allowed-tools` | top | No | Agent Skills v1.0 | Comma-separated string (Claude Code format) |
| `metadata` | top | No | Agent Skills v1.0 | Map for rp1-specific fields |
| `metadata.version` | nested | Yes* | rp1-specific | Semantic version (e.g., `2.1.0`) |
| `metadata.tags` | nested | No | rp1-specific | Category tags as YAML list |
| `metadata.created` | nested | Yes* | rp1-specific | Creation date (YYYY-MM-DD) |
| `metadata.updated` | nested | No | rp1-specific | Last update date (YYYY-MM-DD) |
| `metadata.author` | nested | Yes* | rp1-specific | Author identifier (e.g., `cloud-on-prem/rp1`) |
| `metadata.argument-hint` | nested | No | rp1-specific | Usage hint string for argument notation |

*Required for the build pipeline to produce valid manifests.

### Why `metadata` Map?

The Agent Skills standard whitelists only `name`, `description`, `license`, `allowed-tools`, and `metadata` at the top level. Platforms with strict frontmatter validation (Codex) reject unknown top-level fields. Moving rp1-specific fields into `metadata` ensures:

- Claude Code reads them (metadata is a passthrough map).
- OpenCode build pipeline extracts them for manifest generation.
- Codex (Phase 2) accepts the frontmatter without modification.

### Description Guidelines

The description field serves double duty: it is the skill's identity at startup (progressive disclosure) and its primary discovery mechanism. Keep descriptions concise but informative:

- State the core capability in the first sentence.
- Include key use cases or trigger terms.
- Target ~500 characters (soft guideline, not enforced).
- All 31 skill descriptions combined should stay within ~16K characters (2% of Claude Code's context budget).

### `allowed-tools` Format

In SKILL.md (Claude Code native format), `allowed-tools` is a comma-separated string:

```yaml
allowed-tools: Bash(echo *), Read, Write, Edit, Glob, Grep, Task
```

The build pipeline converts this to a YAML list for OpenCode output:

```yaml
allowed-tools:
  - Bash(echo *)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
```

### Argument-Hint Notation

The `metadata.argument-hint` field documents command usage for help text and documentation:

| Notation | Meaning | Example |
|----------|---------|---------|
| `<param>` | Required parameter | `<feature-id>` |
| `[param]` | Optional parameter | `[context]` |
| `[param...]` | Variadic optional | `[files...]` |
| `[--flag]` | Optional flag | `[--afk]` |

---

## Standard `## Parameters` Section

The `## Parameters` section replaces the legacy `PARSE ARGUMENTS` / `transform-args` approach. Instead of a CLI round-trip, the model extracts parameters directly from the user's natural language input.

### Template

```markdown
## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `DEVELOPMENT_REQUEST` | Yes | - | The freeform development request text |
| `AFK` | No | `false` | Non-interactive mode. Set `true` if user says "afk", "no prompts", or "unattended" |
| `REVIEW` | No | `false` | Enable post-build review. Set `true` if user says "review", "verify", or "check" |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`echo ${RP1_ROOT:-.rp1/}`
```

### Rules

1. **Parameter table**: Each parameter has a name, required flag, default value, and description with natural language extraction hints.
2. **Environment values**: Use `` !`command` `` shell execution syntax for values that come from the environment (e.g., `RP1_ROOT`). This syntax is confirmed cross-platform (Claude Code, OpenCode, Codex).
3. **No `$ARGUMENTS`**: Do not use platform-specific `$ARGUMENTS` substitution. The model reads the user's input directly.
4. **No `$1`, `$2` positional params**: The model infers parameters from context rather than relying on positional substitution.
5. **Flag detection via natural language**: Boolean flags are extracted by matching user phrases (e.g., "afk" -> `AFK=true`, "review my work" -> `REVIEW=true`).

### Commands Without Parameters

For skills that take no user-supplied parameters (e.g., self-update), omit the `## Parameters` section entirely. Environment values can appear inline where needed:

```markdown
$RP1_ROOT = !`echo ${RP1_ROOT:-.rp1/}`
```

---

## Differences from transform-args

The legacy approach used a CLI-side `rp1 agent-tools transform-args` tool to parse arguments. The new `## Parameters` approach replaces this entirely.

| Aspect | Legacy (transform-args) | New (## Parameters) |
|--------|------------------------|---------------------|
| **Parsing location** | CLI tool (shell round-trip) | Model intelligence (in-context) |
| **Platform support** | Claude Code only ($ARGUMENTS) | All platforms (model reads input) |
| **Parameter definition** | YAML schema in CLI source | Inline table in SKILL.md |
| **Environment values** | Shell variable expansion | `` !`command` `` syntax |
| **allowed-tools requirement** | `Bash(rp1 *)` needed | Not needed for parameter parsing |
| **Failure mode** | CLI parse errors, stdin issues | Model misinterpretation (correctable) |
| **Invocation pattern** | `rp1 agent-tools transform-args rp1-{plugin}:{name} -` with $ARGUMENTS on stdin | No invocation; model extracts from user input |

### What Changes Per Skill

For skills that previously used transform-args:

1. **Remove** the `## PARSE ARGUMENTS` section entirely.
2. **Remove** the `## ARGUMENTS` key-value table (if present as a separate section).
3. **Add** a `## Parameters` section with the parameter table and extraction hints.
4. **Remove** `Bash(rp1 *)` from `allowed-tools` if it was only used for transform-args. Retain it if the skill uses other `rp1 agent-tools` calls (e.g., `rp1 agent-tools worktree`, `rp1 agent-tools mmd-validate`, `rp1 agent-tools work`).
5. **Replace** `$1`, `$2` positional references in the prompt body with the named parameter from the table (e.g., `$1` -> `{LOAD_MODE}`).

For skills that did not use transform-args (no `PARSE ARGUMENTS` section):

1. **Restructure frontmatter** only: move rp1-specific fields into `metadata` map.
2. Prompt content remains unchanged.

---

## Reference Example: knowledge-load

This example shows the full conversion of the `knowledge-load` command from legacy command format to canonical SKILL.md format.

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

```markdown
## PARSE ARGUMENTS

Before executing this command's logic, run the Bash tool with:

rp1 agent-tools transform-args rp1-base:knowledge-load -

**Stdin**: The exact content from $ARGUMENTS (pass verbatim).
**Parse output**: Extract VARIABLE=value pairs.
```

### After (Canonical SKILL.md Format)

```
plugins/base/skills/knowledge-load/SKILL.md
```

```yaml
---
name: knowledge-load
description: "Ingests and prepares codebase documentation, builds internal knowledge graphs, and creates optimized context representations for downstream analysis tasks."
allowed-tools: Bash(echo *)
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

```markdown
# Knowledge Loader - Context Ingestion & Preparation

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `LOAD_MODE` | No | `progressive` | Loading mode. Set `full` if user says "full", "all", or "everything"; otherwise `progressive` |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`echo ${RP1_ROOT:-.rp1/}`

> **DEPRECATED**: This command is deprecated. All rp1 commands are now
> self-contained and load KB context automatically via their agents.

You are KnowLoadGPT, an expert knowledge processor...

(rest of prompt content unchanged)
```

### What Changed

| Change | Detail |
|--------|--------|
| **Directory** | `commands/knowledge-load.md` -> `skills/knowledge-load/SKILL.md` |
| **Frontmatter** | `version`, `tags`, `created`, `updated`, `author`, `argument-hint` moved into `metadata` map |
| **allowed-tools** | Comma-separated string; `Bash(rp1 *)` removed (was only for transform-args) |
| **PARSE ARGUMENTS** | Entire section removed |
| **## Parameters** | New section with parameter table and environment values |
| **`$1` reference** | Replaced with `{LOAD_MODE}` named parameter |
| **Prompt body** | Unchanged (all workflow logic, output format, etc. preserved) |

---

## Migration Checklist

Use this checklist when converting a command to SKILL.md format:

- [ ] Create directory: `plugins/{plugin}/skills/{command-name}/`
- [ ] Create `SKILL.md` with restructured frontmatter (standard fields at top, rp1 fields in `metadata`)
- [ ] If command uses transform-args: replace `PARSE ARGUMENTS` with `## Parameters` section
- [ ] If command uses transform-args: remove `Bash(rp1 *)` from `allowed-tools` (unless other rp1 CLI calls remain)
- [ ] Replace any `$1`, `$2` positional references with named parameters from the table
- [ ] Preserve all prompt logic, agent spawning, workflow sections unchanged
- [ ] Extract significant embedded examples to `EXAMPLES.md` only if warranted
- [ ] Verify skill is discoverable and invocable on Claude Code with same slash command name
- [ ] Verify OpenCode build pipeline generates correct artifact from skill source
- [ ] Remove old command file from `commands/` after verification

---

## Coexistence Rules

During the migration period, both formats coexist:

| Scenario | Behavior |
|----------|----------|
| Skill and command exist with same name | Skill wins (Claude Code documented behavior) |
| Only skill exists | Skill used directly |
| Only command exists (not yet migrated) | Command used; build pipeline reads from commands/ |
| Build pipeline output | Skills -> `skill/{name}/SKILL.md`; Commands -> `command/rp1-{plugin}/{name}.md` |

---

## Related Concepts

- [Skills](skills.md) - Skill patterns, invocation, and best practices
- [Command-Agent Pattern](command-agent-pattern.md) - How skills delegate to agents
- [Constitutional Prompting](constitutional-prompting.md) - How agent prompts are structured
