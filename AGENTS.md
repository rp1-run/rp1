# rp1 Plugin System - AI Assistant Guide

## Quick Orientation

**What is this?** Multi Agentic Tool plugins that automate development workflows through constitutional prompting.
**Plugins**:

- **rp1-base**: Knowledge management, documentation, strategy, security (6 commands, 9 agents, 4 skills)
- **rp1-dev**: Feature workflows, code quality, PR management, testing (15 commands, 9 agents)
- rp1-utils: Shared utilities (no commands/agents)
**Key Concept**: Commands delegate to agents that execute complete workflows autonomously (no iterative refinement).

---

## 🧭 Navigation Guide

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

**Subagent Limitations**: Subagents generally cannot spawn other agents. Hence if an agent is designed to act as a subagent, it must not use the SlashCommand tool to call other commands. Intead, just use raw prompts. Example of this to load knowledge base context, do not use the SlashCommand tool to call `/rp1-base:knowledge-load` from a subagent. Instead, just include the relevant prompt text directly. There are examples of this in plugins dir.

**Positional Parameters**:

- ✅ `$1`, `$2`, `$3` - Fixed, structured arguments
- ✅ `$ARGUMENTS` - Variable-length, freeform input
- ❌ `{{PLACEHOLDER}}` - **DEPRECATED** (except for environment variables like {{RP1_ROOT}})

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

### Namespace Prefixes (ALWAYS USE THESE)

**Commands**:

- ✅ `/rp1-base:command-name` - Base plugin commands
- ✅ `/rp1-dev:command-name` - Dev plugin commands

**Skills** (all in base):

- ✅ `rp1-base:skill-name` - Always use base prefix

**Agent References**:

- ✅ `subagent_type: rp1-base:agent-name` - For claude code
- ✅ `subagent_type: @rp1-dev/agent-name` - For OpenCode

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
| **base** | Knowledge, docs, strategy, security, content writing, **all skills** |
| **dev** | Features, code quality, PRs, testing (depends on base) |

**Decision Guide**:

- Foundation/utility → base
- Development workflow → dev
- Shared capability → skill in base

---

## 🏗️ Development Patterns

### Technology choices

1. Always prefer Bun and its ecosystem when writing new code in the repository. Fall back to Node.js only if a Bun ecosystem equivalent is unavailable or not sufficiently mature.

2. We use bun to create an executable of the main CLI. Extra care should be taken to ensure we bundle all assets and any other files properly for this single executable to work.

3. When using fp-ts, use monads and functional patterns where appropriate, but avoid overcomplicating simple logic. This includes using `match`, `map`, `flatmap`, `isLeft` etc

4. Use appropriate lsps when writing or looking for code.

### Adding a New Command

1. **Choose plugin**: base or dev or utils?
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
   - `/rp1-{plugin}:my-command` - Description
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

### Testing, formatting, and validating CLI  (must be done after changes)

```bash
just # run just to read about various test/lint commands
```

### Validation Checklist

**After making changes**:

- [ ] Command references use proper namespace prefix
- [ ] Agent follows constitutional pattern
- [ ] Anti-loop directives present
- [ ] **Agent prompt is crisp and concise (200-300 lines max)**
- [ ] **No verbose explanations or inline examples**
- [ ] Cross-plugin calls have error handling
- [ ] README updated (if new command)
- [ ] Conventional commit format used
- [ ] When modifying cli, tests pass with format/lint checks (use just)

**Before merging**:

- [ ] Both plugins install successfully
- [ ] Commands appear in `/help`
- [ ] Test command execution
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

KB files in `.rp1/context/`: `index.md` (load first), `architecture.md`, `modules.md`, `patterns.md`, `concept_map.md`

**Loading Patterns**:

| Task Type | KB Files to Load |
|-----------|------------------|
| Code review | `index.md` + `patterns.md` |
| Bug investigation | `index.md` + `architecture.md` + `modules.md` |
| Feature implementation | `index.md` + `modules.md` + `patterns.md` |
| PR review | `index.md` + `patterns.md` |
| Architecture analysis | `index.md` + `architecture.md` |
| Strategic / Security / Docs | ALL files |

**Progressive Loading** (recommended): Start with `index.md`, load others as needed based on task.

**Important**: Do NOT use `/rp1-base/knowledge-load` in subagents (causes early exit). Use Read tool directly.
<!-- rp1:end -->
