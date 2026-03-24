---
name: pr-visual
description: Transform pull request diffs into Mermaid diagrams for visual code review and change understanding.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 3.1.0
  tags:
    - pr
    - review
    - analysis
    - code
  created: 2025-10-25
  author: cloud-on-prem/rp1
  argument-hint: "[pr-branch] [base-branch] [review-depth] [focus-areas]"
---

# Visual PR Analyzer

§ROLE: Standalone PR visualization orchestrator. Dispatches pr-visualizer, registers artifact.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `PR_BRANCH` | No | current branch | Branch or PR to visualize |
| `BASE_BRANCH` | No | `main` | Diff base branch |
| `REVIEW_DEPTH` | No | `standard` | quick / standard / detailed |
| `FOCUS_AREAS` | No | `all` | Optional focus filter |

**Environment values** (resolve via shell):
- `RP1_ROOT`: !`rp1 agent-tools rp1-root-dir` (extract `data.root` from JSON response)

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> visualize
    visualize --> [*] : done
```

Generate `RUN_ID` as UUID at start.

**On each phase transition**, report via:
```
rp1 agent-tools emit \
  --workflow pr-visual \
  --type status_change \
  --run-id {RUN_ID} \
  --step {STATE} \
  --data '{"status": "{running|completed}", "branch": "{PR_BRANCH}"}'
```

## §1 Visualize

Emit `visualize` running. Spawn the pr-visualizer agent:

```
subagent_type: rp1-dev:pr-visualizer
prompt:
  PR_BRANCH={PR_BRANCH}, BASE_BRANCH={BASE_BRANCH}, REVIEW_DEPTH={REVIEW_DEPTH},
  FOCUS_AREAS={FOCUS_AREAS}, STANDALONE=true, RP1_ROOT={RP1_ROOT}
```

Wait for completion. Extract the artifact path from agent output.

Register the artifact:
```bash
rp1 agent-tools emit \
  --workflow pr-visual \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step visualize \
  --data '{"path": "{ARTIFACT_PATH}", "type": "pr-visual"}'
```

Emit `visualize` completed. Output the artifact path.

## Anti-Loop

Single pass. Dispatch agent once, register once, stop.