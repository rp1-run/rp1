# Stage: Prompt Validation

Pipeline stage 6 of 6. Runs 3-axis validation on the complete prompt draft and produces the three output artifacts.

## Purpose

Validate the accumulated prompt draft against three axes (style, constitutional, epistemic). Report deficiencies with clear, actionable descriptions. If validation passes, finalize the three mandatory output artifacts: the ready-to-run prompt, the eval scaffold, and the confidence/epistemic report.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| PROMPT_NAME | User input | Kebab-case name for the prompt being created |
| DESCRIPTION | User input | Natural-language description of the skill/agent |
| AGENT_TYPE | User input | Agent-type profile |
| Constitutional directives | Stage 1 output | Tailored governance directives with applicable primitive list |
| Fallibilist overlay | Stage 2 output | Five unconditional overlay clauses |
| Epistemic stance | Stage 3 output | Selected stance with contract |
| Popper-Deutsch patterns | Stage 4 output | Selected patterns with injectable directives |
| Confidence schema | Stage 5 output | 5-level scale with domain examples and marking requirements |
| tersify.md | `references/tersify.md` | Loaded on demand for style validation |

## Process

### Phase 1: Assemble the Prompt Draft

Before validation, the agent MUST have assembled the accumulated outputs from Stages 1-5 into a complete prompt draft. The draft should be a valid SKILL.md (or agent .md) with:
- YAML frontmatter (name, description, category, allowed-tools, metadata as appropriate)
- Constitutional directives integrated as structural sections
- Fallibilist overlay embedded as a governance section
- Epistemic stance declared with contract
- Selected Popper-Deutsch patterns injected at relevant points
- Confidence schema embedded with marking requirements

### Phase 2: Three-Axis Validation

Run validation on all three axes. Each axis produces a pass/fail verdict with specific deficiency descriptions for any failures.

#### Axis 1: Style Validation

**Load** `references/tersify.md` if not already in context.

**Validate against**:

| Check | Rule | Fail If |
|-------|------|---------|
| Structure over prose | Sections use structured formats (tables, bullets, code blocks) over paragraph prose | >30% of content is paragraph prose |
| Compression | No redundancy, no pleasantries, no meta-commentary | Redundant content or anti-patterns from tersify.md detected |
| Section patterns | Uses terse section headers (ROLE, OBJ, PROC, etc.) where appropriate | Verbose headers where terse equivalents exist |
| Normative language | MUST/SHOULD/MAY preserved exactly | Normative words softened or replaced with symbols |
| Abbreviations | Safe abbreviations used; non-standard ones in LEG section | Unknown abbreviations without LEG entry |
| Shell safety | No dangerous patterns (backtick key-value, command substitution) | Shell-unsafe patterns detected |
| Length | Simple prompts <=300 lines, complex <=500 lines | Exceeds line limit for complexity class |

#### Axis 2: Constitutional Validation

**Validate against** the applicable primitive set produced by Stage 1 for the current `AGENT_TYPE`.

The Stage 1 profile map determines which primitives apply; Stage 6 MUST NOT require primitives that Stage 1 omitted for the profile. For reference, Stage 1's profile filter is:

| Profile | Applicable primitives |
|---------|----------------------|
| `leaf-worker` | Anti-loop, Output discipline, Role, Scope limits, Error degradation, Truth constraints, Transition guards |
| `orchestrator` | Role, Scope limits, Orchestrator purity, Error degradation, Transition guards |
| `interactive-skill` | Output discipline, Role, Scope limits, Exploration bounds, Anti-bias |
| `kb-investigator` | Role, Error degradation, Exploration bounds, Anti-bias, Truth constraints |

The axis runs two checks in every case, plus primitive-level checks keyed off the filtered set:

| Check | Rule | Fail If |
|-------|------|---------|
| Role declaration | Prompt starts with a clear ROLE section (Role is applicable for every profile) | No role declaration or role is ambiguous |
| Directive integrity | Each directive from Stage 1 preserves the core constraint from constitution.md | Any Stage 1 directive is present but weakened, hedged, or contradicted |
| Primitive coverage | For every primitive in the Stage 1 applicable set, a corresponding section or directive exists in the prompt | Any Stage 1 primitive is missing from the prompt |
| Primitive non-overreach | The prompt MUST NOT add directives for primitives that Stage 1 filtered out for this profile | The prompt invokes a primitive not in the Stage 1 applicable set |

Concretely: do NOT fail a profile that omits `Scope limits` (e.g. `kb-investigator`) for lacking a scope-boundary directive, and do NOT fail a profile that omits `Error degradation` (e.g. `interactive-skill`) for lacking a structured-error directive. Those are handled by the primitive-coverage check, which reads the Stage 1 set dynamically.

#### Axis 3: Epistemic Validation

**Validate against** the outputs from Stages 2-5:

| Check | Rule | Fail If |
|-------|------|---------|
| Stance declaration | Epistemic stance is explicitly named in the prompt | Stance is implied but not declared |
| Epistemic contract | Full epistemic contract from Stage 3 is embedded | Contract is absent or incomplete |
| Fallibilist overlay | All five overlay clauses are present | Any overlay clause is missing |
| Popper patterns | All selected patterns from Stage 4 are injected | Any selected pattern is missing |
| Confidence schema | 5-level scale is embedded with marking requirements | Scale or marking requirements absent |
| Confidence in use | Prompt instructs the agent when and how to apply confidence levels | Schema present but no usage instructions |

### Phase 3: Report and Remediate

1. If ANY check fails on ANY axis:
   - Report the deficiency with: axis name, check name, what is missing/wrong, how to fix it
   - Remediate the deficiency in the prompt draft
   - Re-validate the remediated section
   - If remediation fails after one attempt, report the persistent deficiency in the output

2. If ALL checks pass: proceed to artifact generation.

### Phase 4: Generate Output Artifacts

Generate the three mandatory output artifacts (BR-03: all three are mandatory; fail if any cannot be generated):

#### Artifact 1: Ready-to-Run Prompt

The validated prompt draft, formatted as a complete SKILL.md:

```yaml
---
name: {PROMPT_NAME}
description: "{Description from DESCRIPTION input}"
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: {appropriate category}
  arguments:
    # As appropriate for the described skill/agent
---
```

Followed by the full prompt body with all constitutional, epistemic, and style requirements satisfied.

#### Artifact 2: Eval Scaffold

A promptfoo configuration for testing the generated prompt. Structure:

The eval scaffold is written alongside the generated `SKILL.md` in the same `{PROMPT_NAME}/` directory, so the `prompts:` reference is a sibling (`file://./SKILL.md`). Providers are declared inline; override the harness at runtime via `EVAL_HARNESS=opencode`.

```yaml
description: "Eval suite for {PROMPT_NAME}"

evaluateOptions:
  maxConcurrency: 4

providers:
  - id: anthropic:claude-agent-sdk
    label: rp1-agentic-eval
    config:
      model: haiku
      permission_mode: bypassPermissions
      allow_dangerously_skip_permissions: true
      max_turns: 30

prompts:
  - file://./SKILL.md

tests:
  # Constitutional assertions - one per applicable primitive
  - description: "Contains {primitive_name} governance directive"
    assert:
      - type: llm-rubric
        value: "The prompt contains a clear {primitive_name} directive that {what it should do}"

  # Structural assertions
  - description: "Valid SKILL.md frontmatter"
    assert:
      - type: llm-rubric
        value: "The prompt begins with valid YAML frontmatter containing name, description, and metadata fields"

  # Epistemic assertions
  - description: "Epistemic stance declared"
    assert:
      - type: llm-rubric
        value: "The prompt explicitly declares its epistemic stance and includes an epistemic contract section"

  - description: "Confidence schema present"
    assert:
      - type: llm-rubric
        value: "The prompt includes a confidence level scale with at least 3 levels and specifies when to apply confidence marking"

  # Test invocation prompts derived from DESCRIPTION
  - description: "Handles typical use case"
    vars:
      input: "{Representative use case derived from DESCRIPTION}"
    assert:
      - type: llm-rubric
        value: "The response follows the governance directives and epistemic stance declared in the prompt"
```

#### Artifact 3: Confidence/Epistemic Report

A structured report scoring the prompt against each pipeline stage:

```markdown
# Confidence & Epistemic Report: {PROMPT_NAME}

## Pipeline Stage Scoring

| Stage | Status | Score | Notes |
|-------|--------|-------|-------|
| Constitutional Checklist | {PASS/FAIL} | {applicable}/{total} primitives | {Brief note} |
| Fallibilist Overlay | {PASS/FAIL} | {present}/{5} clauses | {Brief note} |
| Epistemic Stance | {PASS/FAIL} | {stance name} | {Brief note} |
| Popper Patterns | {PASS/FAIL} | {selected}/{applied} patterns | {Brief note} |
| Confidence Schema | {PASS/FAIL} | {levels defined} | {Brief note} |
| Prompt Validation | {PASS/FAIL} | {axes passed}/{3} axes | {Brief note} |

## Constitutional Governance Summary

{List each applied primitive with its tailored directive summary}

## Epistemic Posture

**Stance**: {Selected stance}
**Secondary influences**: {If any}
**Fallibilist overlay**: Applied (unconditional)
**Popper patterns**: {Count} selected, {count} applied

## Confidence Vocabulary

**Scale**: 5-level ordinal (Speculative -> Settled)
**Legacy mapping**: {Count} idioms mapped
**Marking requirements**: {Summary of MUST/SHOULD/MAY}

## Validation Results

### Style Axis
{Pass/Fail per check with details}

### Constitutional Axis
{Pass/Fail per check with details}

### Epistemic Axis
{Pass/Fail per check with details}

## Deficiencies (if any)
{List any unresolved deficiencies with remediation notes, or "None"}
```

## Output

All three artifacts produced and returned to the calling orchestrator or pipeline-runner agent:

1. **Ready-to-run prompt**: `{PROMPT_NAME}/SKILL.md`
2. **Eval scaffold**: `{PROMPT_NAME}/evals.yaml`
3. **Confidence report**: `{PROMPT_NAME}/confidence-report.md`

**Terminal stage**: This is the final pipeline stage. No downstream stages consume this output. The three artifacts are the pipeline's deliverables.
