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
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory for rp1 project context and work artifacts"
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

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --schema-path plugins/dev/skills/pr-visual/SKILL.md --args "{raw arguments from user invocation}"
```

Parse the JSON response. Extract values from `data.arguments` and `data.environment`:

| Variable | Source |
|----------|--------|
| PR_BRANCH | `data.arguments.PR_BRANCH` |
| BASE_BRANCH | `data.arguments.BASE_BRANCH` |
| REVIEW_DEPTH | `data.arguments.REVIEW_DEPTH` |
| FOCUS_AREAS | `data.arguments.FOCUS_AREAS` |
| RP1_ROOT | `data.environment.RP1_ROOT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

## §1 Visualize

Emit `visualize` running. Spawn the pr-visualizer agent:

{% dispatch_agent "rp1-dev:pr-visualizer" %}
PR_BRANCH={PR_BRANCH}, BASE_BRANCH={BASE_BRANCH}, REVIEW_DEPTH={REVIEW_DEPTH},
FOCUS_AREAS={FOCUS_AREAS}, STANDALONE=true, RP1_ROOT={RP1_ROOT}
{% enddispatch_agent %}

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
