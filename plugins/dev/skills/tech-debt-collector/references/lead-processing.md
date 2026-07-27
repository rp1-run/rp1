# Lead Processing

Root-cause clustering and materiality ranking applied to scout output. Load
during scouting, once the scout agent returns leads.

### 2.3 Cluster Leads by Root Cause

After collecting leads from all dispatches:

**Clustering Algorithm**:
1. For each lead, derive `module` = the directory portion (all path segments except the filename) of `exact_sites[0].file` — the lead's primary exact site
2. Group leads by `(locus, cause, module)` tuple — locus/cause alone is not sufficient; leads whose primary sites live in unrelated modules never merge, even with matching locus/cause
3. For each group, identify canonical representative (highest internal confidence from scout) — unchanged
4. Merge overlapping claims within a group (e.g., claims referencing the same file/module) — unchanged
5. Preserve safety flags across merged leads (union of all flags from group) — unchanged

**Example**:
- **Cluster A** (dead_code, never_used, `src/legacy/factory`): Modules A, B, C never referenced
  - Merge: "Modules A, B, C are all unused exports from `src/legacy/factory/factory.ts`"
  - Safety flags: [hidden_consumer]
- **Cluster B** (dead_code, never_used, `src/billing/adapters`): unrelated dead-code lead sharing the same `(locus, cause)` as Cluster A but a different module
  - Stays separate from Cluster A despite the matching locus/cause, because its primary exact site is in `src/billing/adapters`
- **Cluster C** (over_abstraction, unmatched_generality, `src/foo`): Generic factory patterns without current use
  - Merge: "Generic factory abstractions in `src/foo/factories.ts` lack consumers"
  - Safety flags: [dynamic_dispatch, ecosystem_boundary]

Result: ~10-15 clustered leads from all dispatches.

### 2.4 Rank by Materiality

**Materiality Scoring Algorithm**: each lead carries exactly one `burden_signal {metric, value, unit}`. Score it against the documented per-metric weight — never against fields the schema does not carry:

```javascript
WEIGHT = { files: 100, dependencies: 50, loc: 0.01, ci_minutes: 20 };
materiality_score = burden_signal.value * WEIGHT[burden_signal.metric];
```

**Ranking Tiebreaker**:
- Primary: burden signal (computed above)
- Secondary: safety flag count (fewer = higher ranking; safety flags indicate uncertainty)
- Tertiary: locus priority (dead_code > over_abstraction > redundant_abstraction > speculative_generalization)

**Sort and Select**:
1. Sort all clustered leads by (materiality_score DESC, safety_flag_count ASC, locus_priority DESC)
2. Select top 8 leads for validation queue
3. Document remaining leads for later phases (needs-measurement, secondary-queue)
