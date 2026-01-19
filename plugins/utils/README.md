# rp1-utils: Meta Tools for rp1 Development

Meta tools for rp1 developers: prompt engineering, agent refactoring, and workflow optimization.

## Overview

The `rp1-utils` plugin provides specialized tools for developing and maintaining the rp1 plugin system itself:

- **Prompt tersification** - Compress agent prompts while preserving full intent
- **Prompt authoring** - Write terse prompts from scratch using compression-by-default principles
- **Agent refactoring** - Tools for optimizing constitutional agents

**Commands**: 2 user-facing commands
**Agents**: 2 specialized agents
**Skills**: 1 internal skill

## Commands (2)

### Prompt Engineering
- `/tersify-prompt <file-path-or-prompt>` - Rewrite agent prompts to be maximally terse while preserving full intent
- `/extract-prompt-evals <input> [output-file]` - Extract evaluation assertions from prompt text as promptfoo YAML

#### tersify-prompt

**Modes**:
- **File mode**: Updates file in place, displays change summary
- **Inline mode**: Displays compressed prompt and change log

**Usage**:
```bash
/tersify-prompt plugins/base/agents/kb-spatial-analyzer.md
/tersify-prompt "You are a helpful assistant. Always be polite and thorough..."
```

#### extract-prompt-evals

Analyzes prompt text and generates promptfoo-compatible YAML with placeholder assertions.

**Modes**:
- **File mode**: Reads prompt file, outputs `{basename}-evals.yaml`
- **Inline mode**: Processes raw text, outputs `extracted-evals.yaml`

**Usage**:
```bash
/extract-prompt-evals plugins/dev/agents/task-builder.md
/extract-prompt-evals my-prompt.md evals/suites/my-eval/config.yaml
/extract-prompt-evals "Create a branch and commit changes"
```

## Agents (2)

| Agent | Purpose |
|-------|---------|
| prompt-tersifier | Transforms agent-instruction prompts into maximally terse versions |
| prompt-eval-extractor | Extracts evaluation assertions from prompt text for promptfoo |

## Skills (1)

### prompt-writer
Write maximally terse agent prompts from scratch using compression-by-default principles. Teaches structure-first composition with section patterns (§ROLE, §OBJ, §PROC, etc.), abbreviation policies, symbolic encoding, and anti-pattern avoidance.

**Use when**: Creating new agent specs, command prompts, or instruction sets.

**Invocation**: Use the Skill tool with `skill: "rp1-utils:prompt-writer"`

**Includes**:
- `SKILL.md` - Core authoring guidelines and validation checklist
- `TEMPLATES.md` - Example prompts at simple/moderate/complex levels
- `PATTERNS.md` - 10 reusable patterns (constitutional agent, map-reduce, state machine, etc.)

## Version

Current: 0.2.3
