# Stage: Epistemic Stance

Pipeline stage 3 of 6. Selects the appropriate epistemic stance for the target prompt's domain and composes an epistemic contract section.

## Purpose

Analyze the problem domain described by the user and select the most appropriate epistemic stance from the six options defined in `references/epistemology.md`. Compose an epistemic contract section that governs how the generated agent relates to knowledge, uncertainty, and truth claims in its domain.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| DESCRIPTION | User input | Natural-language description of the skill/agent being created |
| AGENT_TYPE | User input | Agent-type profile |
| Constitutional directives | Stage 1 output | Tailored governance directives |
| Fallibilist overlay | Stage 2 output | Five unconditional overlay clauses |
| epistemology.md | `references/epistemology.md` | Loaded on demand at stage start |

## Process

1. **Load** `references/epistemology.md` if not already in context.

2. **Analyze the problem domain** from DESCRIPTION. Identify the primary activity the agent performs. Use the Stance Selection Guidance table from epistemology.md:

   | Signal | Suggested Stance |
   |--------|-----------------|
   | Agent works with code, tests, or system behavior | Fallibilist Empirical |
   | Agent interprets user input, requirements, or communication | Interpretivism |
   | Agent evaluates user experience or information perception | Phenomenology |
   | Agent synthesizes knowledge from multiple sources | Constructivism |
   | Agent makes implementation or tooling decisions | Pragmatism |
   | Agent compares multiple alternatives with criteria | Compare-Mode |

3. **Select the primary stance**. If the domain spans multiple stances:
   - Declare the **primary** stance (the one that governs the majority of the agent's work)
   - Note **secondary influences** (aspects of other stances that apply to specific sub-tasks)
   - Do NOT blend stances into an ambiguous hybrid

4. **Compose the epistemic contract**. Copy the contract block from the selected stance in epistemology.md and adapt it to the specific domain described in DESCRIPTION:
   - Replace generic examples with domain-specific ones
   - Adjust language to match the agent's specific activities
   - Preserve the core epistemic commitments of the stance unchanged

5. **Declare the stance explicitly** in the output. The generated prompt MUST contain an explicit stance declaration so that downstream stages and future readers know which epistemic posture governs the agent.

6. **Verify compatibility** with the fallibilist overlay from Stage 2:
   - All six stances are compatible with the fallibilist overlay (the overlay is the foundation; the stance is the domain-specific layer)
   - If adapting the contract would conflict with any overlay clause, preserve the overlay clause and note the tension

## Output

Produce the following structured output for downstream stages:

```markdown
## Epistemic Stance: {Selected Stance Name}

**Primary stance**: {Stance name}
**Secondary influences**: {List, or "None"}
**Selection rationale**: {1-2 sentences explaining why this stance fits the domain}

### Epistemic Contract

{Adapted contract block from epistemology.md, tailored to DESCRIPTION domain}

### Domain-Specific Guidance

{2-4 bullets describing how this stance applies to the specific agent being created}
```

**Accumulated state** after this stage: Constitutional directives + Fallibilist overlay + Selected epistemic stance with contract.

**Downstream contract**: Stage 4 (popper-patterns) uses the selected stance to guide pattern selection. Stage 5 (confidence-schema) maps confidence levels within this epistemic framework. Stage 6 (prompt-validation) verifies the stance is declared and the contract is embedded.
