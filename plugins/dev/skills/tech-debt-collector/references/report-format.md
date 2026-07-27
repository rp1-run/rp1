# Report Format

Report generation and the per-finding template. Load during the reporting
phase, after §4.1 emits the reporting state.

### 4.2 Report Generation

**Objective**: Generate the final report artifact with findings section (C3-C4 only, max 5), needs-measurement queue, retain register, and methodology.

**Step 1: Verify the Pinned Snapshot (Base/Head SHAs)**

`BASE_COMMIT`/`HEAD_COMMIT` were pinned in §1.2 before any scout ran — those pinned values are what the report header states. Re-resolve the same refs now (same commands as §1.2) and compare: if either SHA differs from its pinned value, the underlying ref moved mid-run and the findings no longer describe a verifiable snapshot. In that case emit `reporting` with `{"status": "failed", "reason": "snapshot_drift", "pinned_head": "$HEAD_COMMIT", "current_head": "<re-resolved value>"}` and STOP with a message telling the operator to re-run against the updated ref. Do not write a report attributing findings to SHAs that were not analyzed.

**Step 2: Select Top 5 Findings from C3-C4 Queue**

From the findings_queue (already sorted by materiality from Phase 3):

```bash
# Take top 5 findings (or fewer if insufficient C3+ leads)
FINAL_FINDINGS_COUNT=$(( ${#findings_queue[@]} > 5 ? 5 : ${#findings_queue[@]} ))
FINAL_FINDINGS=("${findings_queue[@]:0:$FINAL_FINDINGS_COUNT}")
```

**Step 3: Read the Canonical Template**

Read `plugins/base/skills/artifact-templates/templates/tech-debt-collector/report.md` (fall back to the `rp1-base:artifact-templates` SKILL.md Template Index if the direct path fails). The template body is the single source of truth for report structure — do not invent a parallel skeleton.

**Step 4: Fill Template Placeholders**

Fill `{RUN_ID}`, `{Date}`, `{SCOPE_TYPE}`, `{TARGET}`, `{BASE_COMMIT}`, `{HEAD_COMMIT}`, `{LENSES_USED}`, `{LENSES_APPLIED}`, `{DISPATCH_COUNT}`, `{HYPOTHESIS_COUNT}`, and all lead-count placeholders from Phase 2/3 state. Fill the three section placeholders as follows.

`{FINDINGS_SECTION}` — for each of the top 5 findings (ranked 1-5 by materiality):

```markdown
### Finding {RANK}: {TITLE}

**Claim**: {ATOMIC_CLAIM}

**Confidence Tier**: {C3|C4} ({TIER_DEFINITION})

**Materiality Score**: {SCORE}

**Evidence Summary**: {PROSE_SUMMARY_OF_EXACT_SITES_AND_BURDEN}

**Exact Sites**:
- {file}: {lines} ({symbol})
- {file}: {lines} ({symbol})

**Burden Signal**: {METRIC} = {VALUE} {UNIT}
  (e.g., "10 files affected", "42 transitive dependencies", "1,247 LoC", "~5 CI minutes savings")

**Action: {ACTION_TITLE}**

Steps:
1. {specific step}
2. {specific step}
3. {specific step}

Expected Side Effects:
- {side effect}
- {side effect}

Validation Checks:
- [ ] {check} (e.g., "Test suite passes", "No import errors", "CI/CD succeeds", "Import time reduced")
- [ ] {check}

**Rollback Plan**: {PROCEDURE}

Recovery Time Estimate: {TIME} (e.g., "~5 minutes", "< 2 hours")
```

If `FINDINGS_COUNT == 0`, fill with: "**No findings at C3+ confidence level.** Insufficient evidence for actionable recommendations at this time. See Needs Measurement section for leads requiring additional investigation."

`{NEEDS_MEASUREMENT_SECTION}` — for each C1-C2 confirmed lead (or "No leads in needs-measurement queue." when empty):

```markdown
- **Claim**: {CLAIM}
  - **Current Confidence**: {C1|C2} ({TIER_DEFINITION})
  - **Missing Evidence**: {DESCRIPTION_OF_MISSING_DATA}
  - **Required to Reach C3**: {ACTION_TO_INCREASE_CONFIDENCE}
```

`{RETAIN_REGISTER_SECTION}` — for each refuted lead (or "No refuted leads." when empty):

```markdown
- **Claim**: {CLAIM}
  - **Refutation Evidence**: {REASON_FOR_REJECTION}
  - **Status**: REJECTED
```

**Step 5: Write the Report**

Write the filled template to `{workRoot}/features/tech-debt-collector/report.md` using the Write tool. This is the executable production step — the file must exist on disk before Step 6 registration. Writing this work artifact is explicitly permitted by the analysis-only constraint (§6.1).

**Step 6: Register Report Artifact to Arcade**

After report file is written, verify file exists and emit artifact_registered event:

```bash
# Verify report file exists before registration (no race conditions)
REPORT_FILE="{workRoot}/features/tech-debt-collector/report.md"
if [ ! -f "$REPORT_FILE" ]; then
  echo "⚠️  Warning: Report file not found at $REPORT_FILE. Emit skipped."
  EMIT_STATUS="skipped"
else
  # Emit artifact_registered event for Arcade discovery
  rp1 agent-tools emit \
    --workflow tech-debt-collector \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step reporting \
    --data '{"path": "features/tech-debt-collector/report.md", "feature": "tech-debt-collector", "storageRoot": "work_dir"}' \
    2>/dev/null || {
      echo "⚠️  Warning: artifact_registered emit failed. Report is ready but not discoverable via Arcade yet."
      EMIT_STATUS="failed"
    }
  [ $? -eq 0 ] && EMIT_STATUS="success" || EMIT_STATUS="failed"
fi
```

**Emission Success Criteria**:
- ✅ Report file exists at `.rp1/work/features/tech-debt-collector/report.md`
- ✅ `artifact_registered` event emitted with correct parameters
- ✅ `--workflow tech-debt-collector` matches skill name
- ✅ `--step reporting` is valid state and transition from `validating` is valid
- ✅ `--run-id {RUN_ID}` provided by rp1 runtime
- ✅ Emit data includes `path`, `feature`, and `storageRoot: "work_dir"`
- ✅ Errors logged as warnings; report availability unaffected

**Step 7: Emit Reporting Complete**

```bash
rp1 agent-tools emit \
  --workflow tech-debt-collector \
  --type status_change \
  --run-id {RUN_ID} \
  --step reporting \
  --data "{\"status\": \"completed\", \"findings_count\": $FINAL_FINDINGS_COUNT, \"report_path\": \"features/tech-debt-collector/report.md\", \"artifact_emit_status\": \"$EMIT_STATUS\"}"
```

**Reporting Phase Complete**: Report artifact is written and registered to Arcade (if successful). Workflow transitions to completed state.

---
