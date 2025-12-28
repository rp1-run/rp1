---
name: generate-user-docs
version: 1.0.0
description: Synchronizes user documentation with knowledge base using two-phase map-reduce orchestration
argument-hint: ""
tags:
  - documentation
  - sync
  - analysis
  - parallel
created: 2025-12-28
updated: 2025-12-28
author: cloud-on-prem/rp1
---

# Generate User Docs - Two-Phase Map-Reduce Orchestrator

This command orchestrates user documentation synchronization with the auto-generated knowledge base using a two-phase map-reduce architecture.

**CRITICAL**: This is an ORCHESTRATOR command, not a thin wrapper. It coordinates scan and process phases across multiple scribe subagents.

## Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| RP1_ROOT | Environment | `.rp1/` | Root directory for KB and state artifacts |

<rp1_root>
{{RP1_ROOT}}
</rp1_root>

## Architecture Overview

```
Phase 0   (Sequential):  KB Sync Validation → Block if stale
Phase 1   (Sequential):  Doc Discovery + Style Sampling
Phase 2   (Parallel):    N x scribe agents (mode=scan) → Classifications
Phase 3   (Sequential):  Scan Aggregation → scan_results.json → User Approval
Phase 4   (Parallel):    N x scribe agents (mode=process) → Direct Edits
Phase 5   (Sequential):  Result Aggregation → Final Report
```

**Key Design**: External state (`scan_results.json`) bridges the two phases, keeping orchestrator context minimal (~3KB).

## Execution Instructions

**DO NOT ask for user approval before Phase 3. Execute scan phase immediately.**

### Phase 0: KB Sync Validation

**Purpose**: Ensure documentation generation uses current knowledge base. Stale KB leads to incorrect verification decisions and documentation updates.

**CRITICAL**: This phase MUST complete successfully before any other phases execute.

#### Step 0.1: Check KB State File Exists

Use Glob tool to check if state.json exists:
```
Pattern: {{RP1_ROOT}}/context/state.json
```

**If NOT found** - KB has never been built:
```
ERROR: Knowledge base not found.

The knowledge base must be generated before synchronizing documentation.
This ensures docs are verified against accurate system knowledge.

To generate the knowledge base, run:
  /rp1-base:knowledge-build

After KB generation completes, re-run this command.
```
**EXIT IMMEDIATELY** - do not proceed to any other phase.

#### Step 0.2: Read KB State

Use Read tool to read the state file:
```
Read: {{RP1_ROOT}}/context/state.json
```

Parse the JSON and extract these fields:
- `generated_at` - ISO 8601 timestamp of last KB build
- `git_commit` - Git commit hash at KB generation time

**If git_commit is missing or empty**:
```
ERROR: Invalid KB state - missing git commit reference.

The state.json file is malformed or was created by an older version.
Run /rp1-base:knowledge-build to regenerate the KB.
```
**EXIT IMMEDIATELY** - do not proceed.

Store extracted values:
```
KB_GENERATED_AT = {{generated_at}}
KB_GIT_COMMIT = {{git_commit}}
```

#### Step 0.3: Verify Git Commit Exists

Use Bash to verify the KB commit exists in git history:
```bash
git cat-file -t {{KB_GIT_COMMIT}} 2>/dev/null || echo "INVALID"
```

**If output is "INVALID"** - KB references a commit not in history (rebased, force-pushed):
```
ERROR: KB references unknown git commit.

The KB was built at commit {{KB_GIT_COMMIT}} which no longer exists
in git history (possibly due to rebase or force push).

Run /rp1-base:knowledge-build to regenerate the KB.
```
**EXIT IMMEDIATELY** - do not proceed.

#### Step 0.4: Check for Code Changes Since KB Build

Use Bash to detect files changed since KB commit that would affect KB content:
```bash
git diff --name-only {{KB_GIT_COMMIT}} HEAD -- \
  '*.ts' '*.tsx' '*.js' '*.jsx' \
  '*.py' '*.rs' '*.go' '*.java' \
  '*.md' '*.mdx' \
  'package.json' 'Cargo.toml' 'go.mod' 'pyproject.toml' \
  2>/dev/null | head -30
```

This checks:
- Source code files (TypeScript, JavaScript, Python, Rust, Go, Java)
- Documentation files (Markdown)
- Dependency manifests (package.json, Cargo.toml, etc.)

#### Step 0.5: Determine Sync Status

**If files were found** (KB is STALE):

Count the changed files and prepare error message:
```
ERROR: Knowledge base is out of sync.

KB Generated: {{KB_GENERATED_AT}}
KB Commit:    {{KB_GIT_COMMIT}} (short: {{first 7 chars}})
Current HEAD: {{git rev-parse HEAD}}

Files changed since KB build (showing up to 30):
{{list of changed files}}

Documentation generation requires current KB to ensure accuracy.
Run /rp1-base:knowledge-build first, then re-run this command.
```
**EXIT IMMEDIATELY** - do not proceed to any other phase.

**If NO files were found** (KB is CURRENT):

Log success and proceed:
```
KB sync verified
  Commit: {{KB_GIT_COMMIT}} ({{first 7 chars}})
  Built:  {{KB_GENERATED_AT}}
```
Proceed to Phase 1.

#### Phase 0 Summary

| Check | Failure Mode | Resolution |
|-------|--------------|------------|
| state.json exists | KB never built | Run /knowledge-build |
| git_commit present | Malformed state | Run /knowledge-build |
| git_commit valid | Rebased/force-pushed | Run /knowledge-build |
| No code changes | KB stale | Run /knowledge-build |

**All checks pass** -> Continue to Phase 1

### Phase 1: Doc Discovery and Style Sampling

**Purpose**: Discover user-facing documentation files and infer consistent style conventions from the codebase.

#### Step 1.1: Discover Documentation Files

Run multiple Glob queries in parallel to find all markdown files:

```
Glob 1: Pattern = "README.md", Path = (project root)
Glob 2: Pattern = "docs/**/*.md", Path = (project root)
Glob 3: Pattern = "**/*.md", Path = (project root)
```

Merge results into a single list, removing duplicates by path.

#### Step 1.2: Apply Exclusion Filters

Remove files matching ANY of these patterns:

**Internal/Generated Files** (MUST exclude):
- `.rp1/**/*.md` - All generated KB and work files
- `node_modules/**` - Dependencies
- `.git/**` - Git internals
- `vendor/**` - Vendored dependencies
- `**/target/**` - Rust build artifacts
- `**/dist/**` - Build outputs

**Auto-generated Files** (exclude by convention):
- `CHANGELOG.md` - Auto-generated changelogs
- `LICENSE.md`, `LICENSE` - License files
- `CODE_OF_CONDUCT.md` - Template files
- `CONTRIBUTING.md` - Template files (unless customized)
- `SECURITY.md` - Template files

**Exclusion Logic**:
```
FOR each file in discovered_files:
    path = file.path
    IF path.startsWith(".rp1/"):
        EXCLUDE
    ELSE IF path.includes("node_modules/"):
        EXCLUDE
    ELSE IF path.includes("vendor/"):
        EXCLUDE
    ELSE IF path.includes("/target/"):
        EXCLUDE
    ELSE IF path.includes("/dist/"):
        EXCLUDE
    ELSE IF basename(path) in ["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md"]:
        EXCLUDE
    ELSE:
        INCLUDE in DOC_FILES
```

#### Step 1.3: Validate Discovery Results

**If DOC_FILES is empty**:
```
ERROR: No documentation files discovered.

Searched patterns:
- README.md
- docs/**/*.md
- **/*.md

Excluded patterns:
- .rp1/**/*.md (generated KB)
- node_modules/**, vendor/**, .git/**

Ensure your project has user-facing documentation files.
```
**EXIT IMMEDIATELY** - do not proceed.

**If DOC_FILES has files**, log discovery summary:
```
Discovered {{count}} documentation files
```

Store the list as `DOC_FILES` array (paths only, ~1KB total).

#### Step 1.4: Select Style Sample Files

Select up to 3 diverse files for style inference:

**Selection Algorithm**:
```
SAMPLE_FILES = []

# Priority 1: README.md (if exists)
readme = find_file_by_name(DOC_FILES, "README.md")
IF readme:
    SAMPLE_FILES.append(readme)

# Priority 2: First file from docs/ directory (if exists)
docs_files = filter(DOC_FILES, path.startsWith("docs/"))
IF docs_files.length > 0:
    # Prefer a top-level file (less nested)
    docs_file = sort_by_depth(docs_files)[0]
    IF docs_file NOT IN SAMPLE_FILES:
        SAMPLE_FILES.append(docs_file)

# Priority 3: One other .md file (different from above)
other_files = filter(DOC_FILES, file NOT IN SAMPLE_FILES)
IF other_files.length > 0:
    # Prefer a file with moderate size (100-500 lines)
    # to get representative style patterns
    other_file = other_files[0]
    SAMPLE_FILES.append(other_file)
```

Result: `SAMPLE_FILES` contains 1-3 files for style analysis.

#### Step 1.5: Read Sample Files for Style Analysis

Use Read tool to read each sample file:

```
FOR each file in SAMPLE_FILES:
    content = Read(file.path)
    Analyze style patterns in content
```

#### Step 1.6: Infer Style Conventions

Analyze the sample file contents to detect style patterns:

**Heading Style Detection**:
```
atx_count = count lines matching /^#{1,6}\s/    # ATX style: ## Heading
setext_h1 = count lines matching /^=+$/         # Setext H1: ====
setext_h2 = count lines matching /^-+$/         # Setext H2: ----
setext_count = setext_h1 + setext_h2

IF atx_count >= setext_count:
    heading_style = "atx"
ELSE:
    heading_style = "setext"
```

**List Marker Detection**:
```
dash_count = count lines matching /^\s*-\s/     # Dash: - item
asterisk_count = count lines matching /^\s*\*\s/ # Asterisk: * item
plus_count = count lines matching /^\s*\+\s/    # Plus: + item
ordered_count = count lines matching /^\s*\d+\.\s/ # Ordered: 1. item

unordered_counts = {dash: dash_count, asterisk: asterisk_count, plus: plus_count}
max_unordered = max_by_value(unordered_counts)

IF max_unordered.value > 0:
    list_marker = max_unordered.key  # "dash", "asterisk", or "plus"
ELSE:
    list_marker = "dash"  # Default
```

**Code Fence Detection**:
```
backtick_count = count lines matching /^```/    # Triple backtick
tilde_count = count lines matching /^~~~/       # Triple tilde
indented_count = count 4-space indented blocks  # Indented code

IF backtick_count >= tilde_count AND backtick_count >= indented_count:
    code_fence = "backtick"
ELSE IF tilde_count > backtick_count:
    code_fence = "tilde"
ELSE:
    code_fence = "backtick"  # Default
```

**Line Length Detection**:
```
line_lengths = [len(line) for line in all_lines if len(line) > 0]
IF line_lengths.length > 0:
    sorted_lengths = sort(line_lengths)
    p90_index = floor(line_lengths.length * 0.9)
    max_line_length = sorted_lengths[p90_index]
    # Round to nearest 10
    max_line_length = round(max_line_length / 10) * 10
    # Clamp between 80 and 120
    max_line_length = clamp(max_line_length, 80, 120)
ELSE:
    max_line_length = 100  # Default
```

**Link Style Detection**:
```
inline_count = count matches of /\[.*\]\(.*\)/   # Inline: [text](url)
reference_count = count matches of /\[.*\]\[.*\]/ # Reference: [text][ref]

IF inline_count >= reference_count:
    link_style = "inline"
ELSE:
    link_style = "reference"
```

#### Step 1.7: Build Style Configuration

Construct the `STYLE_CONFIG` JSON:

```json
{
  "heading_style": "atx",
  "list_marker": "dash",
  "code_fence": "backtick",
  "max_line_length": 100,
  "link_style": "inline"
}
```

Log the inferred style:
```
Style inferred from {{sample_count}} sample files:
  Headings: {{heading_style}}
  Lists: {{list_marker}}
  Code: {{code_fence}}
  Line length: {{max_line_length}}
```

#### Step 1.8: Prepare for Scan Phase

At the end of Phase 1, you should have:

| Variable | Content | Size |
|----------|---------|------|
| `DOC_FILES` | Array of file paths | ~1KB |
| `STYLE_CONFIG` | JSON style configuration | ~200B |
| `KB_GIT_COMMIT` | From Phase 0 | ~40B |

Proceed to Phase 2: Scan Phase Dispatch.

### Phase 2: Scan Phase Dispatch (Parallel)

**Purpose**: Dispatch scribe agents in parallel batches to classify documentation sections against KB.

**CRITICAL**: Spawn scribe agents in batches of 5 files each using SINGLE message with multiple Task calls.

#### Step 2.1: Batch File Assignment

Split `DOC_FILES` into batches of 5 files each:

```
BATCH_SIZE = 5
BATCHES = []
current_batch = []

FOR each file in DOC_FILES:
    current_batch.append(file)
    IF current_batch.length == BATCH_SIZE:
        BATCHES.append(current_batch)
        current_batch = []

# Handle remaining files
IF current_batch.length > 0:
    BATCHES.append(current_batch)
```

Store batch count: `TOTAL_BATCHES = BATCHES.length`

Log batch information:
```
Scanning {{DOC_FILES.length}} files in {{TOTAL_BATCHES}} batches (5 files/batch)
```

#### Step 2.2: Prepare JSON Input for Scan Agents

For each batch, construct the JSON input matching the scribe agent contract:

```json
{
  "mode": "scan",
  "files": ["path/to/file1.md", "path/to/file2.md", ...],
  "kb_index_path": "{{RP1_ROOT}}/context/index.md"
}
```

**Input validation**:
- `mode`: Must be string `"scan"`
- `files`: Must be JSON array of absolute file paths
- `kb_index_path`: Must be valid path to KB index

#### Step 2.3: Spawn Parallel Scan Agents

Spawn ONE scribe agent per batch in parallel using multiple Task calls in a SINGLE message:

```
FOR each batch in BATCHES (in parallel):
    Use Task tool:
        subagent_type: rp1-base:scribe
        prompt: |
            MODE: scan
            FILES: {{JSON.stringify(batch.files)}}
            KB_INDEX_PATH: {{RP1_ROOT}}/context/index.md

            Scan documentation files for classification against KB index.
            Return JSON with classifications.
```

**Task parallelism**: All Task calls in the same message execute in parallel. Do NOT wait between batches.

#### Step 2.4: Collect Scan Results

Each scribe agent returns JSON in this format:

```json
{
  "mode": "scan",
  "classifications": [
    {
      "file": "docs/getting-started.md",
      "sections": [
        {"heading": "Installation", "line": 10, "level": 2, "scenario": "fix", "kb_match": "index.md:15"},
        {"heading": "Usage", "line": 45, "level": 2, "scenario": "verify", "kb_match": null}
      ]
    }
  ],
  "summary": {"verify": 2, "add": 1, "fix": 3}
}
```

For each agent response:
1. Parse JSON output from Task result
2. Validate `mode` field equals `"scan"`
3. Extract `classifications` array
4. Extract `summary` object
5. Store in `SCAN_RESULTS` array

**Parse failure handling**:
- If JSON parse fails: mark batch as FAILED
- If `mode` != "scan": mark batch as FAILED
- If `classifications` missing: mark batch as FAILED

#### Step 2.5: Handle Scan Failures

Track success/failure per batch:

```
SUCCESSFUL_BATCHES = count batches where status == "success"
FAILED_BATCHES = count batches where status == "failed"
FAILURE_RATE = FAILED_BATCHES / TOTAL_BATCHES
```

**If FAILURE_RATE >= 0.5** (50% or more batches failed):
```
ERROR: Scan phase failed.

{{FAILED_BATCHES}} of {{TOTAL_BATCHES}} scan batches failed ({{FAILURE_RATE * 100}}%).
This exceeds the 50% failure threshold.

Failed batches:
{{FOR each failed_batch}}
- Batch {{batch.index}}: {{batch.error}}
{{/FOR}}

Please investigate and retry.
```
**EXIT IMMEDIATELY** - do not proceed.

**If FAILURE_RATE < 0.5** (majority succeeded):
- Log warning about failed batches
- Continue with successful results only
- Exclude files from failed batches from further processing

### Phase 3: Scan Aggregation and User Approval

**Purpose**: Aggregate scan results, write to external state file, and obtain user approval.

#### Step 3.1: Aggregate Classifications

Merge all successful scan results into unified structure:

```
AGGREGATED = {
    "files": {},
    "summary": {"total_files": 0, "verify": 0, "add": 0, "fix": 0}
}

FOR each scan_result in SCAN_RESULTS (successful only):
    FOR each file_classification in scan_result.classifications:
        file_path = file_classification.file

        # Store file sections
        AGGREGATED.files[file_path] = {
            "sections": file_classification.sections
        }

        # Increment file count
        AGGREGATED.summary.total_files += 1

        # Aggregate section counts by scenario
        FOR each section in file_classification.sections:
            scenario = section.scenario  # "verify", "add", or "fix"
            AGGREGATED.summary[scenario] += 1

# Add metadata
AGGREGATED.generated_at = new Date().toISOString()
AGGREGATED.style = STYLE_CONFIG  # From Phase 1
```

**Final aggregated structure**:
```json
{
  "generated_at": "2025-12-28T10:30:00.000Z",
  "style": {
    "heading_style": "atx",
    "list_marker": "dash",
    "code_fence": "backtick",
    "max_line_length": 100,
    "link_style": "inline"
  },
  "files": {
    "docs/getting-started.md": {
      "sections": [
        {"heading": "Installation", "line": 10, "level": 2, "scenario": "fix", "kb_match": "index.md:15"},
        {"heading": "Usage", "line": 45, "level": 2, "scenario": "verify", "kb_match": null}
      ]
    },
    "README.md": {
      "sections": [
        {"heading": "Quick Start", "line": 5, "level": 2, "scenario": "add", "kb_match": "modules.md:20"}
      ]
    }
  },
  "summary": {
    "total_files": 2,
    "verify": 1,
    "add": 1,
    "fix": 1
  }
}
```

#### Step 3.2: Ensure Work Directory Exists

Before writing scan results, ensure the work directory exists:

```bash
mkdir -p {{RP1_ROOT}}/work/features/scribe
```

Use Bash tool to create directory if it doesn't exist.

#### Step 3.3: Write scan_results.json

Write the aggregated results to external state file:

```
Use Write tool:
    Path: {{RP1_ROOT}}/work/features/scribe/scan_results.json
    Content: {{JSON.stringify(AGGREGATED, null, 2)}}
```

This external state file:
- Bridges scan and process phases
- Keeps orchestrator context minimal (~3KB)
- Enables resumable workflows
- Provides audit trail of classifications

Log write confirmation:
```
Scan results written to {{RP1_ROOT}}/work/features/scribe/scan_results.json
```

#### Step 3.4: Present Summary to User

Compute total sections count and display the scan summary in the canonical format:

```
TOTAL_SECTIONS = AGGREGATED.summary.verify + AGGREGATED.summary.add + AGGREGATED.summary.fix
```

Display summary to user:

```
Documentation Scan Complete

{{AGGREGATED.summary.total_files}} files, {{TOTAL_SECTIONS}} sections: {{AGGREGATED.summary.verify}} verify, {{AGGREGATED.summary.add}} add, {{AGGREGATED.summary.fix}} fix

Breakdown:
- Verify: {{AGGREGATED.summary.verify}} sections (doc content not in KB - accuracy check)
- Add: {{AGGREGATED.summary.add}} sections (KB content missing from docs - will create)
- Fix: {{AGGREGATED.summary.fix}} sections (matching headings to reconcile - will update)
```

#### Step 3.5: Wait for User Approval

Use the AskUserQuestion tool to obtain explicit approval:

```
Use AskUserQuestion tool:
    question: "Proceed with documentation updates?"
    options:
      - label: "Yes"
        description: "Apply updates to {{AGGREGATED.summary.total_files}} files"
      - label: "No"
        description: "Abort without changes"
```

**If user selects "No"**:
```
Documentation update cancelled.

Scan results preserved at: {{RP1_ROOT}}/work/features/scribe/scan_results.json
You can review classifications and re-run when ready.
```
**EXIT IMMEDIATELY** - do not proceed.

**If user selects "Yes"**:
Proceed to Phase 4: Process Phase Dispatch.

### Phase 4: Process Phase Dispatch (Parallel)

**Purpose**: Dispatch scribe agents in parallel batches to apply documentation edits based on scan classifications.

**CRITICAL**: Spawn scribe agents in batches of 5 files each using SINGLE message with multiple Task calls.

#### Step 4.1: Batch File Assignment

Reuse the same batching logic from Phase 2 with the files from `AGGREGATED.files`:

```
BATCH_SIZE = 5
PROCESS_BATCHES = []
current_batch = []

# Get file list from aggregated scan results
PROCESS_FILES = Object.keys(AGGREGATED.files)

FOR each file in PROCESS_FILES:
    current_batch.append(file)
    IF current_batch.length == BATCH_SIZE:
        PROCESS_BATCHES.append(current_batch)
        current_batch = []

# Handle remaining files
IF current_batch.length > 0:
    PROCESS_BATCHES.append(current_batch)
```

Store batch count: `TOTAL_PROCESS_BATCHES = PROCESS_BATCHES.length`

Log batch information:
```
Processing {{PROCESS_FILES.length}} files in {{TOTAL_PROCESS_BATCHES}} batches (5 files/batch)
```

#### Step 4.2: Prepare JSON Input for Process Agents

For each batch, construct the JSON input matching the scribe agent process mode contract:

```json
{
  "mode": "process",
  "files": ["path/to/file1.md", "path/to/file2.md", ...],
  "scan_results_path": "{{RP1_ROOT}}/work/features/scribe/scan_results.json",
  "style": {
    "heading_style": "atx",
    "list_marker": "dash",
    "code_fence": "backtick",
    "max_line_length": 100,
    "link_style": "inline"
  }
}
```

**Input validation**:
- `mode`: Must be string `"process"`
- `files`: Must be JSON array of absolute file paths
- `scan_results_path`: Must be valid path to scan_results.json written in Phase 3
- `style`: Must be the STYLE_CONFIG JSON from Phase 1

#### Step 4.3: Spawn Parallel Process Agents

Spawn ONE scribe agent per batch in parallel using multiple Task calls in a SINGLE message:

```
FOR each batch in PROCESS_BATCHES (in parallel):
    Use Task tool:
        subagent_type: rp1-base:scribe
        prompt: |
            MODE: process
            FILES: {{JSON.stringify(batch.files)}}
            SCAN_RESULTS_PATH: {{RP1_ROOT}}/work/features/scribe/scan_results.json
            STYLE: {{JSON.stringify(STYLE_CONFIG)}}

            Process documentation files and apply edits.
            Read classifications from scan_results.json for your assigned files.
            Apply edits directly using Edit tool.
            Return JSON with results summary.
```

**Task parallelism**: All Task calls in the same message execute in parallel. Do NOT wait between batches.

#### Step 4.4: Collect Process Results

Each scribe agent returns JSON in this format:

```json
{
  "mode": "process",
  "results": [
    {
      "file": "docs/getting-started.md",
      "status": "success",
      "sections_verified": 2,
      "sections_added": 1,
      "sections_fixed": 3,
      "edits_applied": 6
    },
    {
      "file": "docs/installation.md",
      "status": "failed",
      "error": "File not found or permission denied",
      "sections_verified": 0,
      "sections_added": 0,
      "sections_fixed": 0,
      "edits_applied": 0
    }
  ]
}
```

For each agent response:
1. Parse JSON output from Task result
2. Validate `mode` field equals `"process"`
3. Extract `results` array with per-file summaries
4. Store in `PROCESS_RESULTS` array

**Parse failure handling**:
- If JSON parse fails: mark batch as FAILED, log error
- If `mode` != "process": mark batch as FAILED
- If `results` missing: mark batch as FAILED

#### Step 4.5: Handle Process Failures Gracefully

Unlike scan phase (which blocks on 50%+ failures), process phase continues through failures:

```
SUCCESSFUL_FILES = []
FAILED_FILES = []

FOR each process_result in PROCESS_RESULTS:
    FOR each file_result in process_result.results:
        IF file_result.status == "success":
            SUCCESSFUL_FILES.append(file_result)
        ELSE:
            FAILED_FILES.append({
                "file": file_result.file,
                "error": file_result.error || "Unknown error"
            })
```

**Failure Handling Rules**:
- Continue processing regardless of individual file failures
- Track all failures for final report
- Do NOT retry failed files automatically (user can re-run)
- Log warning for each failure but continue execution

**Partial Success Log**:
```
IF FAILED_FILES.length > 0:
    Log: "Warning: {{FAILED_FILES.length}} files failed to process"
    FOR each failure in FAILED_FILES:
        Log: "  - {{failure.file}}: {{failure.error}}"
```

#### Step 4.6: Build Process Summary

Aggregate statistics from all successful file results:

```
PROCESS_SUMMARY = {
    "files_processed": SUCCESSFUL_FILES.length + FAILED_FILES.length,
    "files_succeeded": SUCCESSFUL_FILES.length,
    "files_failed": FAILED_FILES.length,
    "total_sections_verified": sum(SUCCESSFUL_FILES, f => f.sections_verified),
    "total_sections_added": sum(SUCCESSFUL_FILES, f => f.sections_added),
    "total_sections_fixed": sum(SUCCESSFUL_FILES, f => f.sections_fixed),
    "total_edits_applied": sum(SUCCESSFUL_FILES, f => f.edits_applied),
    "failed_files": FAILED_FILES
}
```

Pass `PROCESS_SUMMARY` to Phase 5 for final reporting.

### Phase 5: Result Aggregation and Final Report

1. **Aggregate results**:
   Collect from all process phase agents:
   ```json
   {
     "files_processed": N,
     "files_succeeded": N,
     "files_failed": N,
     "total_sections_verified": N,
     "total_sections_added": N,
     "total_sections_fixed": N,
     "total_edits_applied": N
   }
   ```

2. **Generate final report**:
   ```
   Documentation Sync Complete

   Files processed: {{files_processed}}
   - Succeeded: {{files_succeeded}}
   - Failed: {{files_failed}}

   Changes applied:
   - Sections verified: {{total_sections_verified}}
   - Sections added: {{total_sections_added}}
   - Sections fixed: {{total_sections_fixed}}
   - Total edits: {{total_edits_applied}}

   {{IF files_failed > 0}}
   Failed files:
   {{FOR each failed_file}}
   - {{failed_file.path}}: {{failed_file.error}}
   {{/FOR}}
   {{/IF}}

   Git-ready summary:
   docs: sync {{files_succeeded}} files with KB ({{total_edits_applied}} edits)
   ```

3. **Cleanup** (optional):
   ```bash
   # Remove temporary scan results if desired
   rm {{RP1_ROOT}}/work/features/scribe/scan_results.json
   ```

## Error Handling

| Error | Phase | Action |
|-------|-------|--------|
| state.json not found | 0 | Abort: "KB not found. Run /rp1-base:knowledge-build" |
| git_commit missing/empty | 0 | Abort: "Invalid KB state. Run /rp1-base:knowledge-build" |
| git_commit not in history | 0 | Abort: "KB references unknown commit. Run /rp1-base:knowledge-build" |
| Code changed since KB build | 0 | Abort: "KB out of sync. Run /rp1-base:knowledge-build" |
| No doc files found | 1 | Abort: "No documentation files discovered" |
| >50% scan agents fail | 2 | Abort with error listing failures |
| User rejects approval | 3 | Exit: "Documentation update cancelled" |
| Process agent fails | 4 | Log failure, continue with other files |

**KB Validation Failures (Phase 0)**: All KB-related failures are fatal and require running `/rp1-base:knowledge-build` before retrying. This ensures documentation is always verified against accurate, current system knowledge.

## Output Discipline

**CRITICAL - Keep Output Concise**:
- Do ALL internal work in <thinking> tags
- Do NOT output verbose phase-by-phase progress
- Only output:
  1. KB sync status (verified or error)
  2. Scan summary with approval prompt
  3. Final report with git-ready summary

**Example of CORRECT output**:
```
KB sync verified (commit: abc123)
Scanning 15 documentation files...

Documentation Scan Complete

15 files, 65 sections: 45 verify, 12 add, 8 fix

Breakdown:
- Verify: 45 sections (doc content not in KB - accuracy check)
- Add: 12 sections (KB content missing from docs - will create)
- Fix: 8 sections (matching headings to reconcile - will update)

Proceed with documentation updates? [Yes/No]

Processing 15 files in 3 batches (5 files/batch)

Documentation Sync Complete
Files processed: 15 (15 succeeded, 0 failed)
Changes: 45 verified, 12 added, 8 fixed (65 total edits)

Git-ready: docs: sync 15 files with KB (65 edits)
```

## Anti-Loop Directives

**EXECUTE IMMEDIATELY**:
- Do NOT ask for approval before scan phase
- Do NOT iterate or refine classifications
- Execute scan phase ONCE
- Execute process phase ONCE after approval
- Output complete report
- STOP after outputting report
