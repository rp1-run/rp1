---
name: knowledge-build
version: 2.1.0
description: Orchestrates parallel KB generation using spatial analysis and a map-reduce architecture
tags:
  - documentation
  - analysis
  - planning
  - core
  - parallel
created: 2025-10-25
updated: 2025-11-18
author: cloud-on-prem/rp1
---

# Knowledge Builder - Parallel KB Generation Orchestrator

This command orchestrates parallel knowledge base generation using a map-reduce architecture

**CRITICAL**: This is an ORCHESTRATOR command, not a thin wrapper. This command must handle parallel execution coordination, result aggregation, and state management.

## Architecture Overview

```
Phase 1 (Sequential):  Spatial Analyzer → Categorized file lists
Phase 2 (Parallel):    4 Analysis Agents → JSON outputs (concept, arch, module, pattern)
Phase 3 (Sequential):  Command → Merge JSON → Generate index.md → Write KB files
```

**Key Design**: The main orchestrator generates index.md directly (not via sub-agent) because:
1. It has visibility into all 4 sub-agent outputs
2. It can aggregate key facts into a "jump off" entry point
3. index.md must contain file manifest with accurate line counts from generated files

## Execution Instructions

**DO NOT ask for user approval. Execute immediately.**

### Phase 0: Change Detection and Diff Analysis

1. **Check for existing KB state**:
   - Check if `{{RP1_ROOT}}/context/state.json` exists
   - If exists, read the `git_commit` field from state.json

2. **Check current git commit**:
   - Run: `git rev-parse HEAD` to get current commit hash
   - Compare with git_commit from state.json (if exists)

3. **Determine build strategy**:

   **CASE A: No changes detected** (state.json exists AND git commit unchanged):
   - **ACTION**: Skip build entirely (no-op)
   - **MESSAGE**: "✓ KB is up-to-date (commit {{commit_hash}}). No regeneration needed. KB is automatically loaded by agents when needed."

   **CASE A-MONOREPO: No changes in this service** (monorepo: git commit changed but no changes in CODEBASE_ROOT):
   - **ACTION**: Skip build BUT update state.json with new commit
   - **REASON**: In monorepo, global commit moves even when this service unchanged. Update commit reference to avoid checking larger diff ranges in future.
   - **Update state.json**:
     - Read existing state.json
     - Update only the `git_commit` field to new commit hash
     - Keep all other fields unchanged (strategy, repo_type, files_analyzed, etc.)
     - Write updated state.json
   - **MESSAGE**: "✓ No changes in this service since last build. Updated commit reference ({{old_commit}} → {{new_commit}}). KB is automatically loaded by agents when needed."

   **CASE B: First-time build** (no state.json):
   - **ACTION**: Full analysis mode - proceed to Phase 1
   - **MESSAGE**: "First-time KB generation with parallel analysis (10-15 min)"
   - **MODE**: Full scan (spatial analyzer processes all files)

   **CASE C: Incremental update** (state.json exists AND commit changed AND files changed in CODEBASE_ROOT):
   - **ACTION**: Incremental analysis mode - get changed files with diffs
   - **Read monorepo metadata from state.json AND local values from meta.json**:
     ```bash
     # Read shareable state
     repo_type=$(jq -r '.repo_type // "single-project"' {{RP1_ROOT}}/context/state.json)

     # Read local values from meta.json (with fallback to state.json for backward compatibility)
     if [ -f "{{RP1_ROOT}}/context/meta.json" ]; then
       repo_root=$(jq -r '.repo_root // "."' {{RP1_ROOT}}/context/meta.json)
       current_project_path=$(jq -r '.current_project_path // "."' {{RP1_ROOT}}/context/meta.json)
     else
       # Backward compatibility: read from state.json if meta.json doesn't exist
       repo_root=$(jq -r '.repo_root // "."' {{RP1_ROOT}}/context/state.json)
       current_project_path=$(jq -r '.current_project_path // "."' {{RP1_ROOT}}/context/state.json)
     fi
     ```
   - **Get changed files list**:
     ```bash
     # If monorepo, run git diff from repo root and filter to current project
     if [ "$repo_type" = "monorepo" ]; then
       cd "$repo_root"
       # Get all changed files
       all_changes=$(git diff --name-only {{old_commit}} {{new_commit}})

       # Filter to current project (skip filtering if root project)
       if [ "$current_project_path" = "." ] || [ "$current_project_path" = "" ]; then
         # Root project - include all files
         echo "$all_changes"
       else
         # Subdirectory project - filter to project path
         echo "$all_changes" | grep "^${current_project_path}"
       fi
     else
       # Single-project - get all changes
       git diff --name-only {{old_commit}} {{new_commit}}
     fi
     ```
   - **Check if any files changed in scope**:
     - If NO changes found → **Go to CASE A-MONOREPO** (update commit only)
     - If changes found → Continue with incremental analysis
   - **Check change set size** (prevent token limit issues):
     ```bash
     changed_file_count=$(echo "$changed_files" | wc -l)
     if [ $changed_file_count -gt 50 ]; then
       echo "⚠️ Large change set ($changed_file_count files changed). Using FULL mode for reliability."
       # Fall back to FULL mode (skip getting diffs)
       MODE="FULL"
     else
       MODE="INCREMENTAL"
     fi
     ```
   - **MESSAGE**:
     - If MODE=FULL: "Large change set ({{changed_file_count}} files). Full analysis (10-15 min)"
     - If MODE=INCREMENTAL: "Changes detected since last build ({{old_commit}} → {{new_commit}}). Analyzing {{changed_file_count}} changed files (2-5 min)"
   - **Get detailed diffs for each changed file** (only if MODE=INCREMENTAL):
     ```bash
     # Only if incremental mode (< 50 files)
     git diff {{old_commit}} {{new_commit}} -- <filepath>
     ```
   - **Store diffs**: Create FILE_DIFFS JSON mapping filepath → diff content (only if MODE=INCREMENTAL)
   - **Filter changed files**: Apply EXCLUDE_PATTERNS, filter to relevant extensions
   - **Store changed files list**: Will be passed to spatial analyzer
   - **MODE**: INCREMENTAL (< 50 files) or FULL (>= 50 files)

### Phase 1: Spatial Analysis (Sequential)

1. **Spawn spatial analyzer agent**:

   **For full build (CASE B)**:
   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-spatial-analyzer
   prompt: "FULL SCAN mode. Scan all files in repository at {{CODEBASE_ROOT}}, rank files 0-5, categorize by KB section. Return JSON with index_files, concept_files, arch_files, module_files arrays."
   ```

   **For incremental build (CASE C)**:
   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-spatial-analyzer
   prompt: "INCREMENTAL mode. Only categorize these changed files: {{changed_files_list}}. Rank each file 0-5, categorize by KB section (index_files, concept_files, arch_files, module_files). Return JSON with categorized changed files."
   ```

2. **Parse spatial analyzer output**:
   - Extract JSON from agent response
   - Validate structure: must have `repo_type`, `monorepo_projects`, `total_files_scanned`, `index_files`, `concept_files`, `arch_files`, `module_files`, `local_meta`
   - Store shareable metadata: `repo_type`, `monorepo_projects`
   - Store local metadata from `local_meta`: `repo_root`, `current_project_path` (will be written to meta.json)
   - For incremental: files_scanned should match changed_file_count
   - Check that at least one category has files (some categories may be empty in incremental)

3. **Handle spatial analyzer failure**:
   - If agent crashes or returns invalid JSON: Log error with details
   - If categorization is completely empty: Log error
   - Provide troubleshooting guidance

### Phase 2: Map Phase (Parallel Execution)

1. **Spawn 4 analysis agents in parallel** (CRITICAL: Use a SINGLE message with 4 Task tool calls):

   **Agent 1 - Concept Extractor**:

   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-concept-extractor
   prompt: "MODE={{mode}}. Extract domain concepts for concept_map.md. Repository type: {{repo_type}}. Files to analyze (JSON): {{stringify(concept_files)}}. {{if mode==INCREMENTAL}}File diffs (JSON): {{stringify(file_diffs_for_concept_files)}}{{endif}}. Return JSON with concepts, terminology, relationships."
   ```

   **Agent 2 - Architecture Mapper**:

   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-architecture-mapper
   prompt: "MODE={{mode}}. Map system architecture for architecture.md. Repository type: {{repo_type}}. Files to analyze (JSON): {{stringify(arch_files)}}. {{if mode==INCREMENTAL}}File diffs (JSON): {{stringify(file_diffs_for_arch_files)}}{{endif}}. Return JSON with patterns, layers, diagram."
   ```

   **Agent 3 - Module Analyzer**:

   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-module-analyzer
   prompt: "MODE={{mode}}. Analyze modules for modules.md. Repository type: {{repo_type}}. Files to analyze (JSON): {{stringify(module_files)}}. {{if mode==INCREMENTAL}}File diffs (JSON): {{stringify(file_diffs_for_module_files)}}{{endif}}. Return JSON with modules, components, dependencies."
   ```

   **Agent 4 - Pattern Extractor**:

   ```
   Use Task tool with:
   subagent_type: rp1-base:kb-pattern-extractor
   prompt: "MODE={{mode}}. Extract implementation patterns for patterns.md. Repository type: {{repo_type}}. Files to analyze (JSON): {{stringify(concept_files + module_files)}}. {{if mode==INCREMENTAL}}File diffs (JSON): {{stringify(file_diffs_for_pattern_files)}}{{endif}}. Return JSON with patterns (≤150 lines when rendered)."
   ```

2. **Collect agent outputs**:
   - Wait for all 4 agents to complete
   - Parse JSON from each agent response
   - Validate JSON structure for each output

3. **Handle partial failures**:

   **If 1 agent fails**:
   - Continue with remaining 3 successful agents
   - Generate placeholder content for failed section:
     * concept_map.md failed → "# Error extracting concepts - run full rebuild"
     * architecture.md failed → "# Error mapping architecture - see logs"
     * modules.md failed → "# Error analyzing modules - run full rebuild"
     * patterns.md failed → "# Error extracting patterns - run full rebuild"
   - Include warning in final report: "⚠️ Partial KB generated (1 agent failed: <agent-name>)"
   - Write partial KB files (index.md always generated by orchestrator + 3 successful agent files + 1 placeholder)
   - Exit with partial success (still usable KB)

   **If 2+ agents fail**:
   - Log all errors with specific agent names and error messages
   - Do NOT write partial KB (too incomplete to be useful)
   - Provide troubleshooting guidance:
     * Check file permissions
     * Verify git repository is valid
     * Try running again (may be transient failure)
   - Exit with error message: "ERROR: KB generation failed (X agents failed)"
   - Exit code: 1

### Phase 3: Reduce Phase (Merge and Write)

1. **Load KB templates**:

   ```
   Use Skill tool with:
   skill: rp1-base:knowledge-base-templates
   ```

   - Load templates for: index.md, concept_map.md, architecture.md, modules.md, patterns.md

2. **Merge agent data into templates** (concept_map, architecture, modules, patterns):

   **concept_map.md**:
   - Use concept-extractor JSON data
   - Fill template sections: core concepts, terminology, relationships, patterns
   - Add concept boundaries

   **architecture.md**:
   - Use architecture-mapper JSON data
   - Fill template sections: patterns, layers, interactions, integrations
   - Insert Mermaid diagram from JSON

   **modules.md**:
   - Use module-analyzer JSON data
   - Fill template sections: modules, components, dependencies, metrics
   - Add responsibility matrix

   **patterns.md**:
   - Use pattern-extractor JSON data
   - Fill template sections: 6 core patterns, conditional patterns (if detected)
   - Verify output is ≤150 lines
   - Omit conditional sections if not detected

3. **Validate Mermaid diagrams**:

   ```
   Use Skill tool with:
   skill: rp1-base:mermaid
   ```

   - Validate diagram from architecture.md
   - If invalid: Log warning, use fallback simple diagram or omit

4. **Generate index.md directly** (orchestrator-owned, not agent):

   The orchestrator generates index.md as the "jump off" entry point by aggregating data from all 4 sub-agents.

   **Follow the index.md generation instructions in the knowledge-base-templates skill**:
   - See "Index.md Generation (Orchestrator-Owned)" section in SKILL.md
   - Aggregation process: extract data from each sub-agent's JSON output
   - Calculate file manifest: get line counts after writing other KB files
   - Template placeholder mapping: fill template with aggregated data

5. **Write KB files**:

   ```
   Use Write tool to write:
   - {{RP1_ROOT}}/context/index.md
   - {{RP1_ROOT}}/context/concept_map.md
   - {{RP1_ROOT}}/context/architecture.md
   - {{RP1_ROOT}}/context/modules.md
   - {{RP1_ROOT}}/context/patterns.md
   ```

### Phase 4: State Management

1. **Aggregate metadata**:
   - Combine metadata from spatial analyzer + 4 analysis agents
   - Calculate total files analyzed
   - Extract languages and frameworks
   - Calculate metrics (module count, component count, concept count)

2. **Generate state.json** (shareable metadata - safe to commit/share):

   ```json
   {
     "strategy": "parallel-map-reduce",
     "repo_type": "{{repo_type}}",
     "monorepo_projects": ["{{project1}}", "{{project2}}"],
     "generated_at": "{{ISO timestamp}}",
     "git_commit": "{{git rev-parse HEAD}}",
     "files_analyzed": {{total_files}},
     "languages": ["{{lang1}}", "{{lang2}}"],
     "metrics": {
       "modules": {{module_count}},
       "components": {{component_count}},
       "concepts": {{concept_count}}
     }
   }
   ```

3. **Generate meta.json** (local values - should NOT be committed/shared):

   ```json
   {
     "repo_root": "{{repo_root}}",
     "current_project_path": "{{current_project_path}}"
   }
   ```

   **NOTE**: `meta.json` contains local paths that may differ per team member. This file should be added to `.gitignore`.

4. **Write state files**:

   ```
   Use Write tool to write:
   - {{RP1_ROOT}}/context/state.json
   - {{RP1_ROOT}}/context/meta.json
   ```

### Phase 5: Error Handling

**Error Conditions**:

- Spatial analyzer fails or returns invalid JSON
- 2 or more analysis agents fail
- Template loading fails
- Write operations fail repeatedly
- Git commands fail (unable to detect commit hash)

**Error Handling Procedure**:

1. Log clear error message indicating which phase/component failed
2. Provide specific details about what went wrong
3. List attempted operations and their results
4. Provide actionable guidance for resolution:
   - Check git repository status if git commands failed
   - Verify file permissions if write operations failed
   - Check agent logs if spatial analyzer or analysis agents failed
5. Report error to user with troubleshooting steps

**Final Report**:

```
✅ Knowledge Base Generated Successfully

Strategy: Parallel map-reduce
Repository: {{repo_type}}
Files Analyzed: {{total_files}}

KB Files Written:
- {{RP1_ROOT}}/context/index.md
- {{RP1_ROOT}}/context/concept_map.md
- {{RP1_ROOT}}/context/architecture.md
- {{RP1_ROOT}}/context/modules.md
- {{RP1_ROOT}}/context/patterns.md
- {{RP1_ROOT}}/context/state.json (shareable metadata)
- {{RP1_ROOT}}/context/meta.json (local paths - add to .gitignore)

Next steps:
- KB is automatically loaded by agents when needed (no manual /knowledge-load required)
- Subsequent runs will use same parallel approach (10-15 min)
- Incremental updates (changed files only) are faster (2-5 min)
- Add meta.json to .gitignore to prevent sharing local paths
```

## Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| RP1_ROOT | `.rp1/` | Root directory for KB artifacts |
| CODEBASE_ROOT | `.` | Repository root to analyze |
| EXCLUDE_PATTERNS | `node_modules/,.git/,build/,dist/` | Patterns to exclude from scanning |

## Critical Execution Notes

1. **Change detection first**: Always check Phase 0 - compare git commit hash to skip if unchanged
2. **Do NOT iterate**: Execute workflow ONCE, no refinement
3. **Parallel spawning**: Spawn 4 agents in SINGLE message with multiple Task calls
4. **Index.md ownership**: Orchestrator generates index.md directly (not via sub-agent)
5. **Error handling**: Provide clear error messages with troubleshooting steps if failures occur
6. **No user interaction**: Complete entire workflow autonomously
7. **Set expectations**: Inform user builds take 10-15 minutes (or instant if no changes)

## Output Discipline

**CRITICAL - Keep Output Concise**:
- Do ALL internal work in <thinking> tags (NOT visible to user)
- Do NOT output verbose phase-by-phase progress ("Now doing Phase 1...", "Spawning agents...", etc.)
- Do NOT explain internal logic or decision-making process
- Only output 3 things:
  1. **Initial status**: Build mode message (CASE A/B/C)
  2. **High-level progress** (optional): "Analyzing... (Phase X/5)" every 2-3 minutes
  3. **Final report**: Success message with KB files written (see Final Report above)

**Example of CORRECT output**:
```
First-time KB generation with parallel analysis (10-15 min)
Analyzing... (Phase 2/5)
✅ Knowledge Base Generated Successfully
[Final Report as shown above]
```

**Example of INCORRECT output** (DO NOT DO THIS):
```
Checking for state.json...
state.json not found, proceeding with first-time build
Running git rev-parse HEAD to get commit...
Commit is 475b03e...
Spawning kb-spatial-analyzer agent...
Parsing spatial analyzer output...
Found 90 files in index_files category...
Now spawning 4 parallel agents...
Spawning kb-concept-extractor...
Spawning kb-architecture-mapper...
Spawning kb-module-analyzer...
etc. (too verbose!)
```

## Expected Performance

**No changes detected**:
- Instant (no-op)
- **Single-project**: Commit unchanged → Skip entirely
- **Monorepo**: Commit changed but no changes in this service → Update state.json commit only

**First-time build** (no state.json - full analysis):
- 10-15 minutes
- Spatial analyzer scans all files
- 5 parallel agents analyze all relevant files
- Generates complete KB

**Incremental update** (commit changed - changed files only):
- 2-5 minutes (much faster!)
- Git diff identifies changed files
- Spatial analyzer categorizes only changed files
- 5 parallel agents load existing KB + analyze only changed files
- Updates KB with changes only
- Preserves all existing good content
