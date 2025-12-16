---
name: deep-research
version: 1.1.0
description: Autonomous deep research on codebases and technical topics with structured report output
argument-hint: "[research-topic]"
tags:
  - research
  - analysis
  - exploration
  - core
created: 2025-12-16
author: cloud-on-prem/rp1
---

# Deep Research - Orchestration Command

You are executing the Deep Research workflow. You coordinate autonomous research through a map-reduce architecture: clarify intent, spawn parallel explorers, synthesize findings, and delegate report generation.

**CRITICAL**: Commands CAN spawn agents. You will spawn research-explorer agents for exploration and research-reporter for report generation. Do NOT delegate orchestration to another agent.

## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| RESEARCH_TOPIC | $ARGUMENTS | (required) | User's research topic or questions |
| RP1_ROOT | Environment | `.rp1/` | Root directory for artifacts |

<research_topic>
$ARGUMENTS
</research_topic>

<rp1_root>
{{RP1_ROOT}}
</rp1_root>

## 1. Intent Clarification (~15% effort)

**Goal**: Understand exactly what the user wants to research before spawning explorers.

### Step 1: Parse Research Topic

Analyze the RESEARCH_TOPIC to identify:
- **Primary question(s)**: What specific questions need answering?
- **Research scope**: Single project, multiple projects, or technical investigation?
- **Target paths**: Any project paths mentioned (defaults to current directory)
- **Depth indicators**: Is this a quick overview or deep dive?

### Step 2: Determine if Clarification Needed

Use AskUserQuestion if RESEARCH_TOPIC is ambiguous about:
- Which codebase(s) to analyze
- Specific aspects to focus on (architecture, patterns, implementation, etc.)
- Expected output format or depth

**Clear requests** (skip clarification):
- "Understand the authentication flow in this project"
- "Compare error handling between ./project-a and ./project-b"
- "Research best practices for Redis caching"

**Ambiguous requests** (ask clarification):
- "Research this code" (which code? what aspects?)
- "Compare projects" (which projects?)
- "Help me understand" (understand what specifically?)

### Step 3: Build Research Intent

After clarification (or immediately if clear), construct:

```
RESEARCH_INTENT:
- mode: single-project | multi-project | technical-investigation
- primary_questions: [list of specific questions to answer]
- target_projects: [list of project paths, or ["."] for current]
- focus_areas: [architecture | patterns | implementation | integration | performance]
- depth: overview | standard | deep
```

## 2. Exploration Planning (~5% effort)

**Goal**: Define explorer assignments for parallel execution.

### Step 1: Determine Explorer Strategy

Based on RESEARCH_INTENT:

**Single-project mode**:
- Spawn 2-3 explorers per project with different focus areas
- Explorer 1: Architecture and structure (EXPLORATION_TYPE: codebase)
- Explorer 2: Implementation patterns (EXPLORATION_TYPE: codebase)
- Explorer 3: External context if needed (EXPLORATION_TYPE: web)

**Multi-project mode**:
- Spawn 1 explorer per project (each handles all aspects)
- Optional: Add 1 web explorer for cross-project context

**Technical investigation mode**:
- Spawn 1-2 codebase explorers for current project context
- Spawn 1-2 web explorers for external research

### Step 2: Prepare Explorer Prompts

For each explorer, prepare:
- EXPLORATION_TARGET: Path or topic
- QUESTIONS: Subset of primary_questions relevant to this explorer
- EXPLORATION_TYPE: codebase | web | hybrid
- KB_PATH: Path to check for .rp1/context/ (for codebase explorers)

## 3. Spawn Explorers (~5% effort)

**CRITICAL**: Spawn ALL explorers in a SINGLE message with PARALLEL Task tool calls.

For each explorer, use the Task tool:
```
subagent_type: rp1-base:research-explorer
prompt: |
  Explore and return JSON findings.
  EXPLORATION_TARGET: {target}
  QUESTIONS: {stringify(questions)}
  EXPLORATION_TYPE: {type}
  KB_PATH: {kb_path}

  Return structured JSON per output contract.
```

**Naming convention**: explorer-{n} where n is 1, 2, 3...

Wait for ALL explorers to complete before proceeding.

## 4. Collect and Synthesize Findings (~50% effort)

**CRITICAL**: Use extended thinking for this entire phase.

### Step 1: Collect Explorer Results

Parse JSON output from each explorer:
- Validate JSON structure matches explorer output contract
- Extract findings arrays
- Extract questions_answered arrays
- Track explorer metadata (files explored, web searches, KB status)

Handle failures:
- If explorer returns invalid JSON: Log warning, skip that explorer
- If >50% explorers fail: Abort with error message to user
- Continue with partial results if <50% fail

### Step 2: Merge Findings

Combine findings from all explorers:
- Deduplicate by finding content (similar titles/descriptions)
- Preserve all unique evidence
- Track which explorer(s) contributed each finding
- Assign merged finding IDs: F-001, F-002, etc.

### Step 3: Synthesize Insights

Using extended thinking, analyze merged findings to:

1. **Answer research questions**: For each primary question, synthesize answer from supporting findings
2. **Identify patterns**: What patterns emerge across explorers/projects?
3. **Note contradictions**: Any conflicting findings between explorers?
4. **Assess confidence**: Overall confidence in findings (based on explorer confidence levels)

### Step 4: Generate Recommendations

Based on synthesis, create actionable recommendations:
- Priority: high | medium | low
- Each recommendation ties to specific findings
- Include implementation notes where applicable

### Step 5: Plan Diagrams

Identify diagrams that would aid understanding:
- Architecture diagrams for system structure findings
- Sequence diagrams for flow-related findings
- Comparison tables for multi-project analysis

For each diagram, specify:
- Type: flowchart | sequence | er | class
- Title: Brief descriptive title
- Description: What to visualize
- Elements: Key elements to include

### Step 6: Build Synthesis Data Package

Construct the synthesis data JSON for the reporter:

```json
{
  "topic": "<research topic>",
  "scope": "single-project | multi-project | technical-investigation",
  "projects_analyzed": ["<path1>", "<path2>"],
  "research_questions": ["<q1>", "<q2>"],
  "executive_summary": "<1-2 paragraph summary>",
  "findings": [
    {
      "id": "F-001",
      "category": "<category>",
      "title": "<title>",
      "description": "<description>",
      "confidence": "high | medium | low",
      "evidence": [...]
    }
  ],
  "comparative_analysis": {
    "aspects": ["<aspect1>", "<aspect2>"],
    "comparison_table": [
      {"aspect": "<aspect>", "project_a": "<approach>", "project_b": "<approach>", "analysis": "<comparison>"}
    ]
  },
  "recommendations": [
    {
      "id": "R-001",
      "action": "<action>",
      "priority": "high | medium | low",
      "rationale": "<why>",
      "implementation_notes": "<how>"
    }
  ],
  "diagram_specs": [
    {
      "id": "D-001",
      "title": "<title>",
      "type": "flowchart | sequence | er | class",
      "description": "<what to visualize>",
      "elements": ["<element descriptions>"]
    }
  ],
  "sources": {
    "codebase": ["<file:line> - <description>"],
    "external": ["<URL> - <description>"]
  },
  "metadata": {
    "explorers_spawned": "<count>",
    "kb_status": {"<project>": {"available": true, "files_loaded": ["..."]}},
    "files_explored": "<total_count>",
    "web_searches": "<total_count>"
  }
}
```

## 5. Spawn Reporter (~10% effort)

### Step 1: Spawn Reporter Agent

The reporter handles output file naming (slugification, directory creation, deduplication).

Use the Task tool:
```
subagent_type: rp1-base:research-reporter
prompt: |
  Generate research report.
  SYNTHESIS_DATA: {stringify(synthesis_data)}
  RP1_ROOT: {RP1_ROOT}
  REPORT_TYPE: {standard | comparative}

  Return JSON with report status and path.
```

### Step 2: Collect Reporter Result

Parse JSON output:
- Extract report_path
- Note diagrams_generated and diagrams_failed
- Track sections_written

Handle failure:
- If reporter fails: Log error, provide synthesis summary directly to user

## 6. Final Summary (~15% effort)

Output a concise summary to the user:

```
## Research Complete

**Topic**: {research_topic}
**Scope**: {scope}
**Projects Analyzed**: {project_list}

### Key Findings

{2-3 sentence summary of most important findings}

### Recommendations

- {Top recommendation 1}
- {Top recommendation 2}

### Report

Full report saved to: `{report_path}`

**Methodology**:
- Explorers spawned: {count}
- KB files loaded: {list or "none available"}
- Files explored: {count}
- Web searches: {count}
- Diagrams generated: {count}
```

## Anti-Loop Directives

**EXECUTE IMMEDIATELY**:
- Do NOT ask for approval beyond initial clarification
- Do NOT iterate or refine after synthesis
- Do NOT re-run explorers
- Spawn explorers in PARALLEL (single message, multiple Task calls)
- Synthesis is ONE pass with extended thinking
- Output final summary after reporter completes
- STOP after outputting final summary

**If blocked**:
- Missing clarification: Ask ONE focused question, then proceed
- Explorer failures: Continue with available results if >50% succeed
- Reporter failure: Output synthesis summary directly
- Do NOT loop or retry failed components

## Output Discipline

**CRITICAL - Keep Output Focused**:
- Use thinking for ALL internal planning and synthesis work
- Output to user:
  1. Brief acknowledgment of research topic
  2. Clarification question (if needed, max 1)
  3. Brief status when spawning explorers
  4. Final summary with report location
- Do NOT narrate each phase in detail
- Do NOT output raw JSON to user (only to subagents)

## Error Handling

| Error | Action |
|-------|--------|
| Ambiguous topic | Ask ONE clarifying question |
| No target projects | Default to current directory |
| Explorer JSON invalid | Skip explorer, continue if >50% succeed |
| >50% explorers fail | Abort with clear error message |
| Reporter fails | Output synthesis summary directly to user |
| No findings | Report "no significant findings" with methodology |
