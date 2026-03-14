# Platform Tags Reference

Semantic Liquid tags for expressing platform-varying behavior in rp1 skills and agents. Tags are evaluated during the preprocessor phase and produce platform-specific instruction blocks for Claude Code (CC), OpenCode (OC), and Codex.

---

## Tag Syntax

All tags use Liquid custom tag syntax:

```
{% tag_name "arg1", "arg2" %}
{% tag_name "arg1", named_key: "val1", "val2" %}
```

Arguments are comma-separated. Quoted strings use double quotes. Named arguments use `key: value` syntax and can accumulate multiple values as arrays.

---

## Tags

### `dispatch_agent`

Renders platform-specific agent spawn instructions.

**Syntax**:

```
{% dispatch_agent "<agent-ref>", "<prompt>" %}
{% dispatch_agent "<agent-ref>", "<prompt>", background %}
{% dispatch_agent "<agent-ref>" %}
multi-line prompt content
{% enddispatch_agent %}
{% dispatch_agent "<agent-ref>", background %}
multi-line prompt content
{% enddispatch_agent %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | agent-ref | Yes | Canonical agent reference (e.g., `rp1-dev:code-writer`) |
| 2 | prompt | Yes for inline syntax | Prompt text passed to the spawned agent |
| 3 | mode | No | `background` for non-blocking dispatch. Default: foreground |

**Output by platform**:

Claude Code:

```
Task tool:
subagent_type: rp1-dev:code-writer
prompt: "Write the implementation"
```

OpenCode:

```
task tool:
subagent_type: @rp1-dev/code-writer
prompt: "Write the implementation"
```

Codex (foreground):

```
Spawn agent:
  agent_type: rp1-dev-code-writer
  prompt: "Write the implementation"

Wait for the spawned agent to complete. Do NOT proceed until the agent has finished and returned its result. Check the agent's output for success/failure before continuing.
```

Codex (background):

```
Spawn agent (background):
  agent_type: rp1-dev-code-writer
  prompt: "Write the implementation"

This agent runs in the background. Continue with other work. Check its result later when needed.
```

**Namespace transformation** (applied internally by the tag):

| Platform | Input | Output |
|----------|-------|--------|
| CC | `rp1-dev:code-writer` | `rp1-dev:code-writer` |
| OC | `rp1-dev:code-writer` | `@rp1-dev/code-writer` |
| Codex | `rp1-dev:code-writer` | `rp1-dev-code-writer` |

All three plugin prefixes (`rp1-base`, `rp1-dev`, `rp1-utils`) are supported.

---

### `ask_user`

Renders platform-specific user input instructions.

**Syntax**:

```
{% ask_user "<question>" %}
{% ask_user "<question>", options: "Option A", "Option B" %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | question | Yes | The question to ask the user |
| named | options | No | List of options. Required on Codex; a placeholder is inserted if omitted. |

**Output by platform**:

Claude Code:

```
AskUserQuestion: "Which approach do you prefer?"
Options:
- Option A
- Option B
```

OpenCode:

```
ask_user: "Which approach do you prefer?"
Options:
- Option A
- Option B
```

Codex:

```
request_user_input: "Which approach do you prefer?"
options: ["Option A", "Option B"]
Note: User input is unavailable in subagent contexts on Codex.
```

When no options are provided, Codex output includes `options: ["(provide appropriate options)"]` as a placeholder.

---

### `plan_tool`

Renders platform-specific planning and todo management instructions.

**Syntax**:

```
{% plan_tool "<directive>" %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | directive | Yes | The planning or todo directive |

**Output by platform**:

| Platform | Output |
|----------|--------|
| CC | `TodoWrite: <directive>` |
| OC | `manage_todos: <directive>` |
| Codex | `update_plan: <directive>` |

When the directive references planning mode transitions (e.g., "enter planning mode", "start planning"), CC output appends:

```
Use EnterPlanMode before planning and ExitPlanMode when done.
```

---

### `web_access`

Renders platform-specific web access instructions with graceful degradation.

**Syntax**:

```
{% web_access "<capability>", "<directive>" %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | capability | Yes | `fetch`, `search`, or `both` |
| 2 | directive | Yes | The web access directive |

**Output by platform**:

| Platform | `fetch` | `search` | `both` |
|----------|---------|----------|--------|
| CC | `WebFetch: <dir>` | `WebSearch: <dir>` | Both tools listed |
| OC | `web_fetch: <dir>` | `web_search: <dir>` | Both tools listed |
| Codex | `web_search: <dir>` + degradation note | `web_search: <dir>` | `web_search: <dir>` + degradation note |

When `fetch` or `both` is requested on Codex, the output includes:

```
Note: WebFetch is not available on Codex. Use web_search as an alternative where possible.
```

---

### `edit_model`

Renders platform-specific file editing instructions.

**Syntax**:

```
{% edit_model "<directive>" %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | directive | Yes | The editing action to perform |

**Output by platform**:

| Platform | Output |
|----------|--------|
| CC | `Use the Edit tool (exact string replacement) to <directive>` |
| OC | `Use the edit_file tool (exact string replacement) to <directive>` |
| Codex | `Use the apply_patch tool (unified diff format) to <directive>` |

---

### `permissions`

Renders platform-specific permission model references.

**Syntax**:

```
{% permissions "<directive>" %}
```

**Arguments**:

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| 1 | directive | Yes | The permissions directive |

**Output by platform**:

| Platform | Output |
|----------|--------|
| CC | ``Use the `allowed-tools` frontmatter field with `Bash(pattern)` format to <directive>`` |
| OC | `Use the permission map with tool-level granularity to <directive>` |
| Codex | `Use the sandbox execution policy to <directive>` |

---

## Migration Guide

### Converting CC-native syntax to semantic tags

Replace inline CC-native dispatch blocks with `{% dispatch_agent %}`:

**Before** (CC-native):

```markdown
Use the Task tool to invoke the code-writer agent:

```
subagent_type: rp1-dev:code-writer
```
```

**After** (semantic tag):

```markdown
{% dispatch_agent "rp1-dev:code-writer", "" %}
```

Replace AskUserQuestion references with `{% ask_user %}`:

**Before**:

```markdown
AskUserQuestion: "Which approach?"
Options:
- A
- B
```

**After**:

```markdown
{% ask_user "Which approach?", options: "A", "B" %}
```

Replace TodoWrite references with `{% plan_tool %}`:

**Before**:

```markdown
TodoWrite: Create a task list for the implementation
```

**After**:

```markdown
{% plan_tool "Create a task list for the implementation" %}
```

### Migration checklist

1. Identify CC-native patterns in your skill (dispatch blocks, tool references)
2. Replace each with the corresponding semantic tag
3. Build for all three platforms: `rp1 build`
4. Verify the output is functionally equivalent
5. Run the linter: `rp1 build --lint`

### What can be migrated today

Simple delegator skills where the dispatch has a single-line prompt, no prompt, or a single multi-line block prompt work well with `{% dispatch_agent %}`.

### What cannot be migrated yet

Complex orchestrator skills that need materially different platform-specific structures or dispatch inside algorithmic code blocks should continue using `{% case platform %}` blocks. Multi-line prompts are supported through block syntax.

---

## Lint Rules Reference

The build-time linter validates rendered artifacts per platform. Run it standalone with `rp1 build --lint` or let it run automatically during `rp1 build`. Errors block the build; warnings do not.

### L001: null-tool-refs (error)

**Detects**: References to CC tools that have no equivalent (`null` mapping) on the target platform appearing in rendered output.

**Example**: `TodoWrite` appearing in rendered Codex output.

**Fix**: Replace the raw tool reference with the appropriate semantic tag (e.g., `{% plan_tool "..." %}`). The tag produces the correct tool name per platform.

### L002: orphaned-platform (error)

**Detects**: Raw `{% if platform %}` or `{% case platform %}` blocks that survived preprocessing and appear in the rendered output.

**Example**: Literal `{% if platform == 'codex' %}` in the built artifact.

**Fix**: Ensure the source file's platform conditionals use valid Liquid syntax. The preprocessor evaluates these during the first rendering phase. Malformed blocks are not evaluated and pass through as literal text.

### L003: incomplete-dispatch (error)

**Detects**: Codex `Spawn agent:` blocks without corresponding wait instructions. Only applies to foreground spawns; background spawns (`Spawn agent (background):`) are exempt.

**Example**: A hand-written `Spawn agent:` block in Codex output missing the "Wait for the spawned agent to complete" instruction.

**Fix**: Use `{% dispatch_agent %}` instead of hand-writing dispatch blocks. The tag produces the full spawn/wait protocol automatically. If you must write dispatch manually, include the wait instructions after the spawn block.

### L004: unresolved-tags (error)

**Detects**: Semantic tags (`{% dispatch_agent %}`, `{% ask_user %}`, etc.) that appear as literal text in rendered output, meaning they were not evaluated.

**Example**: Literal `{% dispatch_agent "rp1-dev:agent", "prompt" %}` in the built artifact.

**Fix**: Ensure the build pipeline's preprocessor has custom tags registered. This usually indicates the content bypassed preprocessing or the tag name is misspelled.

### L005: null-tool-in-prose (warning)

**Detects**: CC-specific tool names appearing in prose in non-CC rendered output (e.g., "use the Edit tool" in Codex output).

**Example**: The phrase "the Edit tool" in a Codex artifact where the editing model is `apply_patch`.

**Fix**: Use `{% edit_model %}` or other semantic tags to produce platform-appropriate tool references. Some prose references may be intentional (e.g., documentation comparing platforms), in which case the warning can be ignored.

---

## Known Limitations

- **Algorithmic orchestration still needs conditionals**: When different platforms need genuinely different control flow or differently structured prompt scaffolding, `{% case platform %}` blocks are still the right tool.
- **AskUserQuestion in prose**: The `{% ask_user %}` tag produces a structured output format. Existing skills that reference AskUserQuestion as pseudocode, in tool lists, or as prohibitions ("DO NOT call AskUserQuestion") are instructional text, not template directives, and should not be migrated.

---

## Related

- [Platform Tags Concepts](../concepts/platform-tags.md) -- Why the tag system exists and how it fits the build pipeline
- [SKILL.md Format](../concepts/skill-format.md) -- Canonical skill format with tag examples
- [Skill-Agent Pattern](../concepts/command-agent-pattern.md) -- How skills delegate to agents
