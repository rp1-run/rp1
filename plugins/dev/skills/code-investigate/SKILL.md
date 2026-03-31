---
name: code-investigate
description: "Investigates bugs and unexpected behavior by forming hypotheses, tracing execution paths, and identifying root causes with evidence. Produces an investigation report with root cause analysis and proposed fixes. Use when debugging a bug, diagnosing an error, investigating unexpected behavior, tracing a failure, or performing root cause analysis."
metadata:
  version: 2.0.0
  tags:
    - analysis
    - code
    - core
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-dev:bug-investigator"
---

# Root Cause Investigator

Dispatches the **bug-investigator** sub-agent for systematic issue analysis. All debugging is temporary — no permanent code changes are made.

## Usage

```
/rp1-dev:code-investigate users are getting 500 errors on the /api/payments endpoint
/rp1-dev:code-investigate tests pass locally but fail in CI with timeout errors
/rp1-dev:code-investigate memory usage spikes every 6 hours in the worker process
```

## Workflow

{% dispatch_agent "rp1-dev:bug-investigator" %}

The agent performs these steps:

1. **Gather context** — Analyze the problem statement, reproduce conditions, and collect relevant logs or error messages
2. **Form hypotheses** — Generate ranked list of possible causes based on symptoms and code structure
3. **Test hypotheses** — Trace execution paths, add temporary debugging instrumentation (tracked and reverted), and narrow down candidates
4. **Identify root cause** — Confirm the cause with concrete evidence (code paths, data flow, timing)
5. **Report findings** — Produce an investigation report containing:
   - Root cause with supporting evidence
   - Affected code paths and components
   - Proposed solutions with effort estimates
   - Reproduction steps for verification
