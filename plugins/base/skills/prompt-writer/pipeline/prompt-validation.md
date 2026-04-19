# Stage: Prompt Validation

Pipeline stage 6 of 6. Runs 4-axis validation on the complete prompt draft, grounds every referenced external command, and produces the three output artifacts.

## Purpose

Validate the accumulated prompt draft against four axes (style, constitutional, epistemic, runtime). Report deficiencies with clear, actionable descriptions. If validation passes, finalize the three mandatory output artifacts: the ready-to-run prompt, the eval scaffold, and the confidence/epistemic report.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| PROMPT_NAME | User input | Kebab-case name for the prompt being created |
| DESCRIPTION | User input | Natural-language description of the skill |
| AGENT_TYPE | User input | Agent-type profile |
| Constitutional directives | Stage 1 output | Tailored governance directives with applicable primitive list |
| Fallibilist overlay | Stage 2 output | Five unconditional overlay clauses |
| Epistemic stance | Stage 3 output | Selected stance with contract |
| Popper-Deutsch patterns | Stage 4 output | Selected patterns with injectable directives |
| Confidence schema | Stage 5 output | 5-level scale with domain examples and marking requirements |
| tersify.md | `references/tersify.md` | Loaded on demand for style validation |

## Process

### Phase 1: Assemble the Prompt Draft

Before validation, the agent MUST have assembled the accumulated outputs from Stages 1-5 into a complete SKILL.md prompt draft. The draft must have:
- YAML frontmatter (name, description, category, allowed-tools, metadata as appropriate)
- Constitutional directives integrated as structural sections
- Fallibilist overlay embedded as a governance section
- Epistemic stance declared with contract
- Selected Popper-Deutsch patterns injected at relevant points (empty set when `COMPLEXITY=simple`)
- Confidence schema embedded with marking requirements
- A `## Runtime Contract` section listing every external shell command the generated skill invokes, one per line in its body form. The section reads `none` if the skill invokes no external commands.

### Phase 1.5: Runtime Grounding

For each command listed in the `## Runtime Contract` section, execute it with `--help` (or an equivalent help flag for tools that use a different convention) via Bash and confirm exit code 0.

| Outcome | Action |
|---------|--------|
| Exit 0 | The command path exists. Record as grounded. |
| Non-zero exit | The command path does not exist. Rewrite the invocation in the draft body against the correct path (discovered by running `<parent> --help` and searching the sub-command list). Update the Runtime Contract section to match. |
| No working path exists | Remove the invocation from the body entirely and re-draft the section that relied on it. |

Re-run Phase 1.5 after any rewrite. Do NOT proceed to Phase 2 until every Runtime Contract line exits 0. This check is tool-agnostic -- it applies to any command, not only `rp1`.

### Phase 2: Four-Axis Validation

Run validation on all four axes. Each axis produces a pass/fail verdict with specific deficiency descriptions for any failures.

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
| Popper patterns | All selected patterns from Stage 4 are injected (`COMPLEXITY=simple` skips Stage 4; an empty selected set is valid) | Any selected pattern is missing (not applicable when Stage 4 was skipped) |
| Confidence schema | The ordinal scale is embedded with marking requirements (5 levels for `standard`/`complex`; 3 levels for `simple`) | Scale or marking requirements absent |
| Confidence in use | Prompt instructs the agent when and how to apply confidence levels | Schema present but no usage instructions |

#### Axis 4: Runtime Validation

| Check | Rule | Fail If |
|-------|------|---------|
| Contract coverage | Every external command that appears in the body also appears in the `## Runtime Contract` section, and vice versa | The two lists diverge |
| Grounding | Every command in the Runtime Contract returned exit 0 from `--help` in Phase 1.5 | Any command was ungrounded and was not rewritten |
| State-machine declaration | If the draft contains any `rp1 agent-tools emit --step X`, the draft also has a `## STATE-MACHINE` section with a `stateDiagram-v2` block that declares `X` as a state | `--step X` is emitted without a matching state declaration |
| Emit run-id | Every `rp1 agent-tools emit` invocation includes `--run-id` | Any emit is missing `--run-id` |
| State-machine necessity | If the skill is a one-shot wrapper with no workflow lifecycle (no `--step` emits anywhere), it MUST NOT include a `## STATE-MACHINE` block either | A state machine is declared but never referenced, or vice versa |

Remediation for Axis 4: add the missing state-machine block + run-id, OR strip the emits and state-machine block entirely. Both directions are valid fixes.

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

The validated prompt draft, formatted as a complete SKILL.md.

**`allowed-tools` is derived from the Runtime Contract**, not hardcoded. Extract the first token of each command line in the `## Runtime Contract` section and emit `Bash(<token> *)` for each unique token. Always include `Bash(echo *)` as a baseline for output and diagnostics. If the Runtime Contract reads `none`, the tools line is just `Bash(echo *)`.

Example derivations:

| Runtime Contract entries | Resulting `allowed-tools` |
|--------------------------|---------------------------|
| (none) | `Bash(echo *)` |
| `rp1 agent-tools mmd-validate FILE.md` | `Bash(echo *), Bash(rp1 *)` |
| `rp1 agent-tools emit --run-id R --step S --data D`<br>`jq .foo FILE.json` | `Bash(echo *), Bash(rp1 *), Bash(jq *)` |
| `git log --oneline -1 FILE`<br>`grep -n PATTERN FILE` | `Bash(echo *), Bash(git *), Bash(grep *)` |

If the generated skill needs tools beyond `Bash(...)` (e.g. `Read`, `Write`, `Task`), add them to the line as well, matching the actual affordances the skill body invokes.

```yaml
---
name: {PROMPT_NAME}
description: "{Description from DESCRIPTION input}"
allowed-tools: {derived list per above}
metadata:
  category: {appropriate category}
  arguments:
    # As appropriate for the described skill
---
```

Followed by the full prompt body with all constitutional, epistemic, and style requirements satisfied, plus the `## Runtime Contract` section that mirrors the commands used.

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

A structured report scoring the prompt against each pipeline stage and every validation axis. The template reflects `COMPLEXITY`: `simple` records the Stage 4 skip and uses the 3-level confidence scale; `standard`/`complex` use the full 5-level scale and require per-pattern Popper scoring.

```markdown
# Confidence & Epistemic Report: {PROMPT_NAME}

**Agent type**: {AGENT_TYPE}

## Complexity Classification

**Complexity**: {effective_complexity} ({"explicit" when incoming COMPLEXITY was simple/standard/complex; "auto-detected: <matched indicators>, word count <N>" when incoming was auto})

## Pipeline Stage Scoring

| Stage | Status | Score | Notes |
|-------|--------|-------|-------|
| Constitutional Checklist | {PASS/FAIL} | {applicable}/{total} primitives for {AGENT_TYPE} | {Brief note} |
| Fallibilist Overlay | {PASS/FAIL} | {present}/5 clauses (all five required, unconditional) | {Brief note} |
| Epistemic Stance | {PASS/FAIL} | {stance name} | {Brief note} |
| Popper Patterns | {PASS/FAIL or SKIPPED} | {selected} patterns (SKIPPED when COMPLEXITY=simple) | {Brief note} |
| Confidence Schema | {PASS/FAIL} | {3 levels for simple, 5 for standard/complex} | {Brief note} |
| Prompt Validation | {PASS/FAIL} | {axes passed}/4 axes | {Brief note} |

## Constitutional Governance Summary

{List each applied primitive with its tailored directive summary. Primitives outside the AGENT_TYPE profile are absent by design.}

## Epistemic Posture

**Stance**: {Selected stance}
**Secondary influences**: {If any}
**Fallibilist overlay**: Applied (unconditional, all five clauses)
**Popper patterns**: {Count selected; write "Skipped (COMPLEXITY=simple)" when simple}

## Confidence Vocabulary

**Scale**: {3-level (simple) OR 5-level (standard/complex)}
**Marking requirements**: {Summary of MUST/SHOULD/MAY}

## Validation Results

### Style Axis
{Pass/Fail per check with details}

### Constitutional Axis
{Pass/Fail per check with details, including the non-overreach check}

### Epistemic Axis
{Pass/Fail per check with details; Popper-patterns check is N/A when Stage 4 skipped}

### Runtime Axis
{Pass/Fail per check: Contract coverage, Grounding, State-machine declaration, Emit run-id, State-machine necessity}

## Runtime Contract Verification

{List each command from the `## Runtime Contract` section with the `--help` exit code recorded during Phase 1.5. Any rewrites performed during grounding are noted here.}

## Deficiencies (if any)
{List any unresolved deficiencies with remediation notes, or "None"}
```

## Output

All three artifacts produced and returned to the calling orchestrator or pipeline-runner agent:

1. **Ready-to-run prompt**: `{PROMPT_NAME}/SKILL.md`
2. **Eval scaffold**: `{PROMPT_NAME}/evals.yaml`
3. **Confidence report**: `{PROMPT_NAME}/confidence-report.md`

**Terminal stage**: This is the final pipeline stage. No downstream stages consume this output. The three artifacts are the pipeline's deliverables.
