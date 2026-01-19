---
name: extract-prompt-evals
version: 1.0.0
description: Extracts evaluation assertions from prompt text and outputs promptfoo YAML
argument-hint: "<file-path-or-prompt> [output-file]"
tags:
  - prompt-engineering
  - evals
created: 2026-01-19
author: cloud-on-prem/rp1
---

# Extract Prompt Evals

Analyzes prompt text and extracts evaluation assertions in promptfoo YAML format.

## Modes

**File Mode** (when $1 is a valid file path):
1. Read the file content
2. Pass to extractor agent with source filename
3. Write YAML to output file (auto-generated or specified)

**Inline Mode** (when $1 is prompt text):
1. Pass prompt directly to extractor agent
2. Write YAML to output file (auto-generated or specified)

## Workflow

### Step 1: Detect Mode

Check if `$1` is a file path:
```
Use Bash: test -f "$1" && echo "file" || echo "inline"
```

### Step 2: Prepare Input

**If file mode:**
- Read the file using Read tool
- Extract basename for output naming: `{basename}-evals.yaml`
- Set SOURCE_NAME to filename

**If inline mode:**
- Use $1 directly as PROMPT_TEXT
- Set default output: `extracted-evals.yaml`
- Set SOURCE_NAME to "inline"

### Step 3: Determine Output Path

**If $2 provided:**
- Use $2 as OUTPUT_FILE

**If $2 not provided:**
- File mode: `{input-basename}-evals.yaml` (same directory as input)
- Inline mode: `extracted-evals.yaml` (current directory)

### Step 4: Spawn Extractor Agent

Use the Task tool:
```
subagent_type: rp1-utils:prompt-eval-extractor
prompt: |
  $1: {PROMPT_TEXT content}
  $2: {SOURCE_NAME}
```

The agent outputs pure YAML directly (no delimiters).

### Step 5: Write Output

1. Capture agent output (raw YAML)
2. Check if OUTPUT_FILE exists - if so, warn about overwrite
3. Use Write tool to save YAML to OUTPUT_FILE

### Step 6: Validate YAML

**Validation Loop** (max 3 attempts):

1. Validate the written YAML file:
   ```bash
   bun -e "import { readFileSync } from 'fs'; import { parse } from 'yaml'; parse(readFileSync(process.argv[1], 'utf8'))" {OUTPUT_FILE}
   ```

2. **If validation succeeds** (exit code 0):
   - Display confirmation to user:
     ```
     Extracted evals written to: {OUTPUT_FILE}

     Review the file and refine TODO placeholders for your eval infrastructure.
     ```
   - Complete successfully

3. **If validation fails** (exit code non-zero):
   - Capture the error message from stderr
   - Re-spawn the extractor agent with the error context:
     ```
     subagent_type: rp1-utils:prompt-eval-extractor
     prompt: |
       $1: {PROMPT_TEXT content}
       $2: {SOURCE_NAME}

       YAML FIX REQUIRED:
       The previous output failed YAML validation with error:
       {captured_error}

       Generate corrected YAML that fixes this syntax error.
     ```
   - Write the corrected output to OUTPUT_FILE
   - Increment attempt counter and retry validation

4. **If max attempts (3) reached without valid YAML**:
   - Display error:
     ```
     Error: Failed to generate valid YAML after 3 attempts.
     Last validation error: {captured_error}

     The output file may contain invalid YAML. Manual correction required.
     ```

## Error Handling

**Empty input ($1 not provided):**
```
Usage: /extract-prompt-evals <file-path-or-prompt> [output-file]

  <file-path-or-prompt>  Path to prompt file OR raw prompt text
  [output-file]          Optional output path (auto-generated if omitted)

Examples:
  /extract-prompt-evals plugins/dev/agents/task-builder.md
  /extract-prompt-evals "Create a branch and commit changes"
  /extract-prompt-evals my-prompt.md evals/suites/my-eval/config.yaml
```

**Invalid file path (file mode detected but read fails):**
```
Error: Could not read file: {path}
```

## Examples

**File mode with auto-generated output:**
```bash
/extract-prompt-evals plugins/dev/agents/task-builder.md
```
Output: Creates `plugins/dev/agents/task-builder-evals.yaml`

**File mode with explicit output:**
```bash
/extract-prompt-evals plugins/dev/agents/task-builder.md evals/suites/rp1-dev/task-builder/config.yaml
```
Output: Creates `evals/suites/rp1-dev/task-builder/config.yaml`

**Inline mode:**
```bash
/extract-prompt-evals "Create a new branch, make changes, then commit with a descriptive message"
```
Output: Creates `extracted-evals.yaml` in current directory
