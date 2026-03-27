---
name: tersify-prompt
description: Rewrites agent-instruction prompts to be maximally terse while preserving full intent.
metadata:
  version: 1.0.0
  tags:
    - prompt-engineering
    - refactoring
  created: 2025-12-21
  author: cloud-on-prem/rp1
  argument-hint: "<input>"
---

# Tersify Prompt

Compresses agent-instruction prompts to be maximally terse while preserving full intent.

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --schema-path plugins/utils/skills/tersify-prompt/SKILL.md --args "{raw arguments from user invocation}"
```

Parse the JSON response. Extract values from `data.arguments`:

| Variable | Source |
|----------|--------|
| INPUT | `data.arguments.INPUT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

## Modes

**File Mode** (when INPUT is a valid file path):
1. Read the file content
2. Pass to tersifier agent
3. Extract compressed prompt from output
4. Update the file with compressed version
5. Display change summary

**Inline Mode** (when INPUT is prompt text):
1. Pass prompt directly to tersifier agent
2. Display compressed prompt and change log

## Workflow

### Step 1: Detect Mode

Check if INPUT is a file path:
```
Use Bash: test -f "{INPUT}" && echo "file" || echo "inline"
```

### Step 2: Prepare Input

**If file mode:**
- Read the file using Read tool
- Store the file path for later update
- Extract file content as INPUT_PROMPT

**If inline mode:**
- Use INPUT directly as INPUT_PROMPT

### Step 3: Spawn Tersifier Agent

Task tool:
subagent_type: rp1-utils:prompt-tersifier
prompt:
{INPUT_PROMPT content here}

### Step 4: Process Output

The agent returns output in this format:
```
<<<COMPRESSED_PROMPT
[compressed content]
COMPRESSED_PROMPT>>>

<<<CHANGES
[op] ref: description
  - from: "short excerpt"
  - to: "short excerpt"
  - note: reason

[op] ref: description
  ...
CHANGES>>>
```

**Parse the output:**
- Extract content between `<<<COMPRESSED_PROMPT` and `COMPRESSED_PROMPT>>>`
- Extract the changes list between `<<<CHANGES` and `CHANGES>>>`

### Step 5: Finalize

**If file mode:**
1. Use Write tool to update the original file with the compressed prompt
2. Display to user:
   ```
   Updated: {file_path}

   ## Changes Made
   {changes table}
   ```

**If inline mode:**
1. Display to user:
   ```
   ## Compressed Prompt
   {compressed prompt}

   ## Changes Made
   {changes table}
   ```

## Examples

**File mode:**
```bash
/tersify-prompt plugins/base/agents/kb-spatial-analyzer.md
```
Output: Updates file in place, shows change summary.

**Inline mode:**
```bash
/tersify-prompt "You are a helpful assistant that helps users write code. Always be polite and thorough in your responses. Make sure to explain your reasoning step by step."
```
Output: Displays compressed prompt and change log.