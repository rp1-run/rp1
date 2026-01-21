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
    REQUEST: "{plausible_sample_request}"
    # Booleans: unquoted true/false, not "true"/"false"
    SOME_FLAG: true
    OTHER_FLAG: false

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

**CRITICAL**: LLM rubrics are the default assertion type. Use programmatic assertions only for complex logic (counting, strict sequencing).

### LLM Rubric (Default)

Primary template for behavioral verification. Groups ALL requirements for a test scenario.

```yaml
- type: llm-rubric
  value: |
    Evaluate the agent execution. Check the output text AND the Metadata JSON section.

    REQUIRED (all must pass):
    1. {behavioral_requirement_1}
    2. {behavioral_requirement_2}
    3. Metadata toolCalls includes {Tool} with {expected_input}
    ...

    PROHIBITED (fail if any present in Metadata bashCommands):
    - {prohibited_command_1}
    - {prohibited_command_2}

    EDGE CASES (optional):
    - When {condition}: {expected_behavior}
```

**Structure Rules**:
- Line 1: "Evaluate the agent execution. Check the output text AND the Metadata JSON section."
- REQUIRED: Numbered list (1., 2., 3...)
- PROHIBITED: Bulleted list (- item)
- EDGE CASES: Optional, bulleted conditionals
- Empty lines separate sections

### LLM Rubric - Minimal (No Prohibitions)

```yaml
- type: llm-rubric
  value: |
    Evaluate the agent execution. Check the output text AND the Metadata JSON section.

    REQUIRED (all must pass):
    1. {behavioral_requirement_1}
    2. {behavioral_requirement_2}
```

### LLM Rubric - Flag Behavior Check

For testing flag-controlled behavior:

```yaml
- type: llm-rubric
  value: |
    Evaluate whether the agent respected the {FLAG}={value} flag.

    Check the Metadata JSON section for toolCalls and bashCommands.

    REQUIRED:
    - {expected_behavior_description}

    PASS if: {pass_condition}
    FAIL if: {fail_condition}
```

### Built-in Types (Simple Cases)

Use built-in types for trivial checks that don't warrant a full rubric.

| Type | Use For | Example |
|------|---------|---------|
| `contains` | Output includes text | `value: "Build Complete"` |
| `icontains` | Case-insensitive match | `value: "success"` |
| `not-contains` | Output excludes text | `value: "ERROR"` |
| `regex` | Simple pattern matching | `value: "feat\\([^)]+\\):"` |
| `is-json` | Valid JSON output | (no value needed) |

### Programmatic Assertion (Complex Only)

Reserved for HIGH complexity requirements (counting, strict sequencing).

```yaml
- type: javascript
  value: file://../../shared/assertions/tool-calls.ts:{functionName}
```

**Use programmatic assertions for**:
- Exact call counts: "called exactly 3 times"
- Strict ordering: "A must happen before B which must happen before C"
- Complex matching: custom regex combinations

## 3. Notes Header Format

Always include extraction notes at top:

```yaml
# ============================================================
# EXTRACTION NOTES
# ============================================================
# Source: {source_file_or_identifier}
# Generated: {ISO_timestamp}
#
# Rubric sections generated:
#   - REQUIRED: {count} items
#   - PROHIBITED: {count} items
#   - EDGE CASES: {count} items (if any)
#
# Assertion types:
#   - [llm-rubric] {scenario_name}: behavioral verification
#   - [programmatic] {function}: from "{complex_requirement}" (if any)
#
# Skipped (redundant/trivial):
#   - "read file" - intermediate step, not outcome
#   - second "write file" - same target as first
# ============================================================
```

## 4. Test Consolidation (CRITICAL)

**Each test runs a full LLM call. Minimize test count.**

### Group by Unique Vars

Tests with identical vars MUST be combined into one test with multiple assertions:

```yaml
# WRONG (wasteful - 3 API calls)
tests:
  - description: "scope_assessment"
    assert:
      - type: contains
        value: "Scope"
  - description: "build_completes"
    assert:
      - type: contains
        value: "Complete"
  - description: "summary_created"
    assert:
      - type: regex
        value: "summary\\.md"

# CORRECT (efficient - 1 API call)
tests:
  - description: "default_behavior"
    assert:
      - type: contains
        value: "Scope"
      - type: contains
        value: "Complete"
      - type: regex
        value: "summary\\.md"
```

### Separate Tests Only When Vars Differ

Create separate tests ONLY when testing different variable combinations:

```yaml
tests:
  # Test 1: Default flags (GIT_COMMIT=true, etc)
  - description: "default_flags_behavior"
    assert:
      # All assertions for default behavior combined here

  # Test 2: Different var value
  - description: "no_commit_when_disabled"
    vars:
      GIT_COMMIT: false
    assert:
      - type: javascript
        value: file://...assertNoGitCommitToolCall

  # Test 3: Different REQUEST triggers different behavior
  - description: "large_scope_redirect"
    vars:
      REQUEST: "rewrite entire system..."
    assert:
      - type: contains
        value: "EXCEEDS SCOPE"
```

## 5. Test Scenario Naming

| Pattern | Name Format |
|---------|-------------|
| Happy path | `{action}_completes_successfully` |
| Error handling | `{action}_handles_{error_type}` |
| Constraint | `{action}_respects_{constraint}` |
| Negative | `does_not_{prohibited_action}` |
| Default behavior | `default_behavior` or `default_flags_behavior` |

## 6. YAML Formatting Rules

| Rule | Example |
|------|---------|
| No trailing spaces | Lines end cleanly |
| 2-space indentation | Consistent nesting |
| Quote strings with special chars | `value: "pattern: *"` |
| Use `\|` for multiline JS | Preserves newlines |
| No tabs | Spaces only |

## 7. Complete Example

```yaml
# ============================================================
# EXTRACTION NOTES
# ============================================================
# Source: task-builder.md
# Generated: 2026-01-19T10:30:00Z
#
# Rubric sections generated:
#   - REQUIRED: 5 items
#   - PROHIBITED: 3 items
#   - EDGE CASES: 0 items
#
# Assertion types:
#   - [llm-rubric] default_behavior: behavioral verification
#
# Skipped (redundant/trivial):
#   - "read design.md" - intermediate context loading
#   - "run formatter" - subsumed by quality check
# ============================================================

description: "Evals for task-builder agent"

prompts:
  - "{{PROMPT_CONTENT}}"

defaultTest:
  vars:
    FEATURE_ID: "auth-refactor"
    TASK_IDS: '["T1"]'
    AFK_MODE: true

tests:
  - description: "default_behavior"
    assert:
      - type: llm-rubric
        value: |
          Evaluate the agent execution. Check the output text AND the Metadata JSON section.

          REQUIRED (all must pass):
          1. Output contains "Builder Complete" section with task summary
          2. Output contains commit SHA in format feat({feature}): implement {task}
          3. Output contains "Quality" section showing format/lint/test status
          4. Metadata toolCalls includes Bash with "git commit" command
          5. Metadata toolCalls shows commit message uses conventional format

          PROHIBITED (fail if any present in Metadata bashCommands):
          - "git push --force" or "git push -f"
          - "git commit --amend"
          - "git reset --hard"
```
