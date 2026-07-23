---
name: validate-hypothesis
description: "Validate design hypotheses via code experiments, codebase analysis, and external research."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: investigation
  is_workflow: false
  version: 1.0.0
  tags:
    - feature
    - validation
    - design
  created: 2025-11-29
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier whose hypotheses to validate (kebab-case). Required for feature-bound mode."
    - name: HYPOTHESIS
      type: string
      required: false
      variadic: true
      description: "Free-form hypothesis or scenario description to validate ad-hoc, without a feature context."
  sub_agents:
    - "rp1-dev:hypothesis-tester"
---

# Hypothesis Validator

Invokes **hypothesis-tester** agent to validate design assumptions.

Supports two modes:
- **Feature-bound** (FEATURE_ID provided): validates hypotheses from an existing `hypotheses.md` artifact
- **Ad-hoc** (HYPOTHESIS provided, no FEATURE_ID): validates a free-form hypothesis without feature context

## Input Validation

At least one of FEATURE_ID or HYPOTHESIS must be provided. If neither is set:

```
ERROR: Provide either FEATURE_ID (for feature-bound validation) or --hypothesis "text" (for ad-hoc validation).
```

### Mode Selection

Mode is determined by feature-directory existence, not argument precedence:

1. If FEATURE_ID is set AND `{workRoot}/features/{FEATURE_ID}/` exists -> **feature-bound mode**.
2. If FEATURE_ID is set AND `{workRoot}/features/{FEATURE_ID}/` does NOT exist:
   - If HYPOTHESIS is also populated -> combine as `HYPOTHESIS = "{FEATURE_ID} {HYPOTHESIS}"`, clear FEATURE_ID -> **ad-hoc mode**.
   - If HYPOTHESIS is empty (lone token, no matching directory) -> error:
     ```
     ERROR: Feature directory not found: {workRoot}/features/{FEATURE_ID}/
     For ad-hoc validation, use: --hypothesis "your scenario description"
     ```
3. If only HYPOTHESIS is set (no FEATURE_ID) -> **ad-hoc mode**.

## Execution

### Feature-bound Mode (FEATURE_ID provided)

#### Prerequisites
- `{workRoot}/features/{FEATURE_ID}/hypotheses.md` MUST exist
- Created by the feature-architect agent during the design phase when high-risk assumptions are identified

#### Step 1: Invoke Agent

{% dispatch_agent "rp1-dev:hypothesis-tester" %}
FEATURE_ID: {FEATURE_ID}
Validate all PENDING hypotheses for this feature.
{% enddispatch_agent %}

Agent actions: load hypotheses.md -> parse PENDING -> validate via experiment/analysis/research -> document findings w/ evidence -> update status CONFIRMED|REJECTED -> cleanup temp artifacts -> report summary

#### Step 2: Handle Rejected Hypotheses

Parse agent output. If JSON block w/ `type: "rejected_hypotheses"`:

```json
{
  "type": "rejected_hypotheses",
  "hypotheses": [...],
  "hypotheses_path": "..."
}
```

For each rejected:

{% ask_user "{id} REJECTED: {statement}. Evidence: {evidence_summary}. Domain knowledge confirms valid?", options: "Accept rejection", "Override - I confirm valid" %}

**If "Override"**:
1. Edit hypotheses.md:
   - Status: `REJECTED` -> `CONFIRMED_BY_USER`
   - Append: `**User Override**: User confirmed validity based on domain knowledge.`

**If "Accept rejection"**: No change (status remains REJECTED)

### Ad-hoc Mode (HYPOTHESIS provided, no FEATURE_ID)

#### Step 1: Invoke Agent

{% dispatch_agent "rp1-dev:hypothesis-tester" %}
HYPOTHESIS: {HYPOTHESIS}
Validate this ad-hoc hypothesis. Create a hypothesis document, run the experiment, and persist findings.
{% enddispatch_agent %}

Agent actions: generate slug -> create hypothesis document at `{workRoot}/hypotheses/{date}-{slug}.md` -> synthesize HYP-001 -> validate via experiment/analysis/research -> document findings -> report summary

No rejected-hypothesis gating for ad-hoc mode (no feature design to gate).

### Report Result

Display validation summary. Note any user overrides (feature-bound mode only).
