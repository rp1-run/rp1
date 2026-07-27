# Prior Run Archival

Archives artifacts from a previous tech-debt run. Load during scoping only
when a prior run's artifacts are present.

### 1.4 Archive Prior Run Artifacts

Before this run writes `leads.json`, `hypotheses.md`, or `report.md`, archive any surviving artifacts from a prior run so they remain retrievable. The prior run's ID is recovered from `report.md`'s `**Run ID**` field when present; fall back to a UTC timestamp when `report.md` is missing or unparseable (e.g. the prior run never reached the reporting phase):

```bash
WORK_DIR="{workRoot}/features/tech-debt-collector"
PRIOR_REPORT="$WORK_DIR/report.md"

PRIOR_RUN_ID=""
if [ -f "$PRIOR_REPORT" ]; then
  PRIOR_RUN_ID=$(grep -m1 '^\*\*Run ID\*\*:' "$PRIOR_REPORT" | sed 's/^\*\*Run ID\*\*: *//')
  # The recovered ID names a directory segment under runs/ — reject anything that
  # could escape it (path separators, leading dots) and fall through to the timestamp.
  [[ "$PRIOR_RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || PRIOR_RUN_ID=""
fi
[ -z "$PRIOR_RUN_ID" ] && PRIOR_RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)

if [ -f "$WORK_DIR/leads.json" ] || [ -f "$WORK_DIR/hypotheses.md" ] || [ -f "$PRIOR_REPORT" ]; then
  ARCHIVE_DIR="$WORK_DIR/runs/$PRIOR_RUN_ID"
  mkdir -p "$ARCHIVE_DIR"
  [ -f "$WORK_DIR/leads.json" ] && mv "$WORK_DIR/leads.json" "$ARCHIVE_DIR/"
  [ -f "$WORK_DIR/hypotheses.md" ] && mv "$WORK_DIR/hypotheses.md" "$ARCHIVE_DIR/"
  [ -f "$PRIOR_REPORT" ] && mv "$PRIOR_REPORT" "$ARCHIVE_DIR/"
fi
```

This is a `mkdir`+`mv` relocation confined to `{workRoot}/features/tech-debt-collector/`, not a read of archived content — permitted under §6.1. The hypothesis-tester's fixed feature-ID-keyed read path (`{workRoot}/features/tech-debt-collector/hypotheses.md`, §3.2) is unaffected: this run writes a fresh `hypotheses.md` at that same path in §3.2 Step 1, after the prior copy has already been moved aside. New artifact registrations in §4.2 Step 6 continue to point at the fixed, non-archived path and are unambiguously distinguishable from the archived prior run under `runs/<prior-run-id>/`.
