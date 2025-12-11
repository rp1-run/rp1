# Mermaid Validation Script

Helper script for validating Mermaid diagrams with comprehensive error reporting and structured JSON output.

## validate_mermaid.sh

A validation script that can validate:
- Single Mermaid diagram strings from stdin
- Single Mermaid diagram files (.mmd, .mermaid)
- Markdown files with embedded Mermaid diagrams (.md)

### Usage

```bash
# Basic usage
./validate_mermaid.sh [OPTIONS] <file.mmd|file.md>
echo 'diagram' | ./validate_mermaid.sh [OPTIONS]
./validate_mermaid.sh [OPTIONS] <<< 'diagram'

# Options
--json, -j    Output results in structured JSON format
-h, --help    Show help message
```

**Validate from stdin (recommended for inline diagrams):**
```bash
echo "flowchart TD; A-->B" | ./validate_mermaid.sh
```

**Validate from heredoc:**
```bash
./validate_mermaid.sh <<'EOF'
flowchart LR
    A[Start] --> B[End]
EOF
```

**Validate a single .mmd file:**
```bash
./validate_mermaid.sh diagram.mmd
```

**Validate all diagrams in a markdown file:**
```bash
./validate_mermaid.sh document.md
```

### Output Modes

The script supports two output modes:

| Mode | Flag | Description |
|------|------|-------------|
| Text (default) | none | Colored output with PASS/FAIL indicators |
| JSON | `--json` or `-j` | Structured JSON with error details and categories |

### JSON Output Format

When using `--json` or `-j`, the script outputs structured JSON for programmatic use.

**Single diagram (valid):**
```json
{
  "valid": true,
  "diagram_index": 1,
  "markdown_line": 0
}
```

**Single diagram (invalid):**
```json
{
  "valid": false,
  "diagram_index": 1,
  "markdown_line": 0,
  "error": {
    "raw": "Parse error on line 1: Unexpected token",
    "line": 1,
    "category": "ARROW_SYNTAX",
    "context": "A -> B"
  }
}
```

**Markdown file with multiple diagrams:**
```json
[
  {
    "valid": true,
    "diagram_index": 1,
    "markdown_line": 10
  },
  {
    "valid": false,
    "diagram_index": 2,
    "markdown_line": 25,
    "error": {
      "raw": "Parse error on line 3",
      "line": 3,
      "category": "NODE_SYNTAX",
      "context": "B[Unclosed bracket"
    }
  }
]
```

**JSON fields:**

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | Whether the diagram passed validation |
| `diagram_index` | number | 1-based index of the diagram (within file or 1 for stdin) |
| `markdown_line` | number | Line number where the diagram block starts in markdown (0 for stdin/single files) |
| `error.raw` | string | Full error message from mermaid-cli |
| `error.line` | number/null | Line number within the diagram where error occurred |
| `error.category` | string | Detected error category (see below) |
| `error.context` | string | Code snippet showing the problematic syntax |

### Error Categories

The script automatically detects and categorizes errors into one of seven categories:

| Category | Description | Common Causes |
|----------|-------------|---------------|
| `ARROW_SYNTAX` | Invalid arrow syntax | Using `->` instead of `-->`, wrong arrow type for diagram |
| `QUOTE_ERROR` | String/quote issues | Unquoted labels with special characters, unterminated strings |
| `CARDINALITY` | ER relationship errors | Invalid cardinality notation in erDiagram |
| `LINE_BREAK` | Line structure issues | Missing newlines, multiple statements on one line |
| `DIAGRAM_TYPE` | Invalid diagram type | Misspelled or unknown diagram declaration |
| `NODE_SYNTAX` | Malformed nodes | Unclosed brackets, unbalanced braces/parentheses |
| `UNKNOWN` | Unrecognized error | Error does not match known patterns |

### Features

- Two output modes: colored text (default) or structured JSON
- Automatic error category detection for guided repair
- Line number extraction from mermaid-cli errors
- Counts total diagrams and failed validations
- Supports multiple input formats (stdin, .mmd, .md)
- Exit code 0 on success, 1 on failure
- Automatic cleanup of temporary files

### Requirements

- Node.js and npx (for @mermaid-js/mermaid-cli)
- Bash 4.0+

### Examples

**Example 1: Valid diagram with text output**
```bash
$ echo "flowchart TD; A-->B" | ./validate_mermaid.sh
PASS stdin: Valid
```

**Example 2: Valid diagram with JSON output**
```bash
$ echo "flowchart TD; A-->B" | ./validate_mermaid.sh --json
{
  "valid": true,
  "diagram_index": 1,
  "markdown_line": 0
}
```

**Example 3: Invalid diagram with text output**
```bash
$ echo "flowchart TD; A<-!->B" | ./validate_mermaid.sh
FAIL stdin: Invalid
  Category: ARROW_SYNTAX
  Error Line: 1
  Error: Parse error on line 1...
```

**Example 4: Invalid diagram with JSON output**
```bash
$ echo "stateDiagram-v2; A -> B" | ./validate_mermaid.sh -j
{
  "valid": false,
  "diagram_index": 1,
  "markdown_line": 0,
  "error": {
    "raw": "Parse error on line 1...",
    "line": 1,
    "category": "ARROW_SYNTAX",
    "context": "A -> B"
  }
}
```

**Example 5: Markdown file with text output**
```bash
$ ./validate_mermaid.sh examples.md
Validating Mermaid diagrams in: examples.md

PASS Diagram 1 (line 10): Valid

PASS Diagram 2 (line 25): Valid

FAIL Diagram 3 (line 45): Invalid
  Category: NODE_SYNTAX
  Error Line: 2
  Error: Parse error on line 2

================================
Validation Summary
================================
Total:  3
Passed: 2
Failed: 1
================================
```

**Example 6: Markdown file with JSON output**
```bash
$ ./validate_mermaid.sh --json examples.md
[
  {"valid": true, "diagram_index": 1, "markdown_line": 10},
  {"valid": true, "diagram_index": 2, "markdown_line": 25},
  {"valid": false, "diagram_index": 3, "markdown_line": 45, "error": {...}}
]
```

## Integration with Claude Code

The script is designed to be called from the Mermaid skill and mermaid-fixer agent:

**Text mode (for human-readable output):**
```bash
echo 'flowchart TD
    A --> B' | plugins/base/skills/mermaid/scripts/validate_mermaid.sh
```

**JSON mode (for programmatic repair workflows):**
```bash
echo 'flowchart TD
    A --> B' | plugins/base/skills/mermaid/scripts/validate_mermaid.sh --json
```

Or with heredoc for multi-line diagrams:
```bash
plugins/base/skills/mermaid/scripts/validate_mermaid.sh --json <<'EOF'
sequenceDiagram
    Alice->>Bob: Hello
    Bob->>Alice: Hi
EOF
```

## Error Handling

The script provides detailed error messages from mermaid-cli, including:
- Line number where the error occurred
- The specific syntax that caused the error
- Expected tokens vs. what was found
- Automatic categorization for guided repair

In JSON mode, all error details are structured for programmatic access:
```json
{
  "error": {
    "raw": "Full error message from mermaid-cli",
    "line": 3,
    "category": "ARROW_SYNTAX",
    "context": "A -> B"
  }
}
```

## Performance

- Single diagrams validate in ~2-5 seconds
- Markdown files with multiple diagrams validate sequentially
- Temporary files are automatically cleaned up after validation
- Uses `-q` (quiet) flag to suppress unnecessary mermaid-cli output

## Related Documentation

- [SKILL.md](../SKILL.md) - Main mermaid skill documentation
- [EXAMPLES.md](../EXAMPLES.md) - Error patterns and fix examples
- [reference.md](../reference.md) - Mermaid syntax reference
