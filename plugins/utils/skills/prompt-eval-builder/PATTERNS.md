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

## 6. Prompt Distillation Rules

For creating minimal eval prompts from full prompts.

### Preserve

| Element | Why |
|---------|-----|
| Core action/intent | Primary behavior to test |
| Required parameters | Input contract |
| Critical constraints | MUST/MUST NOT |
| Tool requirements | Expected tool usage |
| Output format spec | Validation target |

### Remove

| Element | Why |
|---------|-----|
| Verbose explanations | Noise for eval |
| Inline examples | Not needed for execution |
| Meta-commentary | "This section describes..." |
| Background context | History, rationale |
| Optional behaviors | Focus on required path |
| Pleasantries | "Please kindly..." |
| Redundant statements | Covered elsewhere |

### Compress

| Original | Compressed |
|----------|------------|
| "You should first X, then Y" | "1. X 2. Y" |
| "In the case that..." | "If:" |
| "Make sure to..." | (remove - implicit) |
| "It is important that..." | (remove - state directly) |
| Long conditionals | Terse if/then |

### Distillation Process

1. **Extract core intent**: What MUST the agent do?
2. **Identify required inputs**: What params are needed?
3. **List constraints**: What MUST NOT happen?
4. **Specify output**: What format/content is expected?
5. **Strip everything else**: If not in above, remove
6. **Verify completeness**: Can assertions be tested with this prompt?

### Target Size

| Original Size | Target |
|---------------|--------|
| < 100 lines | 20-30% |
| 100-300 lines | 15-25% |
| > 300 lines | 10-20% |

Minimal prompt should be sufficient to trigger all extracted assertions.
