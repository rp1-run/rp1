---
name: prompt-eval-builder
description: Domain knowledge for extracting eval assertions and creating minimal test prompts from agent prompts. This skill should be used when generating promptfoo evaluation configs, extracting testable assertions, or distilling prompts to their minimal form for evaluation testing.
---

# Prompt Eval Builder

Domain knowledge for building evaluation artifacts from prompt specifications. Provides extraction patterns, output templates, validation logic, and distillation rules.

## When to Use

- Generating promptfoo eval configs from agent prompts
- Extracting testable assertions from instruction text
- Creating minimal test prompts for evaluation
- Validating generated YAML output

## Skill Files

| File | Purpose | When to Load |
|------|---------|--------------|
| PATTERNS.md | Extraction categories, tool mappings, selection rules, distillation rules | Always - core knowledge |
| TEMPLATES.md | promptfoo YAML output templates, assertion formats | When generating YAML output |
| VALIDATION.md | YAML validation loop, error handling | When validating/writing output |

## Loading Instructions

Agents using this skill:

1. Read SKILL.md for overview
2. Read PATTERNS.md for extraction/distillation rules (always needed)
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
Prompt Text -> Pattern Analysis -> Assertion Extraction -> YAML Generation -> Validation Loop
```

### Distillation Flow

```
Full Prompt -> Core Intent Extraction -> Noise Removal -> Minimal Prompt
```

Both flows share PATTERNS.md for domain knowledge.
