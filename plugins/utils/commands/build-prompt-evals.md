---
name: build-prompt-evals
version: 1.0.0
description: Builds eval assertions and minimal test prompt from prompt text
argument-hint: "<file-or-prompt> [--output <dir>]"
tags:
  - prompt-engineering
  - evals
created: 2026-01-19
author: cloud-on-prem/rp1
---

# Build Prompt Evals

Generate both eval assertions (YAML) and minimal test prompt from source prompt. Spawns extractor and prompt-writer agents in parallel.

## Modes

**File Mode** (when $1 is a valid file path):
1. Read the file content
2. Use basename for output naming
3. Spawn both agents with file content

**Inline Mode** (when $1 is prompt text):
1. Use prompt directly
2. Use "extracted" as basename
3. Spawn both agents with inline text

## Workflow

### Step 1: Parse Arguments

Check for `--output` flag in arguments:
- If present: extract output directory path
- If not: use input file directory (file mode) or cwd (inline mode)

### Step 2: Detect Mode

Check if first non-flag argument is a file path:
```
Use Bash: test -f "$1" && echo "file" || echo "inline"
```

### Step 3: Prepare Input

**If file mode:**
- Read the file using Read tool
- Extract basename (without extension) for output naming
- Set SOURCE_NAME to filename
- Set OUTPUT_DIR to file's directory (unless --output specified)

**If inline mode:**
- Use $1 directly as PROMPT_TEXT
- Set SOURCE_NAME to "inline"
- Set basename to "extracted"
- Set OUTPUT_DIR to cwd (unless --output specified)

### Step 4: Determine Output Paths

```
OUTPUT_YAML = {OUTPUT_DIR}/{basename}-evals.yaml
OUTPUT_PROMPT = {OUTPUT_DIR}/{basename}-eval-prompt.txt
```

### Step 5: Spawn Agents in Parallel

Both agents execute simultaneously (no dependencies):

**Agent 1 - Extractor:**
```
subagent_type: rp1-utils:prompt-eval-extractor
prompt: |
  $1: {PROMPT_TEXT content}
  $2: {SOURCE_NAME}
  $3: {OUTPUT_YAML}
```

**Agent 2 - Prompt Writer:**
```
subagent_type: rp1-utils:eval-prompt-writer
prompt: |
  $1: {PROMPT_TEXT content}
  $2: {SOURCE_NAME}
  $3: {OUTPUT_PROMPT}
```

### Step 6: Report Completion

Display output locations:
```
Eval files generated:
  Assertions: {OUTPUT_YAML}
  Test prompt: {OUTPUT_PROMPT}

Review the assertions file and refine TODO placeholders as needed.
```

## Error Handling

**Empty input ($1 not provided):**
```
Usage: /build-prompt-evals <file-or-prompt> [--output <dir>]

  <file-or-prompt>  Path to command/agent prompt file OR raw prompt text
  [--output <dir>]  Optional output directory (default: input file dir or cwd)

Outputs:
  {basename}-evals.yaml       Eval assertions in promptfoo format
  {basename}-eval-prompt.txt  Test invocation prompt (user input to test the command)

Examples:
  /build-prompt-evals plugins/dev/commands/build-fast.md
  /build-prompt-evals plugins/dev/commands/build-fast.md --output evals/suites/rp1-dev/
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
/build-prompt-evals plugins/dev/commands/build-fast.md
```
Creates in same directory:
- `plugins/dev/commands/build-fast-evals.yaml`
- `plugins/dev/commands/build-fast-eval-prompt.txt`

**File mode with explicit output directory:**
```bash
/build-prompt-evals plugins/dev/commands/build-fast.md --output evals/suites/rp1-dev/
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
