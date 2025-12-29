# Skills

Skills are reusable capabilities that agents can invoke to perform specialized tasks. Unlike commands (which users invoke) or agents (which perform complete workflows), skills are building blocks that agents use to accomplish specific subtasks.

---

## What Are Skills?

Skills encapsulate domain expertise into a form that agents can leverage. They provide:

- **Specialized knowledge**: Deep expertise in a specific area (e.g., Mermaid diagrams, git worktrees)
- **Consistent behavior**: Same approach every time, reducing variability
- **Reusable patterns**: Multiple agents can share the same skill
- **Progressive disclosure**: Main skill file as hub, supporting files for details

---

## Skill Structure

A skill consists of one or more markdown files in a `skills/` directory:

```
plugins/{plugin}/skills/{skill-name}/
  SKILL.md         # Main skill file (required)
  WORKFLOWS.md     # Decision trees and edge cases (optional)
  TEMPLATES.md     # Output format templates (optional)
  EXAMPLES.md      # Input/output examples (optional)
```

### SKILL.md Frontmatter

```yaml
---
name: skill-name
description: What it does and when to use it with trigger terms
---
```

The description should include:
- Core capability (what the skill does)
- Trigger terms (phrases that indicate when to use it)
- Use cases (scenarios where it applies)

---

## Workflow Orchestrator Pattern

The **workflow orchestrator** pattern is used for multi-phase skills that guide agents through complex, stateful processes. The skill defines phases, verification steps, and error recovery procedures.

### Example: worktree-workflow Skill

The `worktree-workflow` skill demonstrates this pattern. It orchestrates isolated git worktree workflows for coding agents.

**Invocation**:
```
Use the Skill tool with skill: "rp1-dev:worktree-workflow"
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_slug` | string | Yes | Branch naming slug (e.g., `fix-auth-bug`) |
| `agent_prefix` | string | No | Branch prefix (default: `quick-build`) |
| `create_pr` | boolean | No | Create PR after pushing (default: `false`) |

**Four-Phase Workflow**:

```
Phase 1: Setup
  - Store original directory
  - Create worktree via CLI tool
  - Verify git state (history, branch, basedOn commit)
  
Phase 2: Implementation
  - Install dependencies if needed
  - Make changes with atomic commits
  - Follow conventional commit format
  - Track commit count
  
Phase 3: Publish
  - Validate commit ownership (count, ancestry, author)
  - Push branch to remote
  - Create PR if requested
  
Phase 4: Cleanup
  - Detect and resolve dirty state
  - Restore original directory
  - Remove worktree, preserve branch
```

**Verification Safeguards**:

The skill includes verification at each phase to prevent corrupted PRs:

| Check | Purpose |
|-------|---------|
| History exists | Worktree has valid git history |
| basedOn commit visible | Branch created from expected point |
| Commit count matches | No orphan commits included |
| Author matches | No test contamination |

**Error Recovery**:

Each phase has defined failure protocols in `WORKFLOWS.md`:
- Worktree creation failure -> cleanup and report
- Verification failure -> preserve worktree for investigation
- Dirty state at cleanup -> prompt user for resolution

---

## When to Create a Skill

Create a skill when you have:

1. **Repeated specialized logic** that multiple agents need
2. **Complex multi-step workflows** with defined phases
3. **Verification requirements** that should be consistent
4. **Domain expertise** worth encoding once

Skills are NOT for:
- Simple one-off operations (just include in agent)
- User-facing workflows (use commands instead)
- Complete autonomous tasks (use agents instead)

---

## Skill Invocation

Agents invoke skills using the Skill tool:

```markdown
Use the Skill tool with:
- skill: "rp1-dev:worktree-workflow"
- Parameters as required by the skill
```

The skill content is loaded and the agent follows its instructions.

---

## Best Practices

### Structure

- Keep SKILL.md under 500 lines
- Use supporting files for details (WORKFLOWS.md, EXAMPLES.md)
- Include clear phase boundaries
- Define verification steps explicitly

### Content

- Write concisely (assume Claude is intelligent)
- Include trigger terms in description
- Provide decision trees for complex logic
- Document error recovery procedures

### Naming

- Use kebab-case: `worktree-workflow`, `mermaid-validation`
- Be specific: `pdf-extraction` not `pdf-helper`
- Use gerund form when applicable: `processing-pdfs`

---

## Related Concepts

- [Command-Agent Pattern](command-agent-pattern.md) - How commands delegate to agents
- [Constitutional Prompting](constitutional-prompting.md) - How agents are structured

## Learn More

- [maestro skill](../../plugins/base/skills/maestro/SKILL.md) - Skill for creating skills
- [maestro patterns](../../plugins/base/skills/maestro/PATTERNS.md) - Common skill patterns
