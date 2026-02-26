---
name: build-prompt-evals
description: "Builds eval assertions and minimal test prompt from prompt text, then optimizes assertions via specialist agent."
metadata:
  version: 1.1.0
  tags:
    - prompt-engineering
    - evals
  created: 2026-01-19
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  argument-hint: "<file-or-prompt> [--output <dir>]"
---

# Build Prompt Evals

Generate eval assertions (YAML) and test invocation prompt from source prompt. Extracts assertions, then runs assertion specialist to resolve placeholders, consolidate scenarios, and document unresolved assertions.

## Parameters

Extract these parameters from the user's input:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `INPUT` | Yes | - | File path to a prompt file, or raw prompt text |
| `OUTPUT_DIR` | No | input file dir or cwd | Output directory for generated files. Set if user provides `--output <dir>` |

## Modes

**File Mode** (when INPUT is a valid file path):
1. Read the file content
2. Use basename for output naming
3. Spawn extractor agent, then assertion specialist

**Inline Mode** (when INPUT is prompt text):
1. Use prompt directly
2. Use "extracted" as basename
3. Spawn extractor agent, then assertion specialist

## Workflow

### Step 1: Parse Arguments

Check for `--output` flag in arguments:
- If present: extract output directory path
- If not: use input file directory (file mode) or cwd (inline mode)

### Step 2: Detect Mode

Check if first non-flag argument is a file path:
```
Use Bash: test -f "{INPUT}" && echo "file" || echo "inline"
```

### Step 2.5: Dependency Analysis (File Mode Only)

**If file mode:**

Spawn dependency-chain-analyzer to discover sub-agent and skill dependencies:
```
subagent_type: rp1-utils:dependency-chain-analyzer
prompt: |
  $1: {INPUT file path}
```

Capture JSON output as DEPENDENCY_CHAIN variable.

**If inline mode:**

Set DEPENDENCY_CHAIN to empty string (no file to analyze for dependencies).

### Step 3: Prepare Input

**If file mode:**
- Read the file using Read tool
- Extract basename (without extension) for output naming
- Set SOURCE_NAME to filename
- Set OUTPUT_DIR to file's directory (unless --output specified)

**If inline mode:**
- Use INPUT directly as PROMPT_TEXT
- Set SOURCE_NAME to "inline"
- Set basename to "extracted"
- Set OUTPUT_DIR to cwd (unless --output specified)

### Step 4: Determine Output Paths

```
OUTPUT_YAML = {OUTPUT_DIR}/{basename}-evals.yaml
OUTPUT_PROMPT = {OUTPUT_DIR}/{basename}-eval-prompt.txt
```

### Step 5: Spawn Extractor Agent

Single agent generates both YAML assertions and test prompt:

```
subagent_type: rp1-utils:prompt-eval-extractor
prompt: |
  $1: {PROMPT_TEXT content}
  $2: {SOURCE_NAME}
  $3: {OUTPUT_YAML}
  $4: {DEPENDENCY_CHAIN JSON or empty string}
  $5: {OUTPUT_PROMPT}
```

### Step 6: Extraction Complete (Intermediate)

Log extraction completion:
```
Extraction complete. Running assertion optimization...
```

### Step 7: Spawn Assertion Specialist

Resolve RP1_ROOT from git root:
```bash
RP1_ROOT="$(git rev-parse --show-toplevel)/.rp1"
```

Invoke assertion specialist to optimize the generated eval config:

```
subagent_type: rp1-utils:prompt-assertion-specialist
prompt: |
  $1: {OUTPUT_YAML}
```

Capture JSON output as ASSERTION_RESULT variable.

### Step 8: Report Completion

Display output locations and optimization summary:
```
Eval files generated:
  Assertions: {OUTPUT_YAML}
  Test prompt: {OUTPUT_PROMPT}

Assertion optimization:
  Resolved: {ASSERTION_RESULT.resolved_count} ({ASSERTION_RESULT.resolved_builtin} built-in, {ASSERTION_RESULT.resolved_shared} shared)
  Unresolved: {ASSERTION_RESULT.unresolved_count}
  Consolidated scenarios: {ASSERTION_RESULT.consolidated_scenarios}

{If ASSERTION_RESULT.unresolved_count > 0:}
  See: {ASSERTION_RESULT.output_files[1]} for assertions requiring implementation.

Review the assertions file for any remaining TODO placeholders.
```

## Error Handling

**Empty input (INPUT not provided):**
```
Usage: /build-prompt-evals <file-or-prompt> [--output <dir>]

  <file-or-prompt>  Path to command/agent prompt file OR raw prompt text
  [--output <dir>]  Optional output directory (default: input file dir or cwd)

Outputs:
  {basename}-evals.yaml       Eval assertions in promptfoo format
  {basename}-eval-prompt.txt  Test invocation prompt (user input to test the command)

Examples:
  /build-prompt-evals plugins/dev/skills/build-fast/SKILL.md
  /build-prompt-evals plugins/dev/skills/build-fast/SKILL.md --output evals/suites/rp1-dev/
  /build-prompt-evals "Create a branch and commit changes"
```

**Invalid file path (file mode detected but read fails):**
```
Error: Could not read file: {path}
```

**Output directory does not exist:**
```
Error: Output directory does not exist: {path}
```

## Examples

**File mode with auto output location:**
```bash
/build-prompt-evals plugins/dev/skills/build-fast/SKILL.md
```
Creates in same directory:
- `plugins/dev/skills/build-fast/build-fast-evals.yaml`
- `plugins/dev/skills/build-fast/build-fast-eval-prompt.txt`

**File mode with explicit output directory:**
```bash
/build-prompt-evals plugins/dev/skills/build-fast/SKILL.md --output evals/suites/rp1-dev/
```
Creates in specified directory:
- `evals/suites/rp1-dev/build-fast-evals.yaml`
- `evals/suites/rp1-dev/build-fast-eval-prompt.txt`

**Inline mode:**
```bash
/build-prompt-evals "Create a new branch, make changes, then commit"
```
Creates in current directory:
- `extracted-evals.yaml`
- `extracted-eval-prompt.txt`
