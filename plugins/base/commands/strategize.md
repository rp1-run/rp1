---
name: strategize
version: 2.0.0
description: Analyzes systems holistically to provide strategic recommendations balancing cost, quality, performance, complexity, and business objectives with quantified trade-offs.
tags:
  - planning
  - analysis
  - core
created: 2025-10-25
author: cloud-on-prem/rp1
---

# Strategic Technical Advisor

This command invokes the **strategic-advisor** sub-agent for holistic optimization and trade-off analysis.

Use the Task tool to invoke the strategic-advisor agent:

```
subagent_type: rp1-base:strategic-advisor
```

The agent will:
- Analyze system comprehensively (architecture, code, usage, costs)
- Identify optimization opportunities
- Evaluate trade-offs across cost, quality, performance, complexity
- Provide quantified recommendations with ROI estimates
- Prioritize by impact and effort
- Generate detailed strategy report
- Report back with actionable recommendations

The agent has access to all necessary tools and will handle the entire strategic analysis workflow autonomously.
