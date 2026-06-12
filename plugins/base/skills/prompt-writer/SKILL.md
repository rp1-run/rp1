---
name: prompt-writer
description: Write maximally terse agent prompts from scratch. Use when creating new agent specs, command prompts, or instruction sets. Teaches structure-first composition with compression-by-default patterns. Extended with constitutional governance, epistemic stance selection, and a six-stage prompt pipeline.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: prompt
  is_workflow: false
---

# Prompt Writer

Guide for writing maximally terse agent prompts with built-in constitutional governance and epistemic stance. Combines compression-by-default authoring (tersify), governance primitives (constitution), and epistemological foundations (epistemology) into a single progressive-disclosure skill.

## When to Use

- Creating new agent specifications or skill prompts
- Writing command/skill prompts with governance built in
- Drafting instruction sets for AI agents
- Applying constitutional or epistemic review to existing prompts
- Running the six-stage prompt pipeline via `/build-prompt`

## Core Principles

**Structure-First**: Start with skeleton, not prose. Choose section pattern, fill minimally.

**Compression-by-Default**: Every word must earn its place. Remove before adding.

**Preserve Exactness**: Normative language (MUST/SHOULD/MAY), literals, constraints stay verbatim.

**Governed-by-Design**: Constitutional primitives and epistemic stance are selected upfront, not bolted on.

## Skill Files

### Reference Layers

| File | Purpose | When to Load |
|------|---------|--------------|
| `references/tersify.md` | Compression discipline, section patterns, abbreviation policy, style rules, validation checklist | Direct `/prompt-writer` invocation; prompt-validation pipeline stage |
| `references/constitution.md` | 10 governance primitives (anti-loop, output discipline, role, scope limits, orchestrator purity, error degradation, exploration bounds, anti-bias, truth constraints, transition guards) + four agent-type profiles | Constitutional-checklist pipeline stage; standalone constitutional review |
| `references/epistemology.md` | Six epistemic stances (Fallibilist Empirical, Interpretivism, Phenomenology, Constructivism, Pragmatism, Compare-Mode) with composable contracts | Epistemic-stance pipeline stage; standalone epistemic review |
| `references/budget.md` | 15% aggregate governance cap, per-stage budget allocations, line classification rules, enforcement protocol | Pipeline execution (Stage 6 budget enforcement); standalone budget review |

### Companion Files

| File | Purpose | When to Load |
|------|---------|--------------|
| `PATTERNS.md` | Reusable prompt patterns: constitutional agent, interview, map-reduce, state machine, tool selection, error hierarchy, output contract, progressive disclosure, checklist gate, parameterized behavior, engineering discipline | Direct `/prompt-writer` invocation; prompt authoring |
| `TEMPLATES.md` | Ready-to-use prompt templates at simple, moderate, complex, command, and tool/skill levels | Direct `/prompt-writer` invocation; prompt authoring |

### Pipeline Stages

Six stages executed in fixed order by `/build-prompt` via the `prompt-pipeline-runner` agent. Each stage file follows a consistent structure: Purpose, Input, Process, Output.

| File | Stage | Purpose | When to Load |
|------|-------|---------|--------------|
| `pipeline/constitutional-checklist.md` | 1 | Filter governance primitives by agent-type profile; generate constitutional directives | Pipeline execution; standalone constitutional review |
| `pipeline/fallibilist-overlay.md` | 2 | Unconditionally inject five Popper-Deutsch overlay clauses | Pipeline execution (always applied) |
| `pipeline/epistemic-stance.md` | 3 | Select domain stance from six options; compose epistemic contract | Pipeline execution; standalone stance selection |
| `pipeline/popper-patterns.md` | 4 | Select and inject Popper-Deutsch patterns relevant to problem domain | Pipeline execution |
| `pipeline/confidence-schema.md` | 5 | Apply 5-level ordinal confidence scale; map existing rp1 idioms | Pipeline execution; standalone confidence normalization |
| `pipeline/prompt-validation.md` | 6 | Run 3-axis validation (style, constitutional, epistemic); produce validation report | Pipeline execution; standalone prompt validation |

## Loading Instructions

### Direct Invocation (Backward-Compatible)

When invoked as `/prompt-writer` for prompt authoring and style guidance:

1. Read this SKILL.md for overview and core principles
2. Read `references/tersify.md` for the complete compression discipline and style rules
3. Read `PATTERNS.md` for reusable prompt patterns
4. Read `TEMPLATES.md` for ready-to-use templates at different complexity levels

This provides the same terse prompt authoring guidance as the original prompt-writer. The reference layers and pipeline stages below are available as additional resources but are not required for this workflow.

### Pipeline Execution (via /build-prompt)

When the `prompt-pipeline-runner` agent executes the six-stage pipeline:

1. Read this SKILL.md to discover the file manifest
2. Execute stages in fixed order -- do NOT skip or reorder:
   - **Stage 1**: Read `references/constitution.md` then `pipeline/constitutional-checklist.md`
   - **Stage 2**: Read `pipeline/fallibilist-overlay.md`
   - **Stage 3**: Read `references/epistemology.md` then `pipeline/epistemic-stance.md`
   - **Stage 4**: Read `pipeline/popper-patterns.md`
   - **Stage 5**: Read `pipeline/confidence-schema.md`
   - **Stage 6**: Read `references/tersify.md` then `pipeline/prompt-validation.md`
3. Each stage's output accumulates and feeds the next stage
4. After all stages: produce two output artifacts (prompt, confidence report)

### Standalone Stage Loading

Any individual stage can be loaded independently for targeted review:

- Constitutional review: Read `references/constitution.md` + `pipeline/constitutional-checklist.md`
- Epistemic review: Read `references/epistemology.md` + `pipeline/epistemic-stance.md`
- Style validation: Read `references/tersify.md` + `pipeline/prompt-validation.md`
- Confidence normalization: Read `pipeline/confidence-schema.md`

## Pipeline Overview

```
constitutional-checklist -> fallibilist-overlay -> epistemic-stance -> popper-patterns -> confidence-schema -> prompt-validation
```

The pipeline produces two mandatory artifacts per run:

1. **Ready-to-run prompt** -- SKILL.md (TYPE=skill) or standalone markdown (TYPE=prompt) with constitutional directives and epistemic stance, governed by the 15% budget cap
2. **Confidence report** -- Structured scoring from each pipeline stage with budget compliance metrics
