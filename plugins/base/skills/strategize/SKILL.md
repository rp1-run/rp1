---
name: strategize
description: "Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, complexity, and business objectives with quantified trade-offs."
metadata:
  category: strategy
  is_workflow: false
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

This command invokes the **strategic-advisor** sub-agent for holistic optimization and trade-off analysis.

## Directory Resolution

Before dispatching, resolve the canonical project directories:

```bash
rp1 agent-tools rp1-root-dir
```

Parse the returned JSON to extract `kbRoot`.

## Dispatch

Invoke the strategic-advisor agent with the resolved KB path:

{% dispatch_agent "rp1-base:strategic-advisor" %}
KB_ROOT={kbRoot}
{% enddispatch_agent %}

The agent will:
- Analyze system comprehensively (architecture, code, usage, costs)
- Identify optimization opportunities
- Evaluate trade-offs across cost, quality, performance, complexity
- Provide quantified recommendations with ROI estimates
- Prioritize by impact and effort
- Generate detailed strategy report
- Report back with actionable recommendations

The agent has access to all necessary tools and will handle the entire strategic analysis workflow autonomously.
