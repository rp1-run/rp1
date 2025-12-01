# code-investigate

Systematic bug investigation through evidence-based analysis and hypothesis testing.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:code-investigate
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-investigate
    ```

## Description

The `code-investigate` command performs systematic investigation of bugs and issues. It follows an evidence-based approach: gathering information, forming hypotheses, testing them, and documenting findings without making permanent code changes.

## Investigation Process

1. **Evidence Gathering** - Collect logs, reproduction steps, symptoms
2. **Hypothesis Formation** - Identify potential root causes
3. **Testing** - Validate hypotheses through analysis and experiments
4. **Documentation** - Record findings and recommendations

## Output

**Location:** `.rp1/work/investigation-report.md`

**Contents:**

- Problem statement
- Evidence collected
- Hypotheses tested
- Root cause analysis
- Recommended fix
- Prevention suggestions

## Examples

### Investigate an Issue

=== "Claude Code"

    ```bash
    /rp1-dev:code-investigate
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-investigate
    ```

The command will prompt you for:

- Bug description or symptoms
- Reproduction steps (if known)
- Relevant error messages or logs

**Example output:**
```
✅ Investigation Complete

Root Cause: Race condition in async handler

Evidence:
- Error occurs only under load
- Stack trace shows concurrent access
- Found unsynchronized shared state

Recommended Fix:
Add mutex to protect shared state in src/handlers/queue.ts:45

Report: .rp1/work/investigation-report.md
```

## Related Commands

- [`code-check`](code-check.md) - Run tests after fixing
- [`code-audit`](code-audit.md) - Find similar issues
