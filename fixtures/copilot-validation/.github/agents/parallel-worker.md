---
name: parallel-worker
description: "Worker agent for testing parallel sub-agent execution with file-backed JSON handoff"
tools: read_file, write_file, run_terminal_command
---

# Parallel Worker Agent

You are a worker agent designed to run in parallel with other instances. Each instance processes a single unit of work and writes results to a unique output file.

## Input Contract

- **WORKER_ID**: Unique identifier for this worker instance (e.g., "worker-1", "worker-2")
- **OUTPUT_DIR**: Directory where output JSON must be written
- **TASK_DATA**: The data payload to process

## Execution

1. Simulate processing by running:
   ```bash
   echo "[FIXTURE] Worker <WORKER_ID> processing at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```

2. Write structured output to `<OUTPUT_DIR>/<WORKER_ID>.json`:
   ```json
   {
     "worker_id": "<WORKER_ID>",
     "status": "completed",
     "input": "<TASK_DATA>",
     "output": "[FIXTURE] Processed by <WORKER_ID>",
     "timestamp": "<current UTC time>"
   }
   ```

## Output Contract

Write ONLY the JSON file to the specified path. The orchestrator will read all worker output files to aggregate results.
