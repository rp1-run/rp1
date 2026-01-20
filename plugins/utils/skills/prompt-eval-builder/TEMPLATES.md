# promptfoo YAML Templates

Output format specification for eval assertion YAML. All output must be valid YAML with no code fences.

## 1. Output Structure

Output valid YAML directly. NO code fences. NO delimiters. Pure YAML that can be saved as-is.

```yaml
# ============================================================
# EXTRACTION NOTES
# ============================================================
# Source: {SOURCE_NAME}
# Generated: {timestamp}
#
# Extracted assertions:
#   - [{type}] {name}: from "{source_phrase}"
#   ...
#
# Skipped (redundant/trivial):
#   - {reason}
#   ...
#
# REVIEW REQUIRED: Placeholder assertions need manual refinement
# ============================================================

description: "Evals for {prompt_name}"

prompts:
  - "{{PROMPT_CONTENT}}"

defaultTest:
  vars:
    REQUEST: "{plausible_sample_request}"  # Generate realistic example
    # ... other vars with sensible defaults

tests:
  - description: "{scenario}"
    assert:
      # Use built-in types where possible
      - type: contains
        value: "{expected_output}"

      # Use placeholders for complex logic
      - type: javascript
        value: "// TODO: assert_tool_call: {tool}_{operation}"
        # Criteria: {what_to_verify}
```

## 2. Assertion Templates

**CRITICAL**: Prefer built-in assertion types. Use placeholders for complex logic - do NOT write full JS implementations.

### Built-in Types (Preferred)

| Type | Use For | Example |
|------|---------|---------|
| `contains` | Output includes text | `value: "Build Complete"` |
| `icontains` | Case-insensitive match | `value: "success"` |
| `not-contains` | Output excludes text | `value: "ERROR"` |
| `regex` | Pattern matching | `value: "feat\\([^)]+\\):"` |
| `is-json` | Valid JSON output | (no value needed) |

### Output Contains (Built-in)

```yaml
- type: contains
  value: "Build Fast Complete"
  # assert_output: completion_message
```

### Negative Contains (Built-in)

```yaml
- type: not-contains
  value: "git push --force"
  # assert_not: force_push
```

### Regex Pattern (Built-in)

```yaml
- type: regex
  value: "(feat|fix|refactor)\\([^)]+\\):"
  # assert_output: conventional_commit_format
```

### Tool Call (Placeholder)

```yaml
- type: javascript
  value: "// TODO: assert_tool_call: git_commit"
  # Criteria: Verify git commit was called with conventional format
```

### Artifact Content (Placeholder)

```yaml
- type: javascript
  value: "// TODO: assert_artifact_content: summary.md"
  # Criteria: File exists in work/quick-builds/ with implementation summary
```

### Conditional Logic (Placeholder)

```yaml
- type: javascript
  value: "// TODO: assert_conditional: worktree_create when GIT_WORKTREE=true"
  # Criteria: Worktree created only when flag enabled
```

### Sequence Marker

```yaml
# sequence: 1 - must happen before commit
- type: javascript
  value: "// TODO: assert_tool_call: git_add"
```

## 3. Notes Header Format

Always include extraction notes at top:

```yaml
# ============================================================
# EXTRACTION NOTES
# ============================================================
# Source: {source_file_or_identifier}
# Generated: {ISO_timestamp}
#
# Extracted assertions:
#   - [tool_call] git_commit: from "commit changes"
#   - [artifact_content] README.md: from "create README with usage"
#   - [output] success_message: from "report completion"
#   - [negative] no_push: from "DO NOT push"
#
# Skipped (redundant/trivial):
#   - "read file" - intermediate step, not outcome
#   - second "write file" - same target as first
#
# REVIEW REQUIRED: Placeholder assertions need manual refinement
# ============================================================
```

## 4. Test Scenario Naming

| Pattern | Name Format |
|---------|-------------|
| Happy path | `{action}_completes_successfully` |
| Error handling | `{action}_handles_{error_type}` |
| Constraint | `{action}_respects_{constraint}` |
| Negative | `does_not_{prohibited_action}` |

## 5. YAML Formatting Rules

| Rule | Example |
|------|---------|
| No trailing spaces | Lines end cleanly |
| 2-space indentation | Consistent nesting |
| Quote strings with special chars | `value: "pattern: *"` |
| Use `\|` for multiline JS | Preserves newlines |
| No tabs | Spaces only |

## 6. Complete Example

```yaml
# ============================================================
# EXTRACTION NOTES
# ============================================================
# Source: task-builder.md
# Generated: 2026-01-19T10:30:00Z
#
# Extracted assertions:
#   - [tool_call] git_commit: from "create atomic commit"
#   - [artifact_content] tasks.md: from "mark task complete"
#   - [output] builder_complete: from "output Builder Complete"
#   - [negative] no_force_push: from "DO NOT force push"
#
# Skipped (redundant/trivial):
#   - "read design.md" - intermediate context loading
#   - "run formatter" - subsumed by quality check
#
# REVIEW REQUIRED: Placeholder assertions need manual refinement
# ============================================================

description: "Evals for task-builder agent"

prompts:
  - "{{PROMPT_CONTENT}}"

defaultTest:
  vars:
    FEATURE_ID: "auth-refactor"
    TASK_IDS: '["T1"]'

tests:
  - description: "task_implementation_creates_commit"
    assert:
      # Assertion 1: Atomic commit created
      # Extracted from: "create atomic commit after each task"
      - type: javascript
        value: "// TODO: assert_tool_call: git_commit"
        # Criteria: commit message follows format feat({FEATURE_ID}): implement {TASK_ID}

      # Assertion 2: Task marked complete in tasks.md
      # Extracted from: "- [ ] -> - [x]"
      - type: javascript
        value: "// TODO: assert_artifact_content: tasks.md"
        # Criteria: task checkbox changed from [ ] to [x]

      # Assertion 3: Builder Complete output (built-in)
      # Extracted from: "Output Contract: ## Builder Complete"
      - type: contains
        value: "Builder Complete"

      # Assertion 4: No force push (built-in)
      # Extracted from: "DO NOT force push"
      - type: not-contains
        value: "git push --force"
```
