---
name: knowledge-build
description: "Orchestrates parallel KB generation using spatial analysis and a map-reduce architecture with incremental and feature-learning modes."
allowed-tools: Bash(echo *), Bash(rp1 *), Bash(git *), Bash(jq *), Bash(wc *), Bash(mkdir *)
metadata:
  version: 2.2.1
  tags:
    - documentation
    - analysis
    - planning
    - core
    - parallel
  created: 2025-10-25
  updated: 2026-04-03
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature ID to incorporate learnings from an archived or active feature into KB"
  sub_agents:
    - "rp1-base:kb-spatial-analyzer"
    - "rp1-base:kb-concept-extractor"
    - "rp1-base:kb-architecture-mapper"
    - "rp1-base:kb-interaction-mapper"
    - "rp1-base:kb-module-analyzer"
    - "rp1-base:kb-pattern-extractor"
---

# Knowledge Build

§ROLE: KB orchestrator. Update `.rp1/context/`, not `.rp1/work/`.

## §CTX

- Run `rp1 agent-tools rp1-root-dir` once. Extract `projectRoot`, `kbRoot`, `workRoot`.
- KB outputs live under `kbRoot`:
  - `index.md`
  - `concept_map.md`
  - `architecture.md`
  - `interaction-model.md`
  - `modules.md`
  - `patterns.md`
  - `state.json`
  - `meta.json`
- `index.md` is orchestrator-owned. Never delegate it.
- `state.json` is shareable. `meta.json` is local-only and SHOULD be gitignored.
- Exclude these paths from change scope and file hygiene:
  - `node_modules/`, `.git/`, `build/`, `dist/`, `cli/dist/`, `target/`, `.next/`, `__pycache__/`, `vendor/`, `.venv/`, `.rp1/context/`

## §DO

- Execute immediately. No approval loop.
- Single pass. No refinement loop.
- Treat this as an orchestrator, not a wrapper.
- `FULL` means wide evidence collection, not blank-slate regeneration.
- When prior KB exists, section agents MUST reconcile against it, even in `FULL`.
- Section agents MUST also treat prior KB as incomplete and perform one explicit novelty scan for material knowledge absent from it.
- Replace all placeholders with concrete values before dispatching child agents.
- Spawn the 5 analysis agents in one parallel batch.
- Wait patiently for child agents on the critical path. Do not declare them stalled after a short wait.
- Keep user-visible output terse:
  1. Initial status line
  2. Sparse progress only when useful
  3. Final report or fatal error

## §PROC

### 1. Detect Mode

1. Resolve directories via `rp1-root-dir`. Create `kbRoot` if missing.
2. If `FEATURE_ID` is non-empty:
   - Set `MODE=FEATURE_LEARNING`.
   - Search, in order:
     - `{workRoot}/archives/features/{FEATURE_ID}`
     - `{workRoot}/features/{FEATURE_ID}`
   - If neither exists: report the checked paths, stop.
   - Read:
     - `requirements.md`
     - `design.md`
     - `field-notes.md` if present
     - `tasks.md`
   - Extract `FILES_MODIFIED` from `tasks.md` implementation summaries.
     Accept patterns like `**Files**:` and `**Files Modified**:`.
   - If `FILES_MODIFIED` is empty: explain that feature learning needs a concrete file scope, stop.
   - Build `FEATURE_CONTEXT` with:
     - feature id
     - feature path
     - summarized requirements
     - architectural decisions
     - discoveries from field notes
     - implementation patterns
     - `files_modified`
   - Set:
     - `FILE_SCOPE=FILES_MODIFIED`
     - `FILE_DIFFS={}`
     - `INITIAL_MESSAGE=Feature learning build for {FEATURE_ID}`
3. Else use git-driven mode:
   - Read `{kbRoot}/state.json` if it exists.
   - Get `CURRENT_COMMIT` via `git rev-parse HEAD`.
   - If no `state.json`:
     - Set `MODE=FULL`
     - `FILE_SCOPE=[]`
     - `FILE_DIFFS={}`
     - `INITIAL_MESSAGE=First-time KB generation with parallel analysis (10-15 min)`
   - Else read:
     - `OLD_COMMIT=state.json.git_commit`
     - `REPO_TYPE=state.json.repo_type // "single-project"`
     - `repo_root` + `current_project_path` from `{kbRoot}/meta.json`
     - Fallback: use `state.json` for those local fields only if `meta.json` is absent
   - If `OLD_COMMIT == CURRENT_COMMIT`:
     - Output `KB is up-to-date (commit {CURRENT_COMMIT}). No regeneration needed.` and stop
   - Build scoped changed-file list:
     - If `REPO_TYPE=monorepo`, run diff from `repo_root` and filter to `current_project_path` unless it is `.` or empty
     - Else diff the current repo normally
     - Drop excluded paths and obviously irrelevant binary/media files
   - If scoped change list is empty:
     - Update only `git_commit` in `state.json`
     - Keep all other fields unchanged
     - Output `No in-scope changes. Updated commit reference ({OLD_COMMIT} -> {CURRENT_COMMIT}).` and stop
   - Preserve the full scoped changed-file list as the evidence frontier in both `FULL` and `INCREMENTAL`.
   - Count changed files:
     - `> 50` -> `MODE=FULL`
     - `<= 50` -> `MODE=INCREMENTAL`
   - If `MODE=FULL`:
     - `INITIAL_MESSAGE=Large change set ({N} files). Wide reconcile (10-15 min)`
     - `FILE_SCOPE=<scoped changed files>`
     - Build `FILE_DIFFS` as `path -> git diff OLD_COMMIT CURRENT_COMMIT -- path`
   - If `MODE=INCREMENTAL`:
     - `INITIAL_MESSAGE=Changes detected since last build ({OLD_COMMIT} -> {CURRENT_COMMIT}). Analyzing {N} changed files (2-5 min)`
     - `FILE_SCOPE=<scoped changed files>`
     - Build `FILE_DIFFS` as `path -> git diff OLD_COMMIT CURRENT_COMMIT -- path`
4. Print `INITIAL_MESSAGE`.

### 2. Spatial Analysis

1. Spawn the spatial analyzer with the actual mode and changed-file frontier:

{% dispatch_agent "rp1-base:kb-spatial-analyzer" %}
Use the computed build inputs from the parent orchestrator.

- MODE: actual build mode (`FULL`, `INCREMENTAL`, or `FEATURE_LEARNING`)
- CHANGED_FILES: actual JSON array for the scoped changed-file list when available; empty only for first-time `FULL`
- Task: rank files 0-5 and categorize them into `index_files`, `concept_files`, `arch_files`, `interaction_files`, `module_files`
- Return JSON only with:
  - `repo_type`
  - `monorepo_projects`
  - `total_files_scanned`
  - `index_files`
  - `concept_files`
  - `arch_files`
  - `interaction_files`
  - `module_files`
  - `local_meta`
Do not echo placeholder tokens.
{% enddispatch_agent %}

2. Parse and validate the JSON.
3. Fatal if:
   - JSON missing
   - required keys missing
   - all file categories empty
4. Store:
   - `repo_type`
   - `monorepo_projects`
   - `local_meta.repo_root`
   - `local_meta.current_project_path`

### 3. Parallel Analysis

1. Compute:
  - `PATTERN_FILES = unique(concept_files + module_files)`
  - `INTERACTION_FILES = unique(interaction_files)`
  - per-agent diff subsets from `FILE_DIFFS`
2. Spawn all 5 analyzers in one batch:

{% dispatch_agent "rp1-base:kb-concept-extractor", background %}
Use the parent-computed inputs.

- MODE: actual mode
- REPO_TYPE: actual repo type
- CONCEPT_FILES_JSON: actual JSON array
- FILE_DIFFS: actual diff subset JSON or empty object
- FEATURE_CONTEXT: actual feature context JSON or empty object
- Task: return JSON only for `concept_map.md`
{% enddispatch_agent %}

{% dispatch_agent "rp1-base:kb-architecture-mapper", background %}
Use the parent-computed inputs.

- MODE: actual mode
- REPO_TYPE: actual repo type
- ARCH_FILES_JSON: actual JSON array
- FILE_DIFFS: actual diff subset JSON or empty object
- FEATURE_CONTEXT: actual feature context JSON or empty object
- Task: return JSON only for `architecture.md`
{% enddispatch_agent %}

{% dispatch_agent "rp1-base:kb-interaction-mapper", background %}
Use the parent-computed inputs.

- MODE: actual mode
- REPO_TYPE: actual repo type
- INTERACTION_FILES_JSON: actual JSON array
- FILE_DIFFS: actual diff subset JSON or empty object
- FEATURE_CONTEXT: actual feature context JSON or empty object
- Task: return JSON only for `interaction-model.md`
{% enddispatch_agent %}

{% dispatch_agent "rp1-base:kb-module-analyzer", background %}
Use the parent-computed inputs.

- MODE: actual mode
- REPO_TYPE: actual repo type
- MODULE_FILES_JSON: actual JSON array
- FILE_DIFFS: actual diff subset JSON or empty object
- FEATURE_CONTEXT: actual feature context JSON or empty object
- Task: return JSON only for `modules.md`
{% enddispatch_agent %}

{% dispatch_agent "rp1-base:kb-pattern-extractor", background %}
Use the parent-computed inputs.

- MODE: actual mode
- REPO_TYPE: actual repo type
- PATTERN_FILES_JSON: actual JSON array
- FILE_DIFFS: actual diff subset JSON or empty object
- FEATURE_CONTEXT: actual feature context JSON or empty object
- Task: return JSON only for `patterns.md`
- Constraint: rendered `patterns.md` MUST stay <=150 lines
{% enddispatch_agent %}

3. Wait for all 5 agents to finish.
4. Parse JSON from each response.
5. Failure policy:
   - 0 failures: continue normally
   - 1 failure: continue, but generate a placeholder section for the failed file and report partial success
   - 2+ failures: do not write partial KB, stop

### 4. Reduce + Write

1. Load `rp1-base:knowledge-base-templates`.
2. Merge analyzer output into:
   - `concept_map.md`
   - `architecture.md`
   - `interaction-model.md`
   - `modules.md`
   - `patterns.md`
3. Validate the `architecture.md` Mermaid diagram via `rp1-base:mermaid`.
   - If invalid: simplify or omit the broken diagram, do not fail the whole run for diagram syntax alone.
4. Write these files first:
   - `{kbRoot}/concept_map.md`
   - `{kbRoot}/architecture.md`
   - `{kbRoot}/interaction-model.md`
   - `{kbRoot}/modules.md`
   - `{kbRoot}/patterns.md`
5. Count lines for the written markdown files.
6. Generate `index.md` directly from aggregated results plus measured line counts.
7. Write `{kbRoot}/index.md` last.
8. Write `{kbRoot}/state.json` with:
   - `strategy=parallel-map-reduce`
   - `repo_type`
   - `monorepo_projects`
   - `generated_at`
   - `git_commit`
   - `files_analyzed`
   - `languages`
   - `metrics`
9. Write `{kbRoot}/meta.json` with:
   - `repo_root`
   - `current_project_path`
10. `meta.json` is local-only. Write it, but do not register it anywhere.

## §FAIL

Fatal errors:
- missing feature path
- empty `FILES_MODIFIED` in feature mode
- git failure during git-driven mode
- spatial analyzer failure or invalid JSON
- template load failure
- repeated write failure
- 2+ analyzer failures

On any fatal error:
- output a concise message naming the failed phase + cause
- stop immediately

## §OUT

User-visible output only:
- Initial mode/status line
- Optional high-level progress line when the run is long
- Final report

Final report must include:
- overall result:
  - `Knowledge Base Generated Successfully`
  - `Feature Learnings Captured`
  - or `Partial KB Generated`
- repository type
- files analyzed
- files written under `.rp1/context/`
- note that this passive workflow does not register an Arcade run
- reminder: agents load KB automatically; no manual `knowledge-load` needed
