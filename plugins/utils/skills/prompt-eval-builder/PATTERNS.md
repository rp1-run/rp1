# Extraction & Distillation Patterns

Core knowledge for prompt analysis: what to extract, how to classify, when to skip.

## 1. Extraction Categories

Scan prompt for these patterns:

| Category | Detection Patterns | Assertion Type |
|----------|-------------------|----------------|
| Tool Call | "create branch", "commit", "push", "write file", "read", "edit", "search", "glob", "grep" | `assert_tool_call: {tool}_{operation}` |
| Artifact | "create file", "generate", "output to", "write to" | `assert_artifact: {path}` or `assert_artifact_content: {path}` |
| Output | "report", "confirm", "display", "tell user", "let user know", "output" | `assert_output: {pattern}` |
| Negative | "MUST NOT", "do not", "never", "avoid", "DO NOT" | `assert_not: {prohibited}` |
| Sequence | "first", "then", "before", "after", "finally", numbered steps | `# sequence: {N}` comment |

## 2. Tool Call Mapping

| Prompt Pattern | Tool | Operation |
|----------------|------|-----------|
| branch/checkout | git | branch |
| commit | git | commit |
| push | git | push |
| pull | git | pull |
| clone | git | clone |
| init repo | git | init |
| create/write file | Write | create |
| read file | Read | read |
| edit/modify file | Edit | edit |
| delete/remove file | Bash | delete |
| search/find files | Glob | search |
| search content | Grep | search |
| run command/execute | Bash | exec |
| spawn agent/task | Task | spawn |
| ask user | AskUser | prompt |

## 3. Smart Selection Rules

**CRITICAL**: Extract ONLY pivotal assertions. Apply these filters:

| Rule | Logic | Action |
|------|-------|--------|
| Content subsumes existence | "Create file with X content" | Only `assert_artifact_content`, skip existence |
| Higher-level preferred | "Commit with message X" | `assert_output` for message, not just tool call |
| No redundancy | Multiple "write file" for same file | Single assertion |
| Pivotal only | "Read config" (intermediate) | Skip unless config content critical to outcome |
| Proportional | Complex prompt w/ 20 steps | 5-10 assertions; Simple prompt | 2-4 assertions |

**Before adding assertion**: "Does this verify a key behavioral outcome?" No -> skip.

## 4. Analysis Process

1. **Scan**: Identify all instruction patterns matching categories
2. **Filter**: Apply smart selection rules to remove trivial/redundant
3. **Classify**: Assign assertion type + extract target (tool, file, pattern)
4. **Sequence**: Note ordering dependencies where explicit
5. **Infer**: For content validation, extract criteria from context or mark TODO

## 5. Content Inference

When prompt specifies content requirements:

| Pattern | Inference |
|---------|-----------|
| "valid JSON" | `// Criteria: JSON.parse succeeds` |
| "contains X" | `// Criteria: includes "{X}"` |
| "format as Y" | `// Criteria: matches {Y} structure` |
| "with properties A, B" | `// Criteria: has keys [A, B]` |
| Unclear | `// TODO: Determine validation criteria from context` |

## 6. Test Invocation Prompt Generation

For creating user invocation prompts that test commands/agents.

**Key Concept**: Test prompts are USER INPUTS, not distilled agent instructions. They simulate what a user would type to invoke and test the command.

### Metadata Extraction

| Element | Detection Pattern | Example |
|---------|-------------------|---------|
| Command name | YAML `name:` field | `build-fast` |
| Plugin | File path `plugins/{plugin}/` | `dev` |
| Argument hint | YAML `argument-hint:` | `"[request...] [--flag]"` |
| Params | PARAMS table, Section 0 | `REQUEST`, `FEATURE_ID` |
| Flags | `--flag` in hint or params | `--git-commit`, `--afk` |

### Invocation Template

```
/{plugin-prefix}:{command-name} {positional-args} {flags}
```

### Variable Placeholders

| Param Type | Template Format |
|------------|-----------------|
| Freeform request | `"{{REQUEST}}"` |
| Positional param | `{{PARAM_NAME}}` |
| Boolean flag | `{% if FLAG_VAR %} --flag{% endif %}` |
| Flag with value | `{% if FLAG_VAR %} --flag={{FLAG_VAR}}{% endif %}` |
| Environment var | (omit - handled by test config) |

**Note**: Boolean flags use Jinja conditionals - they're either present or absent, not `--flag=true`.

### Variable Naming

| Source Pattern | Variable Name |
|----------------|---------------|
| `$ARGUMENTS`, request | `REQUEST` |
| `$1` named `feature-id` | `FEATURE_ID` |
| `--git-commit` flag | `GIT_COMMIT` |
| `--afk` flag | `AFK_MODE` |

### Generation Examples

**Input** (build-fast.md):
```yaml
name: build-fast
argument-hint: "[development-request...] [--afk] [--git-worktree] [--git-commit] [--git-push]"
```

**Output**:
```
/rp1-dev:build-fast "{{REQUEST}}"{% if GIT_COMMIT %} --git-commit{% endif %}{% if GIT_WORKTREE %} --git-worktree{% endif %}{% if GIT_PUSH %} --git-push{% endif %}{% if AFK_MODE %} --afk{% endif %}
```

**Input** (feature-requirements.md):
```yaml
name: feature-requirements
argument-hint: "feature-id [extra-context]"
```

**Output**:
```
/rp1-dev:feature-requirements {{FEATURE_ID}}{% if EXTRA_CONTEXT %} {{EXTRA_CONTEXT}}{% endif %}
```

### Output Format

- Plain text file (prompt.txt)
- Single line invocation
- No markdown, no frontmatter
- Extension: `.txt` (not `.md`)

### Sample Request Generation

**CRITICAL**: Also generate a plausible sample value for `{{REQUEST}}` and similar placeholders.

1. Analyze the command's purpose from its description and parameters
2. Invent a realistic, simple example that would exercise the command
3. Include this sample in the YAML config under `defaultTest.vars`

| Command Type | Sample Request Pattern |
|--------------|----------------------|
| Build/create | "a simple {language} script for {common_task}" |
| Fix/debug | "fix the {common_error} in {typical_file}" |
| Refactor | "rename {old_name} to {new_name} across the codebase" |
| Feature | "add {simple_feature} to {component}" |

**Example** (build-fast):
```yaml
defaultTest:
  vars:
    REQUEST: "a simple bun script that validates JSON input"
    GIT_WORKTREE: "true"
    GIT_COMMIT: "true"
```
