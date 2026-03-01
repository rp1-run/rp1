# rp1 Plugin System - AI Assistant Guide

## Quick Orientation

**What is this?** Multi Agentic Tool plugins that automate development workflows through constitutional prompting.
**Plugins**:

- **rp1-base**: Knowledge management, documentation, strategy, security (15 skills, 13 agents)
- **rp1-dev**: Feature workflows, code quality, PR management, testing (19 skills, 32 agents)
- **rp1-utils**: Prompt utilities (5 skills, 4 agents)
**Key Concept**: Skills delegate to agents that execute complete workflows autonomously (no iterative refinement).

---

## 🧭 Navigation Guide

### "I need to..."

| Task | Action |
|------|--------|
| Add new skill | See "Development Patterns" below |
| Understand a pattern | Read KB files + sample agent code |
| Fix broken skill | Check namespace prefix rules below |
| Test changes | See "Testing" section below |
| Working with Browser features | use skill: playwright-cli   |

---

## 🎯 Critical Rules (v2.0.0 Specific)

### Platform Compatibility - Argument Passing

**OpenCode & Claude Code Support**: All rp1 commands use explicit argument syntax compatible with both platforms.

**Subagent Limitations**: Subagents generally cannot spawn other agents. Hence if an agent is designed to act as a subagent, it must not use the SlashCommand tool to call other commands. Intead, just use raw prompts. Example of this to load knowledge base context, do not use the SlashCommand tool to call `/rp1-base:knowledge-load` from a subagent. Instead, just include the relevant prompt text directly. There are examples of this in plugins dir.

**Positional Parameters**:

- ✅ `$1`, `$2`, `$3` - Fixed, structured arguments
- ✅ `$ARGUMENTS` - Variable-length, freeform input

**Command Invocation Examples**:

```bash
# Claude Code (flexible)
/rp1-dev:feature-requirements my-feature "extra context"
/rp1-dev:build-fast "Fix the authentication bug"

# OpenCode (strict positional)
/rp1-dev/feature-requirements my-feature "extra context"
/rp1-dev/build-fast "Fix the authentication bug"
```

**Argument Hints**: Commands with parameters include `argument-hint` in frontmatter:

```yaml
---
name: feature-requirements
argument-hint: "feature-id [extra-context]"
---
```

**Agent Parameter Tables**: All agents document parameter mappings:

```markdown
## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| FEATURE_ID | $1 | (required) | Feature identifier |
| EXTRA_CONTEXT | $2 | `""` | Additional context |
| RP1_ROOT | Environment | `.rp1/` | Root directory |
```

**When to Use $ARGUMENTS vs Positional**:

- Use `$ARGUMENTS` for freeform text (development requests, problem descriptions)
- Use `$1`, `$2`, etc. for structured parameters (feature-id, branch names, modes)

### Parameter Passing Conventions

**Template Variable Assignment** (canonical pattern):

```markdown
$RP1_ROOT = !`echo ${RP1_ROOT:-.rp1/}`
```

This pattern:

- `$` prefix marks it as a variable
- `!` prefix with backticks executes shell command
- `{{ }}` ensures the agent knows it's a template variable when interpolated

**Template Interpolation** (in paths):

```markdown
{{$RP1_ROOT}}/work/features/{FEATURE_ID}/
```

**XML Tags vs Inline Parameters**:

| Use XML Tags When | Use Inline Parameters When |
|-------------------|---------------------------|
| Command spawns subagents | Simple delegation to single agent |
| Parameter needs multi-line content | Parameter is a single value |
| Parameter requires instructions | Direct positional mapping suffices |

**Variable Assignment + XML Tag Example** (subagent spawning):

```markdown
$RP1_ROOT = !`echo ${RP1_ROOT:-.rp1/}`

<feature_id>$1</feature_id>

<requirements>$2</requirements>

Feature dir: {{$RP1_ROOT}}/work/features/{FEATURE_ID}/
```

**Inline Example** (simple delegation):

```markdown
## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| TOPIC | $1 | (required) | Research topic |

Analyze the topic: $1
```

**Standard Parameter Table Format**:

All commands with parameters MUST use this format:

```markdown
## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| FEATURE_ID | $1 | (required) | Feature identifier |
| CONTEXT | $2 | `""` | Optional context |
| RP1_ROOT | Environment | `.rp1/` | Root directory |
```

**Argument-Hint Notation**:

Use in YAML frontmatter to document command usage:

| Notation | Meaning | Example |
|----------|---------|---------|
| `<param>` | Required parameter | `<feature-id>` |
| `[param]` | Optional parameter | `[context]` |
| `[param...]` | Variadic optional | `[files...]` |
| `[--flag]` | Optional flag | `[--afk]` |

**Example frontmatter**:

```yaml
---
name: build
argument-hint: "<feature-id> [requirements] [--afk] [--git-worktree]"
---
```

### Namespace Prefixes (ALWAYS USE THESE)

**Skills** (invocable via slash commands -- all commands are now skills in SKILL.md format):

- ✅ `/rp1-base:skill-name` - Base plugin skills
- ✅ `/rp1-dev:skill-name` - Dev plugin skills
- ✅ `/rp1-utils:skill-name` - Utils plugin skills

**Agent References**:

- ✅ `subagent_type: rp1-base:agent-name` - For Claude Code
- ✅ `subagent_type: @rp1-dev/agent-name` - For OpenCode

### Allowed-Tools Pattern (Claude Code)

**Purpose**: Pre-authorize Bash commands in SKILL.md frontmatter to avoid permission prompts during execution.

**When to Use**: Add `allowed-tools` to skill files that use:

| Pattern | Use Case | Example |
|---------|----------|---------|
| `Bash(echo *)` | Shell parameter expansion with `${}` syntax | `!`echo ${RP1_ROOT:-.rp1/}`` |
| `Bash(rp1 *)` | rp1 CLI invocations (e.g., `rp1 agent-tools worktree`, `rp1 agent-tools work`) | `rp1 agent-tools work update` |
| `Bash(printf *)` | Formatted output with special characters | `printf '%s\n' "$VAR"` |

**Default**: All rp1 skills should include both `Bash(echo *)` and `Bash(rp1 *)` in `allowed-tools`. `Bash(echo *)` enables environment variable resolution; `Bash(rp1 *)` enables rp1 agent-tools calls (work update, worktree, mmd-validate, github-pr, etc.).

**Frontmatter Example** (SKILL.md format):

```yaml
---
name: my-skill
description: "Skill that uses parameter expansion and rp1 CLI tools."
allowed-tools: Bash(echo *), Bash(rp1 *), Read, Write, Edit, Glob, Grep, Task
metadata:
  version: 1.0.0
  tags:
    - workflow
  created: 2026-01-01
  author: cloud-on-prem/rp1
  argument-hint: "[args]"
---
```

**Placement Rule**: `allowed-tools` is a top-level field in SKILL.md frontmatter (comma-separated string for Claude Code). The build pipeline converts it to a YAML list for OpenCode.

**Agent Files Do NOT Need This**:

Subagents automatically inherit Bash permissions from their parent skills per Claude Code documentation. Only skill files (entry points) require `allowed-tools` frontmatter.

| File Type | Requires allowed-tools | Reason |
|-----------|------------------------|--------|
| Skills (`skills/*/SKILL.md`) | Yes, if using Bash patterns | Entry point for permission grants |
| Agents (`agents/*.md`) | No | Inherits from parent skill |

**OpenCode Compatibility**: OpenCode ignores unknown frontmatter fields, so `allowed-tools` has no effect but causes no errors.

### Cross-Plugin Dependencies

**Dev can call Base**:

```markdown
# In dev agents
Run `/rp1-base:knowledge-load` to load KB context.

**CRITICAL**: This requires rp1-base plugin.
If command fails, inform user to install:
/plugin install rp1-base
```

**Base is independent**: Base agents cannot call dev commands.

### Plugin Boundaries

| Plugin | Contains |
|--------|----------|
| **base** | Knowledge, docs, strategy, security, content writing (15 skills, 13 agents) |
| **dev** | Features, code quality, PRs, testing (19 skills, 32 agents; depends on base) |
| **utils** | Prompt optimization, eval generation (5 skills, 4 agents) |

**Decision Guide**:

- Foundation/utility → base
- Development workflow → dev
- Prompt tooling → utils
- Shared capability (reusable by other skills/agents) → skill in base

---

## 🏗️ Development Patterns

### Technology choices

1. Always prefer Bun and its ecosystem when writing new code in the repository. Fall back to Node.js only if a Bun ecosystem equivalent is unavailable or not sufficiently mature.

2. We use bun to create an executable of the main CLI. Extra care should be taken to ensure we bundle all assets and any other files properly for this single executable to work.

3. When using fp-ts, use monads and functional patterns where appropriate, but avoid overcomplicating simple logic. This includes using `match`, `map`, `flatmap`, `isLeft` etc

4. Use appropriate lsps when writing or looking for code.

5. **Frontend development**: When working on frontend code (especially `cli/web-ui/`), use the `frontend-design` skill for building/styling UI components and the `playwright-cli` skill to visually verify changes, test interactions, and capture screenshots. Run `just serve-web-ui` first, then use playwright-cli to validate UI behavior at `http://localhost:5173`.
Use /tmp directory for any temporary screenshots or playwright-related files needed during frontend development, as this avoids issues with file watching and hot reload in the web UI.

### Adding a New Skill

All rp1 invocable prompts use the [SKILL.md canonical format](docs/concepts/skill-format.md).

1. **Choose plugin**: base or dev or utils?
2. **Create agent** (if needed):

   ```bash
   touch plugins/{plugin}/agents/my-agent.md
   ```

3. **Create skill directory and SKILL.md**:

   ```bash
   mkdir -p plugins/{plugin}/skills/my-skill/
   touch plugins/{plugin}/skills/my-skill/SKILL.md
   ```

   Use the SKILL.md frontmatter schema: `name`, `description`, `allowed-tools` at top level; rp1-specific fields (`version`, `tags`, `created`, `author`, `argument-hint`) in the `metadata` map. See [SKILL.md Format Spec](docs/concepts/skill-format.md) for details.

4. **Update README**:

   ```bash
   # Add to plugins/{plugin}/README.md
   - `/rp1-{plugin}:my-skill` - Description
   ```

5. **Commit with conventional format**:

   ```bash
   git commit -m "feat(plugin): add my-skill"
   ```

### Constitutional Agent Pattern

**All agents follow this structure**:

If needed, read an example agent spec at: ./plugins/base/agents/kb-spatial-analyzer.md

## Common Issues while development

If you encounter issues installing uv, bun, or npm packages, it's most probably due to a VPN issue on my machine. Stop and ask for help. It's an easy manual fix.

## 🧪 Testing

### Testing, formatting, and validating CLI  (must be done after changes)

```bash
just # run just to read about various test/lint commands
```

### Validation Checklist

**After making changes**:

- [ ] Skill references use proper namespace prefix
- [ ] Agent follows constitutional pattern
- [ ] Anti-loop directives present
- [ ] **Agent prompt is crisp and concise (200-300 lines max)**
- [ ] **No verbose explanations or inline examples**
- [ ] Cross-plugin calls have error handling
- [ ] README updated (if new skill)
- [ ] Conventional commit format used
- [ ] When modifying cli, tests pass with format/lint checks (use just)

**Before merging**:

- [ ] Both plugins install successfully
- [ ] Skills appear in `/help`
- [ ] Test skill execution
- [ ] Cross-plugin KB loading works (if KB-aware)

### Documentation

1. When adding new features/commands/agents, update relevant parts of the user-facing docs if relevant. (documentation is in the `docs/` folder at the repo root).

### Don't

- ❌ Create iterative workflows in agents (subagents cannot call other agents)
- ❌ Forget namespace prefixes
- ❌ Call dev commands from base agents (one-way dependency)

---

## 🔗 Resources

- **GitHub**: <https://github.com/rp1-run/rp1>
- **Issues**: <https://github.com/rp1-run/rp1/issues>

---

<!-- rp1:start -->
## rp1 Knowledge Base

**Use Progressive Disclosure Pattern**

Location: `.rp1/context/`

Files:

- index.md (always load first)
- architecture.md
- modules.md
- patterns.md
- concept_map.md

Loading rules:

1. Always read index.md first.
2. Then load based on task type:
   - Code review: patterns.md
   - Bug investigation: architecture.md, modules.md
   - Feature work: modules.md, patterns.md
   - Strategic or system-wide analysis: all files
<!-- rp1:end -->

## Useful Skills

Use these two skills when working with frontend code.

- frontend-design@claude-plugins-official
- agent-browser
