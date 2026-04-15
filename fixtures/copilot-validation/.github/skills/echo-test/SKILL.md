---
name: echo-test
description: "Validates skill invocation, parameter passing, and shell execution on Copilot CLI"
---

# Echo Test Skill

You are a validation skill for testing Copilot CLI harness primitives. Execute each step below and report results.

## Parameters

This skill accepts two parameters from the user's invocation text:

- **MESSAGE**: The message to echo back (required)
- **FORMAT**: Output format -- "plain" or "json" (optional, defaults to "plain")

Parse these from the user's slash command invocation. For example:
- `/echo-test "hello world"` -> MESSAGE="hello world", FORMAT="plain"
- `/echo-test "hello world" json` -> MESSAGE="hello world", FORMAT="json"

If MESSAGE is missing, respond with: `[FIXTURE] Error: MESSAGE parameter is required. Usage: /echo-test <message> [format]`

## Step 1: Parameter Echo

Report the parsed parameters:

```
[FIXTURE] Parameters received:
  MESSAGE: <parsed message>
  FORMAT: <parsed format>
```

## Step 2: Shell Execution

Run the following shell command to verify Bash tool access:

```bash
echo "[FIXTURE] Shell execution working -- $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Report the output.

## Step 3: File System Operations

1. **Read**: Read the file `.rp1/context/index.md` and confirm it contains "Copilot Validation Fixture"
2. **Write**: Write the following content to `.rp1/work/echo-test-output.md`:

```markdown
# Echo Test Output

- Message: <MESSAGE>
- Format: <FORMAT>
- Timestamp: <current UTC time>
- Status: PASS
```

3. **Search**: Use file search to find all `.md` files in `.rp1/context/`
4. **Edit**: Append a line to `.rp1/work/echo-test-output.md` with `- Verified: true`

Report each operation as PASS or FAIL.

## Step 4: rp1 Agent Tools

Run the following command to verify rp1 CLI integration:

```bash
rp1 agent-tools rp1-root-dir
```

Report whether the command executes successfully and returns valid JSON.

## Step 5: Summary

Output a summary in the requested FORMAT:

**Plain format**:
```
[FIXTURE] Echo Test Complete
  Parameters: PASS/FAIL
  Shell: PASS/FAIL
  File Read: PASS/FAIL
  File Write: PASS/FAIL
  File Search: PASS/FAIL
  File Edit: PASS/FAIL
  Agent Tools: PASS/FAIL
```

**JSON format**:
```json
{
  "fixture": "echo-test",
  "results": {
    "parameters": "PASS|FAIL",
    "shell": "PASS|FAIL",
    "file_read": "PASS|FAIL",
    "file_write": "PASS|FAIL",
    "file_search": "PASS|FAIL",
    "file_edit": "PASS|FAIL",
    "agent_tools": "PASS|FAIL"
  }
}
```
