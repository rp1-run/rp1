# rp1-utils: Meta Tools for rp1 Development

Meta tools for rp1 developers: prompt engineering, agent refactoring, and workflow optimization.

## Overview

The `rp1-utils` plugin provides specialized tools for developing and maintaining the rp1 plugin system itself:

- **Prompt tersification** - Compress agent prompts while preserving full intent
- **Agent refactoring** - Tools for optimizing constitutional agents

**Commands**: 2 user-facing commands
**Agents**: 1 specialized agent
**Skills**: 1 internal skill

## Commands (2)

### Prompt Engineering
- `/tersify-prompt <file-path-or-prompt>` - Rewrite agent prompts to be maximally terse while preserving full intent
- `/build-prompt <PROMPT_NAME> <DESCRIPTION> [TYPE=prompt|skill] [--existing <path>] [--afk]` - Build a governed prompt or skill through the six-stage prompt-writer pipeline with budgeted governance

#### tersify-prompt

**Modes**:
- **File mode**: Updates file in place, displays change summary
- **Inline mode**: Displays compressed prompt and change log

**Usage**:
```bash
/tersify-prompt plugins/base/agents/kb-spatial-analyzer.md
/tersify-prompt "You are a helpful assistant. Always be polite and thorough..."
```

#### build-prompt

Runs the six-stage prompt-writer pipeline (constitutional-checklist, fallibilist-overlay, epistemic-stance, popper-patterns, confidence-schema, prompt-validation) with a 15% governance budget cap, producing two artifacts: a ready-to-run prompt and a confidence report.

**Arguments**:
- `PROMPT_NAME` (required) - Name for the prompt (kebab-case, used as slug)
- `DESCRIPTION` (required) - Description of the prompt or skill to create
- `TYPE` - Output format: `prompt` (default, standalone markdown) or `skill` (SKILL.md with rp1 frontmatter)
- `EXISTING` - Path to an existing prompt file to improve (original is not modified)
- `AGENT_TYPE` - Constitutional profile: `leaf-worker` (default), `orchestrator`, `interactive-skill`, `kb-investigator`
- `COMPLEXITY` - Scaffolding size: `auto` (default), `simple`, `standard`, `complex`
- `AFK` - Non-interactive mode

**Output**: `{work_root}/prompts/{YYYY-MM-DD}-{slug}/` containing:
- `{slug}.md` (TYPE=prompt) or `SKILL.md` (TYPE=skill)
- `confidence-report.md`

**Usage**:
```bash
/build-prompt my-agent "An agent that validates API responses" TYPE=skill
/build-prompt my-prompt "A prompt for code review" --existing path/to/prompt.md
/build-prompt my-skill "A skill for data validation" TYPE=skill --afk
```

## Agents (1)

| Agent | Purpose |
|-------|---------|
| prompt-tersifier | Transforms agent-instruction prompts into maximally terse versions |

## Skills (1)

### prompt-eval-builder
Domain knowledge for extracting eval assertions and creating minimal test prompts from agent prompts.

**Use when**: Generating promptfoo evaluation configs or minimal test prompts from agent prompts.

**Invocation**: Loaded automatically by agents.

**Includes**:
- `SKILL.md` - Entry point and file manifest
- `PATTERNS.md` - Extraction categories, tool mappings, smart selection rules, distillation rules
- `TEMPLATES.md` - promptfoo YAML output templates
- `VALIDATION.md` - YAML validation loop logic
- `scripts/validate-yaml.ts` - Executable validation script

## Version

Current: 0.2.3
