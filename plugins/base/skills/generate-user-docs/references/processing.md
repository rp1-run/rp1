# Doc Processing

Applies approved changes to user documentation. Load after the approval step
returns an approved change set.

### 5. Process

Set `PROCESS_FILES = Object.keys(AGGREGATED.files)`.
Batch into groups of 5.

Spawn one background `rp1-base:scribe` per batch:

{% dispatch_agent "rp1-base:scribe", background %}
MODE: process
FILES: {actual JSON array of project-relative paths for this batch}
KB_ROOT: {kbRoot}
SCAN_RESULTS_PATH: {workRoot}/{SCAN_RESULTS_REL}
STYLE: {actual JSON.stringify(STYLE_CONFIG)}

Task: return JSON only with:
- `mode`
- `results`
- `summary`
- optional `errors`
{% enddispatch_agent %}

Wait for all process agents to finish.

For each response:
- Parse JSON
- Valid only if:
  - `mode == "process"`
  - `results` is an array

If no process batch response is valid:
- Output `ERROR: Process phase failed before any valid result was returned.`
- Transition to `failed`
- STOP

Aggregate file outcomes:
- `SUCCESSFUL_FILES`: `status == "success"`
- `PARTIAL_FILES`: `status == "partial"`
- `FAILED_FILES`: `status == "failed"`

Rules:
- `success` and `partial` both count as processed
- `partial` means useful edits landed, but some edits failed or review markers were inserted
- `failed` means the file was not usefully updated

Build:
```json
{
  "files_processed": 0,
  "files_succeeded": 0,
  "files_partial": 0,
  "files_failed": 0,
  "total_sections_verified": 0,
  "total_sections_added": 0,
  "total_sections_fixed": 0,
  "total_edits_applied": 0,
  "failed_files": []
}
```

Count section and edit totals from both `SUCCESSFUL_FILES` and `PARTIAL_FILES`.

Final report:
```
Documentation Sync Complete

KB used: {AGGREGATED.kb.state}
- Commits behind at scan start: {AGGREGATED.kb.commits_behind}

Files processed: {files_processed}
- Succeeded: {files_succeeded}
- Partial: {files_partial}
- Failed: {files_failed}

Changes applied:
- Sections verified: {total_sections_verified}
- Sections added: {total_sections_added}
- Sections fixed: {total_sections_fixed}
- Total edits: {total_edits_applied}

Scan results: {workRoot}/{SCAN_RESULTS_REL}

Git-ready: docs: sync {files_succeeded + files_partial} files with KB ({total_edits_applied} edits)
```

If `failed_files` is non-empty:
- List up to 10 lines as `{path}: {first error or fallback message}`

If `files_succeeded + files_partial == 0`:
- Transition to `failed`
- STOP after the report

Do NOT delete `SCAN_RESULTS_PATH`.
Transition to `finalize`.
