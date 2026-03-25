# Platform Tags

rp1 skills are authored once and built into platform-specific artifacts for Claude Code, OpenCode, and Codex. Platform tags are semantic Liquid custom tags that let skill authors express platform-varying behavior declaratively, without writing raw `{% if platform %}` conditionals.

## The Problem

Each platform has different tool names, agent spawning protocols, and capability boundaries:

| Behavior | Claude Code | OpenCode | Codex |
|----------|-------------|----------|-------|
| Agent dispatch | Task tool (sync) | task tool (sync) | spawn_agent + explicit fork_context + wait (async) |
| User input | AskUserQuestion | ask_user | request_user_input (options required) |
| Planning | TodoWrite + PlanMode | manage_todos | update_plan |
| Web access | WebFetch + WebSearch | web_fetch + web_search | web_search only |
| File editing | Edit (string replace) | edit_file (string replace) | apply_patch (unified diff) |
| Namespace separator | `:` | `/` with `@` prefix | `-` |

Before platform tags, authors had two options: write CC-native syntax (broken on other platforms) or write verbose `{% if platform %}` blocks for every difference. Both are error-prone and hard to maintain.

## How Tags Work

Tags are evaluated during the preprocessor phase (phase 1) of the build pipeline, alongside existing `{% if platform %}` / `{% case platform %}` blocks. They produce platform-specific text that flows into the template render phase (phase 2) unchanged.

```
Source SKILL.md
  --> Preprocessor (evaluates tags + platform conditionals)
    --> Template render (applies namespace_ref, slash_commands filters)
      --> Linter (validates rendered output)
        --> Written artifact
```

Tags use `{% %}` syntax, which the preprocessor's Liquid instance already processes. The `{{ }}` output tag extraction (which protects expressions like `{{$RP1_ROOT}}` from Liquid evaluation) is unaffected.

## Available Tags

| Tag | Purpose | FR |
|-----|---------|-----|
| `{% dispatch_agent %}` | Agent spawning with full Codex spawn/fork_context/wait protocol | FR-01 |
| `{% ask_user %}` | User input with per-platform tool names and Codex constraints | FR-02 |
| `{% plan_tool %}` | Planning/todo with CC plan-mode support | FR-03 |
| `{% web_access %}` | Web access with graceful degradation | FR-04 |
| `{% edit_model %}` | File editing model references | FR-05 |
| `{% permissions %}` | Permission model references | FR-07 |

For syntax, arguments, and per-platform output examples, see the [Platform Tags Reference](../reference/platform-tags.md).

## When to Use Tags vs. Conditionals

**Use tags** when:

- You are dispatching an agent with a simple prompt
- You are dispatching an agent with a multi-line prompt that can be expressed as a single block
- You reference a platform-varying tool by name
- You describe a capability that differs across platforms

**Use `{% case platform %}` blocks** when:

- The platform-specific behavior needs substantially different structure per platform
- The dispatch appears inside algorithmic control flow that cannot be expressed as a single tag block
- The platform-varying section has complex structure that does not map to a tag
- You need control flow around platform-specific behavior

## Build-Time Linting

The build pipeline validates rendered output with five lint rules (L001--L005). Errors block the build; warnings are advisory. Run the linter standalone with `rp1 build --lint`.

The linter catches null tool references, orphaned platform blocks, incomplete Codex dispatch protocols (including missing `fork_context`), unresolved semantic tags, and CC-specific tool names in non-CC prose. See the [lint rules reference](../reference/platform-tags.md#lint-rules-reference) for details on each rule.

## Related

- [Platform Tags Reference](../reference/platform-tags.md) -- Full syntax, output examples, migration guide, lint rules
- [SKILL.md Format](skill-format.md) -- Canonical skill format
- [Skill-Agent Pattern](command-agent-pattern.md) -- How skills delegate to agents
