# YAML Validation

Logic for validating generated YAML and handling errors through retry loop.

## 1. Validation Loop

```
Write YAML -> Validate -> Pass? -> Done
                  |
                  v (fail)
            Re-extract with error context
                  |
                  v
            Attempt N+1 (max 3)
```

### Steps

1. Write YAML to output file
2. Run validation script
3. If valid: complete
4. If invalid: re-extract with error context
5. Max 3 attempts total

## 2. Validation Script

**Location**: `scripts/validate-yaml.ts`

**Recommended Usage** (inline, no external deps):
```bash
cd {repo_root}/cli && bun -e "
import {parse} from 'yaml';
import {readFileSync} from 'fs';
const file = '{output_file}';
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

**Alternative** (using script file - must cd to cli first):
```bash
cd {repo_root}/cli && bun {skill_path}/scripts/validate-yaml.ts {output_file}
```

**Output** (JSON to stdout):
- Success: `{ "valid": true }`
- Failure: `{ "valid": false, "error": "error message" }`

**Exit codes**:
- 0: Valid YAML
- 1: Invalid YAML or error

**Note**: Validation requires the `yaml` package from `cli/node_modules`. Always run from cli directory.

## 3. Error Handling

### Common YAML Errors

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `unexpected end of stream` | Unclosed quotes/braces | Check string delimiters |
| `bad indentation` | Mixed tabs/spaces | Use 2-space indent |
| `mapping values are not allowed` | Missing space after colon | `key: value` not `key:value` |
| `duplicate key` | Same key twice | Remove duplicate |
| `expected single document` | Multiple `---` markers | Single document only |

### Re-extraction Prompt

On validation failure, include in re-extraction context:

```
Previous YAML validation failed:
Error: {error_message}

Re-extract assertions, ensuring:
1. Valid YAML syntax
2. Proper indentation (2 spaces)
3. Quoted strings with special characters
4. No trailing whitespace
5. Multiline strings use | operator

Previous problematic output:
{previous_yaml_snippet}
```

## 4. Validation Checklist

Before writing YAML:

- [ ] No code fences (```) wrapping content
- [ ] No markdown headers within YAML
- [ ] All strings with `:`, `#`, `*`, `?`, `[`, `]`, `{`, `}` are quoted
- [ ] Consistent 2-space indentation
- [ ] Multiline JavaScript uses `|` operator
- [ ] No tabs
- [ ] No trailing whitespace

## 5. Edge Cases

### Special Characters in Values

```yaml
# BAD
- type: contains
  value: pattern: test*

# GOOD
- type: contains
  value: "pattern: test*"
```

### Multiline JavaScript

```yaml
# BAD (no pipe)
- type: javascript
  value: (output, context) => {
    return { pass: true };
  }

# GOOD (with pipe)
- type: javascript
  value: |
    (output, context) => {
      return { pass: true };
    }
```

### Template Variables

promptfoo uses double braces `{{VAR}}` - these should NOT be escaped in YAML.

```yaml
# CORRECT
prompts:
  - "{{PROMPT_CONTENT}}"
```

## 6. Max Attempts Policy

| Attempt | Action |
|---------|--------|
| 1 | Initial extraction |
| 2 | Re-extract with error context |
| 3 | Final attempt with simplified output |

After 3 failed attempts:
- Report failure with last error
- Output partial YAML with error annotation
- Recommend manual review

## 7. Script Integration

Agent workflow for validation:

```markdown
1. Generate YAML per TEMPLATES.md
2. Write to {OUTPUT_FILE}
3. Determine repo root (use git rev-parse --show-toplevel)
4. Run validation from cli directory:
   cd {repo_root}/cli && bun -e "import {parse} from 'yaml'; import {readFileSync} from 'fs'; try { parse(readFileSync('{OUTPUT_FILE}','utf8')); console.log(JSON.stringify({valid:true})) } catch(e) { console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1) }"
5. Parse JSON result from stdout
6. If valid: complete
7. If invalid + attempts < 3: re-extract with error
8. If invalid + attempts >= 3: report failure
```
