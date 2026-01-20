# rp1-utils: Meta Tools for rp1 Development

Meta tools for rp1 developers: prompt engineering, agent refactoring, and workflow optimization.

## Overview

The `rp1-utils` plugin provides specialized tools for developing and maintaining the rp1 plugin system itself:

- **Prompt tersification** - Compress agent prompts while preserving full intent
- **Prompt authoring** - Write terse prompts from scratch using compression-by-default principles
- **Agent refactoring** - Tools for optimizing constitutional agents

**Commands**: 2 user-facing commands
**Agents**: 5 specialized agents
**Skills**: 2 internal skills

## Commands (2)

### Prompt Engineering
- `/tersify-prompt <file-path-or-prompt>` - Rewrite agent prompts to be maximally terse while preserving full intent
- `/build-prompt-evals <file-or-prompt> [--output <dir>]` - Build eval assertions and minimal test prompt, then optimize with assertion resolution and scenario consolidation

#### tersify-prompt

**Modes**:
- **File mode**: Updates file in place, displays change summary
- **Inline mode**: Displays compressed prompt and change log

**Usage**:
```bash
/tersify-prompt plugins/base/agents/kb-spatial-analyzer.md
/tersify-prompt "You are a helpful assistant. Always be polite and thorough..."
```

#### build-prompt-evals

Generates eval assertions (YAML) and minimal test prompts from prompt text, then optimizes the assertions. Full workflow:
1. **Extraction**: Spawns prompt-eval-extractor to parse assertions and create test prompt
2. **Optimization**: Spawns prompt-assertion-specialist to resolve placeholder assertions, consolidate scenarios, and document unresolved assertions

**Outputs**:
- `{basename}-evals.yaml` - promptfoo-compatible assertions (optimized)
- `{basename}-eval-prompt.md` - minimal test prompt for evaluation
- `{RP1_ROOT}/work/notes/assertions-to-be-built-{timestamp}.md` - (if unresolved placeholders exist)

**Modes**:
- **File mode**: Reads prompt file, outputs to same directory
- **Inline mode**: Processes raw text, outputs to current directory
- **Custom output**: Use `--output <dir>` to specify output directory

**Usage**:
```bash
/build-prompt-evals plugins/dev/agents/task-builder.md
/build-prompt-evals my-prompt.md --output evals/suites/my-plugin/
/build-prompt-evals "Create a branch and commit changes"
```

## Agents (5)

| Agent | Purpose |
|-------|---------|
| dependency-chain-analyzer | Analyzes command/agent files to discover sub-agent and skill dependencies |
| prompt-tersifier | Transforms agent-instruction prompts into maximally terse versions |
| prompt-eval-extractor | Extracts evaluation assertions from prompt text for promptfoo |
| eval-prompt-writer | Creates minimal test prompts optimized for evaluation |
| prompt-assertion-specialist | Resolves placeholder assertions to implementations, consolidates scenarios |

### dependency-chain-analyzer

Parses command and agent files to extract sub-agent and skill dependencies for comprehensive eval coverage across dependency trees.

**Input**: File path to a command or agent markdown file

**Output**: JSON structure containing:

```json
{
  "root": {
    "path": "plugins/dev/commands/build-fast.md",
    "name": "build-fast"
  },
  "agents": [
    {"path": "plugins/dev/agents/task-builder.md", "plugin": "rp1-dev", "name": "task-builder"}
  ],
  "skills": [
    {"path": "plugins/base/skills/prompt-writer/SKILL.md", "plugin": "rp1-base", "name": "prompt-writer"}
  ],
  "warnings": ["Agent not found: rp1-dev:missing-agent"]
}
```

**Usage**: Invoked automatically by `build-prompt-evals` in file mode. Can also be spawned directly:

```
Task tool with subagent_type: rp1-utils:dependency-chain-analyzer
$1: plugins/dev/commands/build-fast.md
```

**Detection Patterns**:
- Task references: `Task: rp1-dev:agent-name`
- Skill references: `Skill: rp1-base:skill-name`

### prompt-assertion-specialist

Optimizes eval configurations by resolving placeholder assertions to actual implementations, consolidating redundant test scenarios, and documenting assertions that require custom implementation.

**Input**: Eval YAML config path, source name, RP1_ROOT

**Processing**:
1. Parse placeholder assertions (PLACEHOLDER:, TODO:, # PLACEHOLDER: markers)
2. Resolve to promptfoo built-ins (contains, regex, llm-rubric, is-json, etc.)
3. Resolve to shared assertions (assertToolCall, assertGitCommitToolCall, etc.)
4. Consolidate scenarios with identical assertions
5. Document unresolved placeholders with implementation specs

**Output**: Optimized YAML config (overwrites input) + assertions-to-be-built.md if needed

**Usage**: Invoked automatically by `build-prompt-evals` after extraction. Can also be spawned directly:

```
Task tool with subagent_type: rp1-utils:prompt-assertion-specialist
$1: path/to/evals.yaml
$2: source-name
$3: .rp1
```

## Skills (2)

### prompt-writer
Write maximally terse agent prompts from scratch using compression-by-default principles. Teaches structure-first composition with section patterns (§ROLE, §OBJ, §PROC, etc.), abbreviation policies, symbolic encoding, and anti-pattern avoidance.

**Use when**: Creating new agent specs, command prompts, or instruction sets.

**Invocation**: Use the Skill tool with `skill: "rp1-utils:prompt-writer"`

**Includes**:
- `SKILL.md` - Core authoring guidelines and validation checklist
- `TEMPLATES.md` - Example prompts at simple/moderate/complex levels
- `PATTERNS.md` - 10 reusable patterns (constitutional agent, map-reduce, state machine, etc.)

### prompt-eval-builder
Domain knowledge for extracting eval assertions and creating minimal test prompts from agent prompts. Used by `prompt-eval-extractor` and `eval-prompt-writer` agents.

**Use when**: Generating promptfoo evaluation configs or minimal test prompts from agent prompts.

**Invocation**: Loaded automatically by the agents; use `/build-prompt-evals` command.

**Includes**:
- `SKILL.md` - Entry point and file manifest
- `PATTERNS.md` - Extraction categories, tool mappings, smart selection rules, distillation rules
- `TEMPLATES.md` - promptfoo YAML output templates
- `VALIDATION.md` - YAML validation loop logic
- `scripts/validate-yaml.ts` - Executable validation script

## Version

Current: 0.2.3
