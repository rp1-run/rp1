---
name: strategize
description: "Generates trade-off analyses and strategic recommendations for architecture decisions, technology choices, and system optimization. Produces scored comparison matrices with ROI estimates across cost, quality, performance, and complexity dimensions. Use when the user asks to compare options, evaluate trade-offs, make architecture decisions, plan system improvements, or needs a cost-benefit analysis."
metadata:
  version: 2.0.0
  tags:
    - planning
    - analysis
    - core
  created: 2025-10-25
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-base:strategic-advisor"
---

# Strategic Technical Advisor

Dispatches the **strategic-advisor** sub-agent for holistic optimization and trade-off analysis.

## Usage

```
/rp1-base:strategize should we migrate from REST to gRPC for our internal services?
/rp1-base:strategize evaluate monorepo vs polyrepo for our 5 microservices
/rp1-base:strategize optimize our CI/CD pipeline cost vs speed
```

## Workflow

{% dispatch_agent "rp1-base:strategic-advisor" %}

The agent performs these steps:

1. **Discovery** — Analyze the system (architecture, code, usage patterns, costs) and clarify scope with the user if ambiguous
2. **Option identification** — Enumerate alternatives with pros/cons for each
3. **Trade-off scoring** — Evaluate each option across cost, quality, performance, complexity, and business alignment using a weighted comparison matrix
4. **ROI estimation** — Quantify expected impact and effort for top candidates
5. **Recommendation** — Prioritize by impact-to-effort ratio and deliver a strategy report

## Expected Output

The agent produces a **strategy report** containing:

- Comparison matrix (options × dimensions with scores)
- Ranked recommendations with ROI estimates
- Implementation roadmap with phased milestones
- Risk assessment and mitigation strategies
