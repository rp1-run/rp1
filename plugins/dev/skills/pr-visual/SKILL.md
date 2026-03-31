---
name: pr-visual
description: "Transform pull request diffs into Mermaid diagrams for visual code review and change understanding."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 3.1.0
  tags:
    - pr
    - review
    - analysis
    - code
  created: 2025-10-25
  updated: 2026-03-25
  author: cloud-on-prem/rp1
  arguments:
    - name: PR_BRANCH
      type: string
      required: false
      description: "Branch or PR to visualize (default: current branch)"
    - name: BASE_BRANCH
      type: string
      required: false
      default: "main"
      description: "Diff base branch"
    - name: REVIEW_DEPTH
      type: enum
      required: false
      default: "standard"
      description: "Review depth level"
      enum_values:
        - "quick"
        - "standard"
        - "detailed"
    - name: FOCUS_AREAS
      type: string
      required: false
      default: "all"
      description: "Optional focus filter"
  sub_agents:
    - "rp1-dev:pr-visualizer"
---

# Visual PR Analyzer

§ROLE: Standalone PR visualization orchestrator. Dispatches pr-visualizer, registers artifact.

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

{% dispatch_agent "rp1-dev:pr-visualizer" %}
PR_BRANCH={PR_BRANCH}, BASE_BRANCH={BASE_BRANCH}, REVIEW_DEPTH={REVIEW_DEPTH},
FOCUS_AREAS={FOCUS_AREAS}, STANDALONE=true
{% enddispatch_agent %}

Wait for completion. Extract the artifact path from agent output.

Register the artifact:
```bash
rp1 agent-tools emit \
  --workflow pr-visual \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step visualize \
  --data '{"path": "{ARTIFACT_PATH}", "type": "pr-visual", "feature": "pr-visual", "storageRoot": "absolute"}'
```

Emit `visualize` completed. Output the artifact path.

## Anti-Loop

Single pass. Dispatch agent once, register once, stop.
