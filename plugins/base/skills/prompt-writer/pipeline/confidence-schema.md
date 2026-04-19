# Stage: Confidence Schema

Pipeline stage 5 of 6. Defines and embeds the unified confidence ontology into the prompt draft.

## Purpose

Embed the 5-level (or 3-level, for `COMPLEXITY=simple`) ordinal confidence scale into the generated prompt, providing a shared vocabulary for expressing uncertainty.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| DESCRIPTION | User input | Natural-language description of the skill being created |
| AGENT_TYPE | User input | Agent-type profile |
| Constitutional directives | Stage 1 output | Tailored governance directives |
| Fallibilist overlay | Stage 2 output | Five unconditional overlay clauses |
| Epistemic stance | Stage 3 output | Selected stance with contract |
| Popper-Deutsch patterns | Stage 4 output | Selected patterns with injectable directives |

## Process

1. **Embed the 5-level ordinal confidence scale** into the prompt draft. This scale provides the canonical vocabulary for all confidence claims the generated agent makes.

2. **The 5-level ordinal scale**:

   | Level | Label | Meaning | Usage Guidance |
   |-------|-------|---------|----------------|
   | 1 | Speculative | Unvalidated conjecture. No evidence yet, or evidence is anecdotal. | Use when making initial hypotheses, brainstorming possibilities, or acknowledging unknowns. |
   | 2 | Provisional | Some evidence supports the claim, but it has not been rigorously tested. | Use when early indicators point in a direction but testing/validation is pending. |
   | 3 | Supported | Evidence-backed claim that has passed initial tests or review. | Use for conclusions from code analysis, test runs, or systematic review. Default for well-reasoned but not exhaustively verified claims. |
   | 4 | Well-established | Robust evidence from multiple sources. Claim has survived deliberate attempts at refutation. | Use for conclusions from thorough investigation, cross-validated findings, or proven patterns. |
   | 5 | Settled | Foundational knowledge that would require extraordinary evidence to overturn. | Use sparingly. Reserved for language semantics, mathematical truths, well-documented API contracts, or extensively validated patterns. |

3. **Scale selection** based on COMPLEXITY:
   - `simple`: emit a **3-level** trim (Speculative, Supported, Settled) -- sufficient for narrow, one-shot skills. Omit Provisional and Well-established.
   - `standard` (default) and `complex`: emit the full 5-level scale.

4. **Compose the confidence schema section** for the prompt. Adapt the scale to the agent's domain:
   - Include domain-specific examples for each level based on DESCRIPTION
   - Reference the epistemic stance from Stage 3 to contextualize how confidence interacts with the stance's epistemic commitments
   - If the Fallibilism Marker pattern was selected in Stage 4, align the marker vocabulary with this scale

5. **Specify when confidence marking is required** in the generated prompt:
   - MUST mark: root-cause claims, architectural recommendations, risk assessments, comparative judgments
   - SHOULD mark: non-trivial interpretive conclusions, inferred causality
   - MAY omit: direct observations (file exists, test passes), procedural steps, format descriptions

## Output

Produce the following structured output for downstream stages:

For `standard`/`complex`:

```markdown
## Confidence Schema

### 5-Level Ordinal Scale

| Level | Label | Meaning |
|-------|-------|---------|
| 1 | Speculative | Unvalidated conjecture |
| 2 | Provisional | Some evidence, not yet rigorously tested |
| 3 | Supported | Evidence-backed, passed initial tests |
| 4 | Well-established | Robust evidence, survived refutation attempts |
| 5 | Settled | Foundational, requires extraordinary counter-evidence |

### Domain Examples ({DESCRIPTION context})

- **Level 1 (Speculative)**: {domain-specific example}
- **Level 2 (Provisional)**: {domain-specific example}
- **Level 3 (Supported)**: {domain-specific example}
- **Level 4 (Well-established)**: {domain-specific example}
- **Level 5 (Settled)**: {domain-specific example}

### Marking Requirements

- MUST mark: {domain-specific list of claim types requiring confidence levels}
- SHOULD mark: {domain-specific list}
- MAY omit: {domain-specific list}
```

For `simple` (3-level trim):

```markdown
## Confidence Schema

### 3-Level Ordinal Scale

| Level | Label | Meaning |
|-------|-------|---------|
| 1 | Speculative | Unvalidated conjecture |
| 3 | Supported | Evidence-backed, passed initial tests |
| 5 | Settled | Foundational, requires extraordinary counter-evidence |

### Marking Requirements

- MUST mark: {narrow domain-specific list}
- MAY omit: direct observations and procedural steps
```

**Accumulated state** after this stage: Constitutional directives + Fallibilist overlay + Epistemic stance + Popper-Deutsch patterns + Confidence schema.

**Downstream contract**: Stage 6 (prompt-validation) verifies the confidence schema is embedded in the final prompt and that marking requirements are specified.
