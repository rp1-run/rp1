# Validation Scoring

Confidence-tier assignment and the C3+ promotion gate. Load during the
validating phase, once hypothesis-tester results are collected in §3.3.

### 3.4 Assign Confidence Tiers (C1-C4)

For each CONFIRMED lead, assign an ordinal confidence tier (C1=lowest/speculative, C4=highest/well-established) using the following rules:

**Base Tier Assignment** (before caps):
- **C1 (Speculative/Lowest)**: Smell or unvalidated conjecture; evidence incomplete or partially contradicted
  - Examples: Initial scan detected potential bloat but validation found unresolved safety flags; incomplete refutation coverage
- **C2 (Provisional)**: Reproducible supporting evidence but decision-critical test or evidence source is missing
  - Examples: Unused code detected but dynamic dispatch prevents definitive proof; no usage telemetry available for validation
- **C3 (Supported)**: Scope reasonably covered, counterevidence searches performed, no known contradiction
  - Examples: Unused code confirmed with no dynamic dispatch; hypothesis-tester found no consumers; usage data supports finding
- **C4 (Well-Established/Highest)**: Independent evidence converges and claim survived refutation attempt
  - Examples: Multiple validation methods confirm dead code; usage data confirms zero consumption; strong consensus across refutation checks

**Base Tier Rule** (`baseTierFromValidation`, fully deterministic from recorded evidence):

Every CONFIRMED lead carries a `validation_result` (§3.3) with `refutation_coverage` (`complete`|`minor-gaps`|`partial`|`contradicted`) and `unresolved_safety_flags` (list), both read back from the hypothesis-tester's per-hypothesis findings (`hypothesis-tester.md` §4: `Refutation Coverage` and `Safety Flags Unresolved` fields). The base tier is a pure function of these two recorded values — an unresolved safety flag is the recorded signal for missing decision-critical evidence, so it does not need a third input:

```javascript
function baseTierFromValidation(validationResult) {
  const { refutation_coverage, unresolved_safety_flags } = validationResult;

  if (refutation_coverage === "partial" || refutation_coverage === "contradicted") {
    return "C1"; // coverage incomplete or contradicted
  }
  if (unresolved_safety_flags.length > 0) {
    return "C2"; // missing decision-critical evidence or any unresolved safety flag
  }
  if (refutation_coverage === "minor-gaps") {
    return "C3"; // complete coverage with minor gaps, no unresolved flags
  }
  return "C4"; // complete refutation-vector coverage, all safety flags resolved
}
```

**Confidence Tier Caps** (hard upper bounds; may downgrade from base tier). Caps 1-3 consume `validationResult.unresolved_safety_flags` — the flags still standing AFTER validation — never the scout's original `safety_flags` list, which validation may have already resolved:

1. **Missing Usage-Proof Cap**: Usage-based claims (locus `dead_code` or cause `never_used`) require proof of non-usage for C3+
   - Rule: `tier <= C2` unless `usage_evidence` is `runtime-telemetry`, or is `static-complete` with none of `hidden_consumer`/`dynamic_dispatch`/`ecosystem_boundary` among `unresolved_safety_flags`
   - Rationale: C3+ requires proof of non-usage — either runtime telemetry or an exhaustive static reference search with dynamic patterns ruled out

2. **Dynamic Dispatch Cap**: For unused-code claims with dynamic dispatch still unresolved after validation
   - Rule: `if (locus == "dead_code" && unresolved_safety_flags.includes("dynamic_dispatch")) tier <= C2`
   - Rationale: Unresolved dynamic dispatch prevents definitive proof of non-usage; C3+ requires ruling out hidden dispatch

3. **Safety Flag Overload Cap**: If 3 or more unresolved safety flags remain after validation
   - Rule: `if (unresolved_safety_flags.length >= 3) tier <= C3`
   - Rationale: Multiple unresolved safety flags indicate high uncertainty; C4 requires strong convergence

4. **Speculative Generalization Cap**: For every confirmed speculative_generalization lead
   - Rule: `if (locus == "speculative_generalization") tier <= C3`
   - Rationale: Confirmation for this locus means the refutation search found no consumers — codebase analysis alone cannot establish that speculative generality will never be needed, so C4 requires independent evidence convergence (e.g. roadmap or telemetry) that this workflow does not collect

**Tier Assignment Algorithm**:

```javascript
function assignConfidenceTier(lead, validationResult) {
  // Confidence tier mapping: C1=1 (Speculative/Lowest), C4=4 (Well-Established/Highest)
  const tierValues = { "C1": 1, "C2": 2, "C3": 3, "C4": 4 };
  const valueTiers = { 1: "C1", 2: "C2", 3: "C3", 4: "C4" };

  // Start with base tier from hypothesis-tester result
  const baseTierStr = baseTierFromValidation(validationResult); // "C1", "C2", "C3", or "C4"
  let tierValue = tierValues[baseTierStr];

  // Apply caps (hard upper bounds; may downgrade from base tier).
  // Caps consume post-validation unresolved flags — a flag the tester resolved must not keep capping.
  const unresolvedFlags = validationResult.unresolved_safety_flags;

  // Missing Usage-Proof Cap: usage-based claims need telemetry or complete static proof for C3+
  const usageBased = lead.locus === "dead_code" || lead.cause === "never_used";
  const staticProof = lead.usage_evidence === "static-complete" &&
    !unresolvedFlags.some(f => ["hidden_consumer", "dynamic_dispatch", "ecosystem_boundary"].includes(f));
  if (usageBased && lead.usage_evidence !== "runtime-telemetry" && !staticProof) {
    tierValue = Math.min(tierValue, tierValues["C2"]); // Clamp to 2
  }

  // Dynamic Dispatch Cap: max C2 for unused-code claims with dispatch still unresolved
  if (lead.locus === "dead_code" && unresolvedFlags.includes("dynamic_dispatch")) {
    tierValue = Math.min(tierValue, tierValues["C2"]); // Clamp to 2
  }

  // Safety Flag Overload Cap: max C3 if 3+ flags remain unresolved after validation
  if (unresolvedFlags.length >= 3) {
    tierValue = Math.min(tierValue, tierValues["C3"]); // Clamp to 3
  }

  // Speculative Generalization Cap: max C3 — confirmation here means no consumers were found,
  // and codebase analysis alone cannot prove speculative generality is safe to call C4
  if (lead.locus === "speculative_generalization") {
    tierValue = Math.min(tierValue, tierValues["C3"]); // Clamp to 3
  }

  return valueTiers[tierValue];
}
```

**Tier Assignment Notation** (for reporting):

Store: `{ lead_id, status: "CONFIRMED", confidence_tier: "{C1|C2|C3|C4}", tier_reasoning: "..." }`

Examples:
- "C1: Initial detection only; multiple unresolved safety flags present; limited refutation coverage; speculative finding"
- "C2: Evidence present but dynamic dispatch prevents definitive proof; no usage telemetry available; decision-critical test missing"
- "C3: Scope reasonably covered; hypothesis-tester found no refutation; no unresolved safety flags; usage data supports claim"
- "C4: Strong evidence convergence; independent validation methods agree; claim survived rigorous refutation testing; production-ready confidence"

### 3.5 C3+ Promotion Gate and Lead Routing

After confidence tier assignment, apply the C3+ promotion gate to route confirmed leads into appropriate buckets:

**Promotion Gate Logic**:

```javascript
// Separate confirmed leads into two queues based on confidence tier
const findings_queue = [];    // C3-C4 leads: eligible for final findings section
const needs_measurement = []; // C1-C2 leads: require additional evidence/telemetry

for (const lead of confirmed_leads) {
  const tierValue = { "C1": 1, "C2": 2, "C3": 3, "C4": 4 }[lead.confidence_tier];

  if (tierValue >= 3) {  // C3 or C4
    findings_queue.push(lead);
  } else {  // C1 or C2
    needs_measurement.push({
      ...lead,
      missing_evidence: describeMissingEvidenceForTier(lead.confidence_tier, lead)
    });
  }
}

// Sort findings_queue by materiality (highest first) for final ranking
findings_queue.sort((a, b) => b.materiality_score - a.materiality_score);
```

**Routing Summary**:

1. **Findings Queue (C3-C4)**: Confirmed leads with sufficient evidence; eligible for the final findings section (max 5 findings in report)
2. **Needs Measurement Queue (C1-C2)**: Confirmed leads requiring additional telemetry or evidence to reach C3+; will be documented in "Needs Measurement" section of report
3. **Retain Register**: All REJECTED leads with refutation evidence; documented for transparency on why leads were excluded
