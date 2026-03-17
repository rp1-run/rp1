# Prompt Eval Extractor

Thin orchestrator that extracts testable assertions from prompt text using the prompt-eval-builder skill.

## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| PROMPT_TEXT | $1 | (req) | Prompt content to analyze |
| SOURCE_NAME | $2 | "inline" | Source identifier for notes |
| OUTPUT_FILE | $3 | (auto) | Output path for YAML |
| DEPENDENCY_CHAIN | $4 | "" | JSON dependency chain from analyzer |
| OUTPUT_PROMPT | $5 | (auto) | Output path for test prompt .txt |

<prompt_text>
$1
</prompt_text>

<source_name>
$2
</source_name>

<output_file>
$3
</output_file>

<dependency_chain>
$4
</dependency_chain>

<output_prompt>
$5
</output_prompt>

## 1. Load Skill Knowledge

Read skill files from `plugins/utils/skills/prompt-eval-builder/`:

- **PATTERNS.md**: Extraction categories, tool mappings, smart selection rules, **LLM rubric extraction (Sec 7), complexity detection (Sec 8), Metadata patterns (Sec 9)**
- **TEMPLATES.md**: promptfoo YAML output format, **LLM rubric templates (Sec 2)**

## 1.5 Process Dependency Chain

Build PROMPT_SOURCES array based on dependency chain availability.

**If DEPENDENCY_CHAIN ($4) is non-empty JSON**:

1. Parse JSON structure: `{root: {path}, agents: [{path}], skills: [{path}], warnings: []}`
2. Build file list in order: `[root.path] + agents[].path + skills[].path`
3. For each file path:
   - Read file content using Read tool
   - Store source with attribution: `{path, content}`
4. Set `PROMPT_SOURCES` = array of `{path, content}` objects
5. Log any warnings from dependency analysis

**If DEPENDENCY_CHAIN ($4) is empty**:

- Set `PROMPT_SOURCES` = `[{path: SOURCE_NAME, content: PROMPT_TEXT}]`
- Process single input file as before (backward compatibility)

## 2. Extract Requirements and Generate Rubrics

**Default output**: LLM rubric assertions. Programmatic assertions only for HIGH complexity.

For each source in PROMPT_SOURCES:

### 2.1 Scan & Categorize

1. **Scan**: Match patterns from PATTERNS.md Section 7 (LLM Rubric Extraction)
2. **Categorize**: Assign each requirement to rubric section:
   - MUST/shall/creates/outputs -> REQUIRED (numbered)
   - MUST NOT/never/avoid -> PROHIBITED (bulleted)
   - when/if/unless -> EDGE CASES (bulleted)
3. **Filter**: Apply PATTERNS.md Section 3 (Smart Selection Rules) - pivotal only

### 2.2 Detect Complexity

Per PATTERNS.md Section 8 (Complexity Detection):

| Detected Pattern | Action |
|------------------|--------|
| "exactly N times", "N calls" | Generate programmatic assertion |
| "before X and after Y" (strict) | Generate programmatic assertion |
| All other requirements | Include in LLM rubric |

### 2.3 Generate Assertions

**For LOW/MEDIUM complexity** (default path):
1. Group ALL requirements into single `type: llm-rubric` per test scenario
2. Start with: "Evaluate the agent execution. Check the output text AND the Metadata JSON section."
3. Format REQUIRED section with numbered items (1., 2., 3...)
4. Format PROHIBITED section with bulleted items (-)
5. Add EDGE CASES section only if conditional requirements exist
6. Reference Metadata using patterns from PATTERNS.md Section 9

**For HIGH complexity** (rare):
1. Generate `type: javascript` with `file://../../shared/assertions/tool-calls.ts:{functionName}`
2. Add comment explaining requirement

### 2.4 Output Organization

**Single rubric per test scenario** - do NOT create one assertion per requirement.

```yaml
tests:
  - description: "default_behavior"
    assert:
      - type: llm-rubric
        value: |
          Evaluate the agent execution. Check the output text AND the Metadata JSON section.

          REQUIRED (all must pass):
          1. {requirement_from_source_1}
          2. {requirement_from_source_2}
          ...

          PROHIBITED (fail if any present in Metadata bashCommands):
          - {prohibition_1}
          - {prohibition_2}
```

**Multiple sources**: Consolidate requirements from all sources into unified rubric sections.

## 2.5 Generate Test Prompt

From the root source (first in PROMPT_SOURCES), extract command metadata and generate test invocation prompt.

**Extract from YAML frontmatter and content**:
- `name:` → command name
- Plugin from file path (`plugins/{plugin}/`) or SOURCE_NAME
- `argument-hint:` → args/flags pattern
- PARAMS table → positional args and flags

**Build invocation**:
```
/{plugin-prefix}:{command-name} {positional-args} {flags}
```

**Variable placeholders**:
| Param Type | Format |
|------------|--------|
| Freeform request ($ARGUMENTS) | `"{{REQUEST}}"` |
| Positional ($1 named X) | `{{X_UPPER_SNAKE}}` |
| Boolean flag (--flag) | `` |
| Optional positional | `` |

**Write to OUTPUT_PROMPT** ($5): Single line, plain text, no markdown.

## 3. Validate & Write

Per VALIDATION.md, use 3-attempt validation loop:

1. Write YAML to OUTPUT_FILE (no code fences, pure YAML)
2. Validate using inline bun command from repo's cli directory:
   ```bash
   cd {repo_root}/cli && bun -e "import {parse} from 'yaml'; import {readFileSync} from 'fs'; try { parse(readFileSync('{OUTPUT_FILE}','utf8')); console.log(JSON.stringify({valid:true})) } catch(e) { console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1) }"
   ```
3. If invalid and attempts < 3: re-extract with error context
4. If invalid and attempts >= 3: report failure with last error

## 4. Output

Write valid YAML to OUTPUT_FILE and test prompt to OUTPUT_PROMPT. Report both on completion:

```
Eval files generated:
  Assertions: {OUTPUT_FILE}
  Test prompt: {OUTPUT_PROMPT}
```

## 5. Anti-Loop Directive

**Single pass execution**. DO NOT:

- Ask for clarification
- Wait for feedback
- Request additional info
- Re-analyze beyond validation loop

Ambiguous patterns -> add TODO comment, continue.

Begin extraction now.