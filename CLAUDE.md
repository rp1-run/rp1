# rp1 Plugin System - AI Assistant Guide

## Quick Orientation

**What is this?** Two Claude Code plugins that automate development workflows through constitutional prompting.
**Plugins**:

- **rp1-base**: Knowledge management, documentation, strategy, security (6 commands, 9 agents, 4 skills)
- **rp1-dev**: Feature workflows, code quality, PR management, testing (15 commands, 9 agents)
**Key Concept**: Commands delegate to agents that execute complete workflows autonomously (no iterative refinement).

---

## 📚 Primary Documentation Location

**Read these files FIRST before making changes**:

```
.rp1/context/          # Auto-generated knowledge base (authoritative)
├── index.md           # Project overview, structure, entry points
├── concept_map.md     # Domain concepts and terminology
├── architecture.md    # System architecture and patterns
└── modules.md         # Component breakdown (all commands/agents/skills)
```

**This AGENTS.md file is a navigation guide, NOT a content repository.**
The KB files contain detailed architecture, patterns, and component information.

## 🧭 Navigation Guide

### "I need to understand..."

| Topic | File to Read |
|-------|--------------|
| Overall architecture | `.rp1/context/architecture.md` |
| What commands/agents exist | `.rp1/context/modules.md` |
| Domain terminology | `.rp1/context/concept_map.md` |
| Project overview | `.rp1/context/index.md` |
| Specific command/agent | `plugins/{plugin}/commands/*.md` or `plugins/{plugin}/agents/*.md` |

### "I need to..."

| Task | Action |
|------|--------|
| Add new command | See "Development Patterns" below |
| Understand a pattern | Read KB files + sample agent code |
| Fix broken command | Check namespace prefix rules below |
| Test changes | See "Testing" section below |

---

## 🎯 Critical Rules (v2.0.0 Specific)

### Platform Compatibility - Argument Passing

**OpenCode & Claude Code Support**: All rp1 commands use explicit argument syntax compatible with both platforms.

**Subagent Limitations**: Subagents generally cannot spawn other agents. Hence if an agent is designed to act as a subagent, it must not use the SlashCommand tool to call other commands. Instead, just use raw prompts. Example of this to load knowledge base context, do not use the SlashCommand tool to call `/knowledge-load` from a subagent. Instead, just include the relevant prompt text directly. There are examples of this in plugins dir.

**Positional Parameters**:

- ✅ `$1`, `$2`, `$3` - Fixed, structured arguments
- ✅ `$ARGUMENTS` - Variable-length, freeform input
- ❌ `{{PLACEHOLDER}}` - **DEPRECATED** (except for environment variables like {{RP1_ROOT}})

**Command Invocation Examples**:

```bash
# Claude Code (short form preferred)
/feature-requirements my-feature "extra context"
/code-quick-build "Fix the authentication bug"

# OpenCode (strict positional)
/rp1-dev/feature-requirements my-feature "extra context"
/rp1-dev/code-quick-build "Fix the authentication bug"
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

### Command Invocation (Claude Code)

**Standard Usage** - Use short form without prefix:

- ✅ `/command-name` - Preferred for most cases (e.g., `/knowledge-build`, `/feature-tasks`)

**Prefixed Form** - Only needed if there's a command name conflict with other plugins:

- `/rp1-base:command-name` - Base plugin commands (when disambiguation needed)
- `/rp1-dev:command-name` - Dev plugin commands (when disambiguation needed)

**Skills** (all in base):

- ✅ `rp1-base:skill-name` - Always use base prefix

**Agent References**:

- ✅ `subagent_type: rp1-base:agent-name` - For Claude Code
- ✅ `subagent_type: @rp1-dev/agent-name` - For OpenCode

### Cross-Plugin Dependencies

**Dev can call Base**:

```markdown
# In dev agents
Run `/knowledge-load` to load KB context.

**CRITICAL**: This requires rp1-base plugin.
If command fails, inform user to install:
/plugin install rp1-base
```

**Base is independent**: Base agents cannot call dev commands.

### Plugin Boundaries

| Plugin | Contains |
|--------|----------|
| **base** | Knowledge, docs, strategy, security, content writing, **all skills** |
| **dev** | Features, code quality, PRs, testing (depends on base) |

**Decision Guide**:

- Foundation/utility → base
- Development workflow → dev
- Shared capability → skill in base

---

## 🏗️ Development Patterns

### Adding a New Command

1. **Choose plugin**: base or dev?
2. **Create agent** (if needed):

   ```bash
   touch plugins/{plugin}/agents/my-agent.md
   ```

3. **Create command**:

   ```bash
   touch plugins/{plugin}/commands/my-command.md
   ```

4. **Update README**:

   ```bash
   # Add to plugins/{plugin}/README.md
   - `/my-command` - Description
   ```

5. **Commit with conventional format**:

   ```bash
   git commit -m "feat(plugin): add my-command"
   ```

### Constitutional Agent Pattern

**All agents follow this structure**:

If needed, read an example agent spec at: ./plugins/base/agents/kb-spatial-analyzer.md

---

## 🧪 Testing

### Local Testing Setup (claude code)

```bash
# From repository root
/plugin marketplace add .
/plugin install rp1-base@rp1-local
/plugin install rp1-dev@rp1-local

# Verify
/help | grep rp1
# Should show 19 commands (6 base + 13 dev)
```

### Documentation Site Testing

```bash
# Preview docs locally (requires uv)
uv run --with mkdocs-material mkdocs serve

# Build with strict mode (catches broken links)
uv run --with mkdocs-material mkdocs build --strict

# Site will be available at http://127.0.0.1:8000
```

### Validation Checklist

**After making changes**:

- [ ] Command references use short form `/command` (Claude Code) or `/rp1-xxx/command` (OpenCode)
- [ ] Agent follows constitutional pattern
- [ ] Anti-loop directives present
- [ ] **Agent prompt is crisp and concise (200-300 lines max)**
- [ ] **No verbose explanations or inline examples**
- [ ] Cross-plugin calls have error handling
- [ ] README updated (if new command)
- [ ] Conventional commit format used

**Before merging**:

- [ ] Both plugins install successfully
- [ ] Commands appear in `/help`
- [ ] Test command execution
- [ ] Cross-plugin KB loading works (if KB-aware)

### Reading This Codebase

1. **You're reading this file** (AGENTS.md) - ✅ Orientation complete
2. **Read on-demand**: Load `.rp1/context/*.md` files using Read tool as needed
3. **Check patterns**: Look at any agent in `plugins/{plugin}/agents/` for structure examples
4. **Follow command conventions**: Use short form `/command` for Claude Code docs
5. **Handle dependencies**: Dev can call base, check for errors

### Making Changes

1. **Determine plugin**: base (foundation) or dev (development)?
2. **Follow patterns**: Constitutional agent structure, command thin wrapper
3. **Use proper conventions**: `/command` for Claude Code docs, `rp1-base:skill` for skills
4. **Test thoroughly**: Install both plugins, verify execution
5. **Update docs**: README when adding commands

### Don't

- ❌ Load all KB files upfront (use Read tool selectively)
- ❌ Create iterative workflows in agents
- ❌ Use prefixed form (`/rp1-dev:command`) in docs unless documenting conflict resolution
- ❌ Call dev commands from base agents

---

## 🔗 Resources

- **GitHub**: <https://github.com/rp1-run/rp1>
- **Issues**: <https://github.com/rp1-run/rp1/issues>

---

**This is a navigation guide. For detailed information, read the KB files in `.rp1/context/`.**
