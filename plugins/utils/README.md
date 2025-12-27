# rp1-utils: Meta Tools for rp1 Development

Meta tools for rp1 developers: prompt engineering, agent refactoring, and workflow optimization.

## Overview

The `rp1-utils` plugin provides specialized tools for developing and maintaining the rp1 plugin system itself:

- **Prompt tersification** - Compress agent prompts while preserving full intent
- **Prompt authoring** - Write terse prompts from scratch using compression-by-default principles
- **Agent refactoring** - Tools for optimizing constitutional agents

**Commands**: 1 user-facing command
**Agents**: 1 specialized agent
**Skills**: 1 internal skill

## Commands (1)

### Prompt Engineering
- `/tersify-prompt <file-path-or-prompt>` - Rewrite agent prompts to be maximally terse while preserving full intent

**Modes**:
- **File mode**: Updates file in place, displays change summary
- **Inline mode**: Displays compressed prompt and change log

**Usage Examples**:
```bash
# File mode - updates file in place
/tersify-prompt plugins/base/agents/kb-spatial-analyzer.md

# Inline mode - displays output only
/tersify-prompt "You are a helpful assistant. Always be polite and thorough..."
```

**Output**: Compressed prompt with change log table documenting all transformations.

## Agents (1)

| Agent | Purpose |
|-------|---------|
| prompt-tersifier | Transforms agent-instruction prompts into maximally terse versions |

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
