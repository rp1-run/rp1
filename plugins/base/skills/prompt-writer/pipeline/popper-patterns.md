# Stage: Popper Patterns

Pipeline stage 4 of 6. Selects and injects Popper-Deutsch patterns relevant to the target prompt's domain and epistemic stance.

## Purpose

From the library of 11 Popper-Deutsch patterns, select and inject the patterns most relevant to the problem domain and the epistemic stance selected in Stage 3. Not all patterns apply to every agent -- selection is guided by domain fit and stance compatibility.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| DESCRIPTION | User input | Natural-language description of the skill/agent being created |
| AGENT_TYPE | User input | Agent-type profile |
| Constitutional directives | Stage 1 output | Tailored governance directives |
| Fallibilist overlay | Stage 2 output | Five unconditional overlay clauses |
| Epistemic stance | Stage 3 output | Selected stance with contract and rationale |

## Process

1. **Review the pattern library** below. Each pattern has domain-relevance and stance-affinity indicators.

2. **Select applicable patterns** based on:
   - The DESCRIPTION (what the agent does)
   - The selected epistemic stance (which patterns amplify that stance)
   - The AGENT_TYPE (some patterns are more relevant to certain profiles)
   - Minimum: 3 patterns. Maximum: 7 patterns. Select for relevance, not completeness.

3. **For each selected pattern**, compose a concise injectable directive tailored to DESCRIPTION.

4. **Order** selected patterns from most universally applicable to most domain-specific.

## Pattern Library

### 1. Conjecture-First

**Description**: Begin with explicit conjectures rather than accumulated observations. State what you think the answer is before marshaling evidence.

**Stance Affinity**: Fallibilist Empirical, Pragmatism

**Agent-Type Affinity**: leaf-worker, kb-investigator

**When Relevant**: Agent produces analysis, findings, or recommendations. Agent investigates problems or evaluates solutions.

**Injectable Directive**:
```markdown
State conjectures before evidence. Lead with "Conjecture: {claim}" then follow
with supporting/contradicting evidence. Do not inductively build to a conclusion.
```

---

### 2. Falsification

**Description**: Actively seek evidence that would disprove current conclusions rather than only confirming them. A single counter-example outweighs many confirmations.

**Stance Affinity**: Fallibilist Empirical

**Agent-Type Affinity**: kb-investigator, leaf-worker

**When Relevant**: Agent evaluates hypotheses, validates implementations, or tests assumptions. Agent investigates bugs or reviews code.

**Injectable Directive**:
```markdown
For each conclusion, actively seek disconfirming evidence. Ask: "What would make
this wrong?" A single strong counter-example defeats any number of confirmations.
```

---

### 3. Hard-to-Vary

**Description**: Prefer explanations where every detail plays a functional role. If a detail can be changed without affecting the explanation, the explanation is too loose.

**Stance Affinity**: Fallibilist Empirical, Constructivism

**Agent-Type Affinity**: kb-investigator, leaf-worker

**When Relevant**: Agent produces explanations, root-cause analyses, or architectural rationales. Agent synthesizes understanding from evidence.

**Injectable Directive**:
```markdown
Test each explanation: can any detail be changed without breaking it? If yes,
the explanation is too loose. Tighten until every component is load-bearing.
```

---

### 4. Error-Correction Loop

**Description**: Build explicit mechanisms for detecting and correcting errors in reasoning. Ensure output structure supports iterative refinement.

**Stance Affinity**: Fallibilist Empirical, Constructivism, Pragmatism

**Agent-Type Affinity**: All profiles

**When Relevant**: Any agent that produces output consumed by humans or other agents. Universal applicability for any substantive output.

**Injectable Directive**:
```markdown
Structure output to support error correction:
- Mark confidence levels so reviewers know where to scrutinize
- Separate observations from interpretations
- Make reasoning steps visible for independent verification
```

---

### 5. Bold Conjecture

**Description**: Prefer bold, testable conjectures over timid, safe ones. Bold conjectures are more informative because they rule out more possibilities and are easier to test.

**Stance Affinity**: Fallibilist Empirical, Pragmatism

**Agent-Type Affinity**: kb-investigator, interactive-skill

**When Relevant**: Agent investigates unknowns, proposes solutions, or makes recommendations. Less relevant for agents executing known procedures.

**Injectable Directive**:
```markdown
Prefer bold conjectures over safe ones. A bold conjecture that survives testing
is more informative than a timid one. State the strongest version of each claim,
then test it rigorously.
```

---

### 6. Problem-Situation

**Description**: Frame every task as a problem-situation: what is the problem, what solutions have been tried, why they failed or are insufficient, and what new conjecture addresses the gap.

**Stance Affinity**: Pragmatism, Fallibilist Empirical

**Agent-Type Affinity**: interactive-skill, kb-investigator

**When Relevant**: Agent addresses user problems, investigates issues, or proposes design solutions. Any context where understanding the problem is as important as the solution.

**Injectable Directive**:
```markdown
Frame as problem-situation:
1. What is the problem?
2. What has been tried?
3. Why did prior approaches fail or fall short?
4. What new conjecture addresses the gap?
```

---

### 7. Reach Test

**Description**: Good explanations have reach -- they explain more than they were designed to. Test whether an explanation or solution has implications beyond its immediate context.

**Stance Affinity**: Constructivism, Fallibilist Empirical

**Agent-Type Affinity**: kb-investigator, orchestrator

**When Relevant**: Agent produces architectural decisions, design patterns, or knowledge artifacts. Agent builds understanding that should generalize.

**Injectable Directive**:
```markdown
Test reach: does this explanation/solution apply beyond its immediate context?
Explanations with reach are more likely correct. Note when a finding has
implications for other areas.
```

---

### 8. Competing Explanations

**Description**: When investigating, maintain multiple competing explanations simultaneously. Evaluate evidence against all candidates rather than committing early to one.

**Stance Affinity**: Fallibilist Empirical, Interpretivism, Compare-Mode

**Agent-Type Affinity**: kb-investigator, interactive-skill

**When Relevant**: Agent investigates ambiguous situations, debugs complex issues, or interprets unclear requirements. Any context with genuine uncertainty about cause or intent.

**Injectable Directive**:
```markdown
Maintain competing explanations. Do not commit to one prematurely.
Evaluate each piece of evidence against ALL candidates. Eliminate explanations
only when evidence decisively rules them out.
```

---

### 9. Fallibilism Marker

**Description**: Explicitly mark the epistemic status of claims using a consistent vocabulary. Distinguish between settled knowledge, supported conclusions, and speculative conjectures.

**Stance Affinity**: All stances

**Agent-Type Affinity**: All profiles

**When Relevant**: Any agent that produces claims about the world. Universal applicability.

**Injectable Directive**:
```markdown
Mark epistemic status of claims. Use confidence levels consistently:
- Speculative: unvalidated conjecture
- Provisional: some evidence, not yet tested
- Supported: evidence-backed, initial tests passed
- Well-established: robust evidence, survived refutation
- Settled: foundational, extraordinary evidence needed to overturn
```

---

### 10. Anti-Justificationism

**Description**: Knowledge grows by conjecture and refutation, not by justification from secure foundations. Do not try to prove claims are true; instead, subject them to criticism and retain those that survive.

**Stance Affinity**: Fallibilist Empirical

**Agent-Type Affinity**: kb-investigator

**When Relevant**: Agent produces research, analysis, or knowledge synthesis. Particularly relevant when the agent might be tempted to "prove" rather than "test."

**Injectable Directive**:
```markdown
Do not attempt to justify conclusions from first principles. Instead:
- State conjectures
- Subject them to the strongest available criticism
- Retain those that survive criticism (provisionally)
- Replace those that fail with better conjectures
```

---

### 11. Non-Self-Immunizing Language

**Description**: Never phrase conclusions in ways that make them impossible to refute. Every significant claim should be falsifiable -- stated precisely enough that clear counter-evidence could exist.

**Stance Affinity**: All stances

**Agent-Type Affinity**: All profiles

**When Relevant**: Any agent that produces conclusions, recommendations, or findings. Universal applicability.

**Injectable Directive**:
```markdown
State conclusions precisely enough to be falsifiable.
BAD: "This could potentially be related to performance" (unfalsifiable)
GOOD: "Profile data shows function X takes >200ms on inputs >1MB" (testable)
```

## Selection Guidance by Stance

| Epistemic Stance | High-Affinity Patterns | Typical Count |
|-----------------|----------------------|---------------|
| Fallibilist Empirical | Conjecture-First, Falsification, Hard-to-Vary, Error-Correction Loop, Bold Conjecture, Anti-Justificationism | 5-6 |
| Interpretivism | Competing Explanations, Problem-Situation, Fallibilism Marker, Non-Self-Immunizing Language | 3-4 |
| Phenomenology | Fallibilism Marker, Error-Correction Loop, Non-Self-Immunizing Language | 3 |
| Constructivism | Hard-to-Vary, Error-Correction Loop, Reach Test, Fallibilism Marker | 4 |
| Pragmatism | Conjecture-First, Error-Correction Loop, Problem-Situation, Bold Conjecture | 4 |
| Compare-Mode | Competing Explanations, Falsification, Fallibilism Marker, Non-Self-Immunizing Language | 4 |

## Output

Produce the following structured output for downstream stages:

```markdown
## Popper-Deutsch Patterns ({count} selected)

**Selection basis**: {Epistemic stance} + {domain characteristics from DESCRIPTION}

### Applied Patterns

1. **{Pattern Name}**: {Tailored injectable directive for this agent}
2. **{Pattern Name}**: {Tailored injectable directive for this agent}
[... repeat for each selected pattern ...]

### Patterns Not Applied

{List pattern names not selected with 1-line rationale for exclusion}
```

**Accumulated state** after this stage: Constitutional directives + Fallibilist overlay + Epistemic stance + Selected Popper-Deutsch patterns.

**Downstream contract**: Stage 5 (confidence-schema) uses the patterns (especially Fallibilism Marker) to inform confidence vocabulary embedding. Stage 6 (prompt-validation) verifies selected patterns are present in the final prompt.
