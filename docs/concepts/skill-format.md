# Skill Format Reference

All invocable prompts in rp1 use the canonical `SKILL.md` format: a YAML frontmatter block followed by the prompt body in Markdown.

## Frontmatter Structure

```yaml
---
name: skill-name
description: "One-line description of what the skill does."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: development
  is_workflow: false
  version: 1.0.0
  tags:
    - core
    - feature
  created: 2025-12-30
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
  sub_agents:
    - "rp1-dev:some-agent"
---
```

## Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill identifier in kebab-case. Must match the skill directory name. |
| `description` | string | Yes | One-line description of the skill's purpose. Used in `rp1 list` output and catalog generation. |
| `allowed-tools` | string | No | Comma-separated list of tool permissions. Required for skills that execute shell commands. Default: none. |
| `metadata` | object | No | Structured metadata block for build pipeline, catalog generation, and runtime discovery. |

## Metadata Fields

### `category`

Classifies the skill for catalog grouping and ambient awareness. Used by the build pipeline to generate the skill catalog and the ambient suggestion table in instruction files.

This field also feeds the canonical discovery registry, so `guide/CATALOG.md`,
generated init awareness, and runtime `rp1 list --json` enrichment all derive
their category facts from the same value.

- **Type**: enum
- **Required**: Yes (for all skills)
- **Allowed values**:

| Value | Description |
|-------|-------------|
| `development` | Feature delivery, scaffolding, build workflows, lifecycle management |
| `investigation` | Bug investigation, root cause analysis, hypothesis validation |
| `quality` | Code hygiene, linting, auditing, comment cleanup |
| `review` | PR review, feedback processing, visual diff analysis |
| `documentation` | Content writing, doc generation, mermaid diagrams, previews |
| `knowledge` | Knowledge base generation, loading, templates, system maintenance |
| `strategy` | Strategic analysis, deep research, security assessment |
| `planning` | Project blueprinting, PRD management, audit and archive |
| `prompt` | Prompt authoring, tersification, eval generation |

### `is_workflow`

Distinguishes workflow-orchestrating skills from single-purpose skills. Workflow skills coordinate multiple sub-agents or phases to deliver an end-to-end outcome. The ambient awareness block uses this to surface workflow suggestions appropriately.

This flag is part of the canonical discovery registry and flows through to
generated catalog views and runtime listing, so keep it aligned with the skill's
actual orchestration behavior.

- **Type**: boolean
- **Required**: Yes (for all skills)
- **Default**: `false`
- **Set to `true` for**: Skills that orchestrate multi-step workflows, spawn sub-agents in sequence, or manage lifecycle phases (e.g., `build`, `build-fast`, `speedrun`, `blueprint`, `generate-user-docs`, `knowledge-build`, `pr-review`).

### `workflow`

Nested tracked-workflow metadata. Use this block only when
`metadata.is_workflow: true`.

These fields drive build validation, template-injected
`workflow-bootstrap` guidance, runtime run selection, and the workflow facts
exposed by `rp1 list --json`.

- **Type**: object
- **Required**: Yes when `metadata.is_workflow: true`
- **Omit for**: Non-workflow skills

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_policy` | enum | Yes | Whether the workflow always starts fresh or may resume an existing run |
| `identity_args` | array of strings | `resumable`: Yes, `fresh`: No | Declared argument names that define work identity for resumable workflows |

Rules:

- `run_policy` must be `fresh` or `resumable`.
- `run_policy: fresh` always creates a new run. Omit `identity_args` or set it
  to `[]`.
- `run_policy: resumable` requires a non-empty `identity_args` list.
- Every `identity_args` entry must match a declared
  `metadata.arguments[*].name`.
- Tracked workflow prompts must use the generated bootstrap section instead of
  hand-authored `RUN_ID` generation or direct `emit resume-run` calls.

Example:

```yaml
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: resumable
    identity_args:
      - FEATURE_ID
```

### `arcade_tracked`

Controls whether runs for this skill should appear in the Arcade Activity feed.
This only affects feed visibility. It does not disable tracked workflow
bootstrap, run creation, emits, or artifact registration.

Use it when a skill still benefits from workflow state or run records, but its
runs would be noise in the user-facing Activity stream.

- **Type**: boolean
- **Required**: No
- **Default**: `true`

Example:

```yaml
metadata:
  category: knowledge
  is_workflow: true
  arcade_tracked: false
  workflow:
    run_policy: fresh
    identity_args: []
```

### `version`

Semantic version of the skill.

- **Type**: string (semver)
- **Required**: No

### `tags`

Free-form tags for search and filtering.

- **Type**: array of strings
- **Required**: No

### `created` / `updated`

ISO date strings for creation and last update.

- **Type**: string (YYYY-MM-DD)
- **Required**: No

### `author`

Skill author identifier.

- **Type**: string
- **Required**: No

### `arguments`

Structured parameter definitions. The build pipeline auto-generates a `## 0. Resolve Arguments` section from these declarations.

- **Type**: array of argument objects
- **Required**: No (only for parameterized skills)

Each argument object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Parameter name in `UPPER_SNAKE_CASE` |
| `type` | enum | Yes | One of: `string`, `boolean`, `enum` |
| `required` | boolean | Yes | Whether the argument must be provided |
| `description` | string | Yes | Human-readable description |
| `default` | any | No | Default value when not provided |
| `variadic` | boolean | No | Accept remaining positional input as this argument |
| `aliases` | array | No | Alternative phrasings that resolve to this argument |
| `enum_values` | array | No | Allowed values (required when `type` is `enum`) |

### `sub_agents`

List of sub-agents the skill dispatches.

- **Type**: array of strings
- **Required**: No
- **Format**: `"rp1-{plugin}:{agent-name}"`

## Prompt Body

The Markdown body after the frontmatter `---` delimiter contains the skill's instructions. It may include:

- Liquid tags (`{% dispatch_agent %}`, `{% ask_user %}`, `{% plan_tool %}`)
- State machine definitions (`## STATE-MACHINE` with `stateDiagram-v2`)
- Companion doc references (loaded via progressive disclosure)
- Terse section headers (`## Configuration`, `## Workflow`, etc.)

## Example

```yaml
---
name: code-check
description: "Fast code hygiene validation for quick development loop feedback."
metadata:
  category: quality
  is_workflow: false
  version: 2.0.0
  tags:
    - testing
    - code
    - quality
  created: 2025-11-08
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-dev:code-checker"
---
```
