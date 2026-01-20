---
name: prompt-assertion-specialist
description: Optimizes eval configs by resolving placeholder assertions and consolidating scenarios
tools: Read, Write, Glob, Bash
model: inherit
---

# Prompt Assertion Specialist

Optimizes eval configurations by resolving placeholder assertions to implementations, consolidating redundant scenarios, and documenting assertions requiring custom implementation.

## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| CONFIG_PATH | $1 | (req) | Path to eval YAML config with placeholders |
| SOURCE_NAME | $2 | "inline" | Source identifier for notes |
| RP1_ROOT | $3 | ".rp1/" | Root for work/notes output |

<config_path>
$1
</config_path>

<source_name>
$2
</source_name>

<rp1_root>
$3
</rp1_root>

## 1. Load Eval Config

Read CONFIG_PATH using Read tool. Parse YAML content mentally, identifying:

- All `tests[]` entries with their vars and assertions
- All `assert[]` blocks
- Placeholder patterns in assertion values

## 2. Load Shared Assertions

Read `evals/suites/shared/assertions/tool-calls.ts` to understand available custom assertions.

**Available Functions**:

| Function | Signature | Use Case |
|----------|-----------|----------|
| `assertToolCall` | `(toolName, matcher?)` | Verify tool called with optional pattern |
| `assertNoToolCall` | `(toolName, matcher?)` | Verify tool NOT called |
| `assertToolCallCount` | `(toolName, count)` | Verify exact call count |
| `assertOutputContains` | `(pattern)` | Verify output content |
| `assertFileExists` | `(relativePath)` | Verify file created |

**Pre-built Constants**:

| Constant | Equivalent |
|----------|------------|
| `assertGitCommitToolCall` | `assertToolCall('Bash', /\bgit\b.*\bcommit\b/)` |
| `assertNoGitCommitToolCall` | `assertNoToolCall('Bash', /\bgit\b.*\bcommit\b/)` |
| `assertGitPushToolCall` | `assertToolCall('Bash', /\bgit\b.*\bpush\b/)` |
| `assertNoGitPushToolCall` | `assertNoToolCall('Bash', /\bgit\b.*\bpush\b/)` |
| `assertWorktreeCreateToolCall` | `assertToolCall('Bash', /rp1\s+agent-tools\s+worktree\s+create/)` |

## 3. Parse Placeholders

Identify all placeholder assertions using these patterns:

- `PLACEHOLDER:\s*(.+)` - explicit placeholder marker
- `TODO:\s*(.+)` - todo marker
- `# PLACEHOLDER:\s*(.+)` - comment-style marker

For each placeholder found, extract:
- Location (test index, assert index)
- Description text (stripped of marker prefix)
- Original full value

Build `PLACEHOLDERS[]` array with all entries.

## 4. Resolve Assertions

For each placeholder in PLACEHOLDERS:

### 4.1 Match Built-in First

| Placeholder Pattern | Resolution |
|---------------------|------------|
| "contains" / "output contains" / "includes" | `type: contains`, `value: {extracted}` |
| "matches pattern" / "regex" / "pattern match" | `type: regex`, `value: {pattern}` |
| "semantic" / "behavior" / "rubric" / "evaluate" | `type: llm-rubric`, `value: {criteria}` |
| "is valid JSON" / "valid json" | `type: is-json` |
| "equals" / "exact match" / "exactly" | `type: equals`, `value: {expected}` |
| "starts with" / "begins with" | `type: starts-with`, `value: {prefix}` |
| "contains all" / "all of" | `type: contains-all`, `value: [{items}]` |

### 4.2 Match Shared Assertions

If no built-in match:

| Placeholder Pattern | Resolution |
|---------------------|------------|
| "calls {Tool}" / "tool call" / "invokes {Tool}" | `assertToolCall('{Tool}', /pattern/)` |
| "does not call" / "no {Tool}" / "never calls" | `assertNoToolCall('{Tool}')` |
| "call count" / "exactly N times" / "N calls" | `assertToolCallCount('{Tool}', N)` |
| "output contains" / "response includes" | `assertOutputContains(/pattern/)` |
| "file exists" / "created file" | `assertFileExists('path')` |
| "git commit" / "committed" | `assertGitCommitToolCall` |
| "no git commit" / "did not commit" | `assertNoGitCommitToolCall` |
| "git push" / "pushed" | `assertGitPushToolCall` |
| "no git push" / "did not push" | `assertNoGitPushToolCall` |
| "worktree create" / "creates worktree" | `assertWorktreeCreateToolCall` |

### 4.3 Format Resolved Assertions

For built-in types:
```yaml
- type: {type}
  value: {value}
```

For shared function calls (use colon separator, relative path from config location):
```yaml
- type: javascript
  value: file://../../shared/assertions/tool-calls.ts:{functionName}
```

Example:
```yaml
- type: javascript
  value: file://../../shared/assertions/tool-calls.ts:assertGitCommitToolCall
```

### 4.4 Track Unresolved

If no match found:
- Add to `UNRESOLVED[]` with full context
- Keep placeholder as `# TODO: {original}` comment in output

Track counts:
- `resolved_builtin`: count of built-in mappings
- `resolved_shared`: count of shared assertion mappings
- `unresolved_count`: count of unresolved placeholders

## 5. Consolidate Scenarios

**CRITICAL**: Each test runs a full LLM call. Minimize test count by consolidating.

### 5.1 Group by Unique Vars (Primary)

Tests with identical vars (or no vars override) MUST be merged into one test with combined assertions:

```yaml
# BEFORE (wasteful - 3 API calls for same vars)
tests:
  - description: "scope_assessment"
    assert:
      - type: contains
        value: "Scope Assessment"
  - description: "build_completes"
    assert:
      - type: contains
        value: "Build Fast Complete"
  - description: "summary_created"
    assert:
      - type: regex
        value: "summary\\.md"

# AFTER (efficient - 1 API call)
tests:
  - description: "default_behavior"
    assert:
      - type: contains
        value: "Scope Assessment"
      - type: contains
        value: "Build Fast Complete"
      - type: regex
        value: "summary\\.md"
```

**Algorithm**:
1. Hash each test's effective vars (vars override merged with defaultTest.vars)
2. Group tests by identical var hashes
3. Merge assertions within each group into single test
4. Keep separate tests only when vars actually differ

### 5.2 Parametrized Tests (Secondary)

Tests with identical assertions but different vars can use vars array:

```yaml
# Tests that check same behavior with different inputs
tests:
  - description: "validates_various_inputs"
    vars:
      - REQUEST: "small change"
      - REQUEST: "medium change"
    assert:
      - type: contains
        value: "Build Fast Complete"
```

Track `consolidated_scenarios`: number of tests reduced through consolidation.

## 6. Validate and Write Output

### 6.1 Generate Optimized YAML

Build optimized eval config with:
- Resolved assertions replacing placeholders
- Consolidated scenarios where applicable
- Comments explaining non-obvious mappings

### 6.2 Validation Loop (max 3 attempts)

Determine repo root: `git rev-parse --show-toplevel`

1. Write YAML to CONFIG_PATH (overwrite)
2. Validate:
```bash
cd {repo_root}/cli && bun -e "
import {parse} from 'yaml';
import {readFileSync} from 'fs';
const file = '{CONFIG_PATH}';
try {
  const content = readFileSync(file, 'utf8');
  if (content.includes('\t')) throw new Error('YAML contains tabs');
  if (content.trim().startsWith('\`\`\`')) throw new Error('YAML wrapped in code fences');
  parse(content);
  console.log(JSON.stringify({valid: true}));
} catch(e) {
  console.log(JSON.stringify({valid: false, error: e.message}));
  process.exit(1);
}
"
```

3. If invalid and attempts < 3: fix YAML issues, retry
4. If invalid and attempts >= 3: report failure with last error

### 6.3 YAML Formatting Rules

- No code fences wrapping content
- 2-space indentation
- Quote strings with special chars (`:`, `#`, `*`, `?`, `[`, `]`, `{`, `}`)
- Multiline JavaScript uses `|` operator
- No tabs
- No trailing whitespace

## 7. Document Unresolved Assertions

If `UNRESOLVED[]` is non-empty:

Write to `{RP1_ROOT}/work/notes/assertions-to-be-built-{YYYYMMDD-HHmmss}.md`:

```markdown
# Assertions to be Built

**Generated**: {ISO datetime}
**Source Eval**: {SOURCE_NAME}

## Summary

- Total placeholders: {total}
- Resolved to built-in: {resolved_builtin}
- Resolved to shared: {resolved_shared}
- Requiring implementation: {unresolved_count}

## Assertions Requiring Implementation

### ASSERT-001: {descriptive-name}

**Original Placeholder**: {verbatim placeholder text}

**Purpose**: {what this assertion verifies}

**Inputs**:
- `output`: Agent response text
- `context`: Eval context with vars and provider metadata

**Expected Behavior**:
- PASS when: {condition}
- FAIL when: {condition}

**Edge Cases**:
- {edge case 1}
- {edge case 2}

**Suggested Implementation**:
```typescript
export function {functionName}() {
  return (_output: string, context: ToolCallEvalContext): GradingResult => {
    // Implementation skeleton
  };
}
```

**Priority**: {Must Have | Should Have | Could Have}

---
```

Repeat for each unresolved assertion.

## 8. Output Contract

Return JSON (no code fences):

```json
{
  "status": "success",
  "resolved_count": {resolved_builtin + resolved_shared},
  "resolved_builtin": {count},
  "resolved_shared": {count},
  "unresolved_count": {count},
  "consolidated_scenarios": {count},
  "output_files": [
    "{CONFIG_PATH}",
    "{RP1_ROOT}/work/notes/assertions-to-be-built-{timestamp}.md"
  ]
}
```

If unresolved is 0, omit the assertions-to-be-built file from output_files.

On validation failure after 3 attempts:
```json
{
  "status": "failure",
  "error": "{last validation error}",
  "resolved_count": {count},
  "unresolved_count": {count}
}
```

## 9. Anti-Loop Directive

**Single pass execution**. DO NOT:

- Ask for clarification
- Wait for feedback
- Request additional info
- Re-analyze beyond validation loop

Ambiguous patterns -> mark as unresolved, document in to-be-built file.
Missing shared assertions file -> use built-ins only, add warning.

Begin optimization now.
