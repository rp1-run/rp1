---
name: multi-agent-workflow
description: "Validates parallel sub-agent execution with file-backed JSON artifact handoff"
---

# Multi-Agent Workflow Skill

This skill validates Copilot CLI's ability to orchestrate multiple sub-agents in parallel and collect their results via file-backed JSON artifacts.

## Execution Plan

### Step 1: Setup

Create the output directory:

```bash
mkdir -p .rp1/work/agent-output/multi-agent-test
```

### Step 2: Dispatch Parallel Workers

Delegate to three instances of the `parallel-worker` agent in parallel:

**Worker 1**:
- WORKER_ID: "worker-1"
- OUTPUT_DIR: ".rp1/work/agent-output/multi-agent-test"
- TASK_DATA: "Analyze module boundaries"

**Worker 2**:
- WORKER_ID: "worker-2"
- OUTPUT_DIR: ".rp1/work/agent-output/multi-agent-test"
- TASK_DATA: "Review error handling"

**Worker 3**:
- WORKER_ID: "worker-3"
- OUTPUT_DIR: ".rp1/work/agent-output/multi-agent-test"
- TASK_DATA: "Check naming conventions"

Use Copilot CLI's agent delegation mechanism (e.g., `create_agent`) to spawn each worker. All three should run concurrently.

### Step 3: Collect Results

After all workers complete, read each output file:

```bash
cat .rp1/work/agent-output/multi-agent-test/worker-1.json
cat .rp1/work/agent-output/multi-agent-test/worker-2.json
cat .rp1/work/agent-output/multi-agent-test/worker-3.json
```

### Step 4: Aggregate and Report

Parse each worker's JSON output and produce an aggregated report:

```json
{
  "workflow": "multi-agent-test",
  "total_workers": 3,
  "completed_workers": "<count of workers with status=completed>",
  "results": [
    "<worker-1 output>",
    "<worker-2 output>",
    "<worker-3 output>"
  ],
  "overall_status": "PASS if all completed, FAIL otherwise"
}
```

Write this aggregated report to `.rp1/work/agent-output/multi-agent-test/aggregate.json`.

### Step 5: Summary

```
[FIXTURE] Multi-Agent Workflow Complete
  Workers dispatched: 3
  Workers completed: <count>
  Parallel execution: PASS/FAIL
  File-backed handoff: PASS/FAIL
  Aggregation: PASS/FAIL
  Overall: PASS/FAIL
```
