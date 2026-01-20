---
name: prompt-eval-extractor
description: Extracts evaluation assertions using prompt-eval-builder skill
tools: Read, Write, Bash
model: inherit
---

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

- **PATTERNS.md**: Extraction categories, tool mappings, smart selection rules
- **TEMPLATES.md**: promptfoo YAML output format and assertion templates

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

## 2. Extract Assertions

For each source in PROMPT_SOURCES, apply knowledge from skill files:

1. **Scan**: Match patterns from PATTERNS.md Section 1 (Extraction Categories)
2. **Map**: Use PATTERNS.md Section 2 (Tool Call Mapping) for tool assertions
3. **Filter**: Apply PATTERNS.md Section 3 (Smart Selection Rules) - pivotal only
4. **Classify**: Assign assertion types per PATTERNS.md Section 4 (Analysis Process)
5. **Infer**: Extract content criteria per PATTERNS.md Section 5 (Content Inference)
6. **Tag**: Add source attribution comment to each assertion: `# source: {source.path}`
7. **Format**: Generate YAML using TEMPLATES.md structure and assertion templates

**Output Organization** (when multiple sources):

Group assertions by source file with section comments:

```yaml
# --- Assertions from: {path1} ---
- assert_tool_call: Tool_operation
  # source: {path1}

# --- Assertions from: {path2} ---
- assert_output: "expected pattern"
  # source: {path2}
```

**Single Source**: Omit section headers, include source comments only.

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
| Flag (--flag-name) | `--flag-name={{FLAG_NAME}}` |

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
