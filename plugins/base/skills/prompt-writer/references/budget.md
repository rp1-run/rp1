# Governance Budget

Hard cap: built prompts must not exceed **15% governance/epistemic content** relative to total artifact lines (excluding YAML frontmatter).

## Line Classification

| Governance (counted) | NOT governance (excluded) |
|----------------------|---------------------------|
| Constitutional directives (Stage 1) | Role/identity declarations |
| Fallibilist overlay clauses (Stage 2) | Output format specs |
| Epistemic stance + contract (Stage 3) | Business/domain logic |
| Popper-Deutsch pattern injections (Stage 4) | Tool/API references |
| Confidence schema sections (Stage 5) | Domain-specific error handling |

## Per-Stage Caps

| Stage | Max Output | Trim Strategy |
|-------|-----------|---------------|
| Constitutional Checklist | 5 directives, 1-2 lines each | Drop lowest-priority primitives |
| Fallibilist Overlay | 3 lines total | Merge into single terse block |
| Epistemic Stance | 3 lines (stance + 2-line contract) | Single-sentence contract only |
| Popper Patterns | 3 lines (pattern names as keywords) | List names only, no descriptions |
| Confidence Schema | 2 lines (scale reference) | Inline as single sentence |

## Enforcement Protocol

1. Count `total_lines` (exclude YAML frontmatter block)
2. Count `governance_lines` (sum of classified sections above)
3. Compute `ratio = governance_lines / total_lines`
4. If `ratio > 0.15`:
   a. Compress each governance section using tersify discipline
   b. Merge adjacent governance sections where possible
   c. Remove exemplar citations and verbose explanations
   d. Recount and verify compliance
5. Record budget metrics in confidence report:
   - `total_lines`, `governance_lines`, `ratio`, `trimmed` (bool)
