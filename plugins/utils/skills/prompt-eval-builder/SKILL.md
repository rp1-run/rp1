---
name: prompt-eval-builder
description: Domain knowledge for extracting eval assertions and generating test invocation prompts from command/agent specs. Used for building promptfoo evaluation configs.
---

# Prompt Eval Builder

Domain knowledge for building evaluation artifacts from prompt specifications. Provides extraction patterns, output templates, validation logic, and invocation prompt generation rules.

## When to Use

- Generating promptfoo eval configs from command/agent prompts
- Extracting testable assertions from instruction text (primarily LLM rubrics)
- Creating test invocation prompts (user inputs that test the command)
- Validating generated YAML output

### Assertion Types

**LLM Rubrics (Default)**: Generated for most behavioral requirements. Rubrics contain REQUIRED/PROHIBITED/EDGE CASES sections and evaluate behavior holistically by checking output text AND Metadata JSON.

**Programmatic Assertions (Complex Cases)**: Generated when requirements need exact counting, strict sequencing, or complex conditional logic that cannot be expressed in natural language rubrics. Uses `type: javascript` with `file://` references to shared assertion functions.

## Skill Files

| File | Purpose | When to Load |
|------|---------|--------------|
| PATTERNS.md | Extraction categories, tool mappings, selection rules, invocation generation | Always - core knowledge |
| TEMPLATES.md | promptfoo YAML output templates, assertion formats | When generating YAML output |
| VALIDATION.md | YAML validation loop, error handling | When validating/writing output |

## Loading Instructions

Agents using this skill:

1. Read SKILL.md for overview
2. Read PATTERNS.md for extraction/invocation rules (always needed)
3. Read TEMPLATES.md for output format (for extraction agent)
4. Use `scripts/validate-yaml.ts` for YAML validation

## Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/validate-yaml.ts` | Validate YAML syntax | `bun {skill_path}/scripts/validate-yaml.ts {output_file}` |

Output format: `{ "valid": true }` or `{ "valid": false, "error": "message" }`

## Workflow Overview

### Extraction Flow

```
Prompt Text -> Pattern Analysis -> Requirement Categorization -> LLM Rubric Generation -> YAML Validation
                                                              \-> Programmatic Assertion (if complex)
```

### Invocation Prompt Flow

```
Command/Agent Spec -> Metadata Extraction -> Variable Mapping -> Invocation Prompt
```

**Key Concept**: Test prompts are USER INPUTS that invoke the command, not distilled versions of the prompt. Example:
```
/rp1-dev:build-fast "{{REQUEST}}" --git-commit={{GIT_COMMIT}} --afk={{AFK_MODE}}
```

Both flows share PATTERNS.md for domain knowledge.
