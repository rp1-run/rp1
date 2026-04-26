---
name: code-investigate
description: "Systematic investigation of bugs and issues to identify root causes through evidence-based analysis, hypothesis testing, and comprehensive documentation without permanent code changes."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: investigation
  is_workflow: false
  version: 2.1.0
  tags:
    - analysis
    - code
    - core
  created: 2025-10-25
  updated: 2026-04-11
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-dev:bug-investigator"
  arguments:
    - name: PROBLEM_STATEMENT
      type: string
      required: true
      variadic: true
      description: "Freeform bug description, symptoms, logs, and reproduction context"
    - name: ISSUE_ID
      type: string
      required: false
      default: ""
      description: "Optional issue identifier slug for workspace and artifact paths"
---

# Root Cause Investigator

This command invokes the **bug-investigator** sub-agent for systematic issue analysis of the provided problem statement.

Before invoking the sub-agent or registering artifacts, derive `EFFECTIVE_ISSUE_ID`:
- If `ISSUE_ID` is non-empty, use it unchanged.
- Otherwise derive a deterministic lowercase kebab-case slug from `PROBLEM_STATEMENT`.
- Collapse repeated separators, trim leading/trailing `-`, and if the slug would be empty use `investigation`.

Use `EFFECTIVE_ISSUE_ID` consistently for workspace paths, report paths, and agent inputs.

**First emit**: Generate `RUN_ID` as a UUID. Derive `RUN_NAME` from the problem statement: a brief summary (max 60 chars) prefixed with `"Investigate: "`.

On session start, emit the status change:
```bash
rp1 agent-tools emit \
  --workflow code-investigate \
  --type status_change \
  --run-id {RUN_ID} \
  --name "Investigate: {brief summary}" \
  --step investigating \
  --data '{"status": "running"}'
```

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> investigating
    investigating --> [*] : done
```

Invoke the bug-investigator agent with the freeform problem statement and derived issue id:

{% dispatch_agent "rp1-dev:bug-investigator" %}
PROBLEM_STATEMENT={PROBLEM_STATEMENT}, ISSUE_ID={EFFECTIVE_ISSUE_ID}
{% enddispatch_agent %}

The agent will:
- Analyze problem statement and gather context
- Form and test hypotheses systematically
- Add temporary debugging (tracked and reverted)
- Trace code execution paths
- Identify root cause with evidence
- Generate comprehensive investigation report
- Propose solutions with effort estimates
- Report back with findings

Emit `btw_update` events for key findings during the investigation:
```bash
rp1 agent-tools emit \
  --workflow code-investigate \
  --type btw_update \
  --run-id {RUN_ID} \
  --data '{"message": "{finding summary}"}'
```

After the agent writes the investigation report, register it as an artifact:
```bash
rp1 agent-tools emit \
  --workflow code-investigate \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step investigating \
  --data '{"path": "issues/{EFFECTIVE_ISSUE_ID}/investigation_report.md", "storageRoot": "work_dir", "format": "markdown"}'
```

On completion, mark the step as completed with `--close-run`:
```bash
rp1 agent-tools emit \
  --workflow code-investigate \
  --type status_change \
  --run-id {RUN_ID} \
  --step investigating \
  --close-run \
  --data '{"status": "completed"}'
```
