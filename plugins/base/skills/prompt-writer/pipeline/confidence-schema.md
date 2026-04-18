# Stage: Confidence Schema

Pipeline stage 5 of 6. Defines and embeds the unified confidence ontology into the prompt draft.

## Purpose

Embed the 5-level ordinal confidence scale into the generated prompt, providing a shared vocabulary for expressing uncertainty. Include the migration table that maps existing rp1 idioms (`BAYES`, `CONFIRM/REJECT`, categorical HIGH/MEDIUM/LOW, numeric 0-100%) into the shared vocabulary. The schema normalizes existing usage -- it does not deprecate it (BR-05).

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

3. **Include the migration table** mapping existing rp1 idioms to the shared scale. This table enables agents familiar with legacy vocabulary to translate into the shared schema:

   | Existing Idiom | Mapped Level | Notes |
   |----------------|-------------|-------|
   | `BAYES` (low posterior) | 1-2 | Speculative/Provisional depending on prior strength |
   | `BAYES` (moderate posterior) | 3 | Supported |
   | `BAYES` (high posterior) | 4-5 | Well-established/Settled depending on evidence robustness |
   | `CONFIRM` | 4 | Well-established (hypothesis confirmed through testing) |
   | `REJECT` | 1 | Speculative (hypothesis rejected, back to conjecture) |
   | HIGH | 4 | Well-established |
   | MEDIUM | 3 | Supported |
   | LOW | 1-2 | Speculative/Provisional |
   | 0-20% | 1 | Speculative |
   | 20-40% | 2 | Provisional |
   | 40-60% | 3 | Supported |
   | 60-80% | 4 | Well-established |
   | 80-100% | 5 | Settled |

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

### Migration from Legacy Idioms

{Migration table as above, included for reference by agents familiar with legacy vocabulary}

### Marking Requirements

- MUST mark: {domain-specific list of claim types requiring confidence levels}
- SHOULD mark: {domain-specific list}
- MAY omit: {domain-specific list}
```

**Accumulated state** after this stage: Constitutional directives + Fallibilist overlay + Epistemic stance + Popper-Deutsch patterns + Confidence schema.

**Downstream contract**: Stage 6 (prompt-validation) verifies the confidence schema is embedded in the final prompt and that marking requirements are specified.
