# Troubleshooting

Common issues, solutions, and debugging strategies for rp1.

---

## Quick Reference

| Issue | Common Cause | Quick Fix |
|-------|--------------|-----------|
| Agent not following patterns | Stale or incomplete KB | Run `/knowledge-build` |
| Agent hallucinating paths | Missing codebase context | Verify KB has `modules.md` |
| Agent stuck in loop | Anti-loop directive missing | Check agent spec for exit conditions |
| KB generation fails | Large codebase or timeout | Use incremental build |
| KB content stale | Code changed after build | Rebuild KB |
| Commands not found | Plugins not installed | Run `rp1 init` |
| Slow operations | Large context window | Break into smaller operations |

---

## Agent Behavior Issues

### Agent Not Following Patterns

??? question "Agent ignores codebase patterns and conventions"

    **Symptoms:**

    - Generated code doesn't match your codebase style
    - Agent uses different naming conventions
    - Error handling patterns inconsistent with existing code

    **Causes:**

    1. Knowledge base is stale or incomplete
    2. `patterns.md` missing or poorly populated
    3. Agent not loading KB context

    **Solutions:**

    1. **Rebuild the knowledge base:**

        ```bash
        # In your AI tool
        /knowledge-build
        ```

    2. **Verify patterns.md exists and has content:**

        ```bash
        cat .rp1/context/patterns.md
        ```

        If empty or minimal, the KB build may have failed or your codebase lacks clear patterns.

    3. **Check agent loaded KB context:**

        Look for "Loading KB files" in the agent output. If missing, the agent may not be KB-aware.

    4. **Manually provide patterns:**

        If patterns.md is sparse, add explicit patterns to your CLAUDE.md or AGENTS.md instruction file.

??? question "Agent uses wrong framework or library versions"

    **Symptoms:**

    - Agent suggests deprecated APIs
    - Code incompatible with your installed versions
    - Import statements don't match your setup

    **Solutions:**

    1. **Ensure KB includes dependency information:**

        The `architecture.md` file should document your tech stack. If it doesn't:

        ```bash
        # Rebuild KB to capture dependencies
        /knowledge-build
        ```

    2. **Check your package.json/requirements.txt is in scope:**

        KB generation analyzes package files. Ensure they're not gitignored or excluded.

    3. **Add explicit version constraints to CLAUDE.md:**

        ```markdown
        ## Tech Stack
        - React 18.x (not 17)
        - TypeScript 5.x strict mode
        - Node.js 20 LTS
        ```

### Agent Hallucinating File Paths

??? question "Agent references files that don't exist"

    **Symptoms:**

    - Agent suggests editing `/src/utils/helpers.ts` but file doesn't exist
    - Import paths point to nonexistent modules
    - References to directories that were renamed or moved

    **Causes:**

    1. Stale KB from before refactoring
    2. Agent inferring paths from patterns rather than actual structure
    3. Missing `modules.md` in KB

    **Solutions:**

    1. **Verify KB is current:**

        ```bash
        # Check KB generation date
        head -20 .rp1/context/index.md
        ```

        If the date is old, rebuild:

        ```bash
        /knowledge-build
        ```

    2. **Check modules.md exists:**

        ```bash
        cat .rp1/context/modules.md | head -50
        ```

        This file maps your codebase structure. If missing, KB generation failed.

    3. **Provide explicit file references:**

        When giving tasks, include actual file paths:

        ```
        Update the auth middleware in src/middleware/auth.ts
        ```

??? question "Agent creates files in wrong directories"

    **Symptoms:**

    - New files created at project root instead of proper location
    - Test files not in test directory
    - Components created outside component folder

    **Solutions:**

    1. **Verify patterns.md documents directory structure:**

        ```bash
        grep -A 10 "Directory" .rp1/context/patterns.md
        ```

    2. **Be explicit in task descriptions:**

        Instead of: "Create a new user service"

        Use: "Create a new user service at `src/services/user.service.ts` following the existing service pattern in `src/services/auth.service.ts`"

    3. **Add directory conventions to CLAUDE.md:**

        ```markdown
        ## Directory Structure
        - Components: src/components/
        - Services: src/services/
        - Tests: src/__tests__/
        ```

### Agent Stuck in Loops

??? question "Agent keeps repeating the same actions"

    **Symptoms:**

    - Agent tries the same fix multiple times
    - Conversation becomes circular
    - No progress despite multiple attempts

    **Causes:**

    1. Agent spec missing anti-loop directive
    2. Blocking issue without clear resolution path
    3. Conflicting instructions

    **Solutions:**

    1. **Start a new conversation:**

        Sometimes the cleanest fix is to start fresh with a clearer task description.

    2. **Break the task into smaller steps:**

        Instead of: "Fix all the tests"

        Use:
        ```
        1. First, list which tests are failing
        2. Then fix the auth.test.ts failures
        3. Then fix the user.test.ts failures
        ```

    3. **Provide explicit exit conditions:**

        ```
        Stop after fixing the TypeScript errors. Do not proceed to refactoring.
        ```

    4. **Check for conflicting instructions:**

        Review CLAUDE.md/AGENTS.md for contradictory guidance that might confuse the agent.

??? question "Agent makes changes then reverts them"

    **Symptoms:**

    - Agent edits a file, then edits it back
    - Same error keeps reappearing
    - Oscillating between two states

    **Solutions:**

    1. **Identify the root cause:**

        The agent may be fixing symptoms rather than the underlying issue. Ask:

        ```
        Before making any changes, analyze why this error occurs and identify the root cause.
        ```

    2. **Provide clearer success criteria:**

        ```
        The fix is complete when:
        1. All tests pass
        2. No TypeScript errors
        3. The feature works as described
        ```

    3. **Checkpoint progress:**

        After each meaningful change, commit:

        ```
        Commit these changes before continuing.
        ```

---

## Knowledge Base Issues

### KB Generation Fails

??? question "knowledge-build command fails or times out"

    **Symptoms:**

    - Command exits with error
    - Build hangs for extended period
    - Partial KB files generated

    **Causes:**

    1. Very large codebase exceeding context limits
    2. Network timeout during API calls
    3. Malformed files in codebase
    4. Insufficient permissions

    **Solutions:**

    1. **Check for very large files:**

        ```bash
        find . -type f -name "*.ts" -o -name "*.js" | xargs wc -l | sort -n | tail -20
        ```

        Files over 5000 lines may cause issues. Consider excluding them.

    2. **Use incremental builds:**

        If available, run incremental KB updates instead of full rebuilds.

    3. **Check for binary files in source:**

        Large binary files accidentally committed can cause issues:

        ```bash
        find . -type f -size +1M -not -path "./.git/*"
        ```

    4. **Verify API connectivity:**

        Ensure your AI tool has network access and valid API keys.

    5. **Review error output:**

        Look for specific error messages in the command output for targeted fixes.

??? question "KB files are empty or minimal"

    **Symptoms:**

    - Generated files have only headers
    - `patterns.md` contains no patterns
    - `modules.md` is missing components

    **Causes:**

    1. Codebase too small to extract patterns
    2. Non-standard file structure
    3. Build interrupted before completion

    **Solutions:**

    1. **Verify codebase has sufficient code:**

        KB generation works best with established codebases. Very small projects may generate sparse KBs.

    2. **Check build completed:**

        Look for completion message:

        ```
        KB generation complete
        ```

        If not present, rebuild.

    3. **Manually seed KB content:**

        For small projects, add content directly to KB files to bootstrap agent understanding.

### KB Content Stale

??? question "KB doesn't reflect recent code changes"

    **Symptoms:**

    - Agent references old API signatures
    - Deleted files still mentioned
    - New modules unknown to agent

    **Solutions:**

    1. **Rebuild the KB:**

        ```bash
        /knowledge-build
        ```

    2. **Set up automatic KB rebuilds:**

        Add KB rebuild to your CI/CD on merge to main:

        ```yaml
        # In GitHub Actions
        - name: Rebuild KB
          run: /knowledge-build
          if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        ```

    3. **Check KB generation date:**

        ```bash
        head -10 .rp1/context/index.md
        ```

        Compare with your most recent significant code changes.

??? question "KB missing concepts or terminology"

    **Symptoms:**

    - Domain-specific terms not understood
    - Business logic patterns not captured
    - Agent asks basic questions about your domain

    **Solutions:**

    1. **Add concepts to CLAUDE.md:**

        Create a terminology section:

        ```markdown
        ## Domain Concepts
        - **Tenant**: A customer organization in our multi-tenant system
        - **Workspace**: A logical grouping of projects within a tenant
        - **Pipeline**: A sequence of automated actions
        ```

    2. **Rebuild KB with more context:**

        Ensure documentation files (README, docs/) are included in KB generation scope.

    3. **Add a glossary file:**

        Create `GLOSSARY.md` at project root with domain definitions. KB generation will incorporate it.

---

## Performance Issues

### Slow KB Generation

??? question "KB build takes too long (>30 minutes)"

    **Symptoms:**

    - Build runs for extended periods
    - Progress appears stuck
    - Timeouts in CI environments

    **Causes:**

    1. Very large codebase (>100k lines)
    2. Many small files requiring individual analysis
    3. Network latency to AI provider

    **Solutions:**

    1. **Use incremental builds when available:**

        Incremental builds only analyze changed files.

    2. **Exclude non-essential directories:**

        In CLAUDE.md, specify exclusions:

        ```markdown
        ## KB Exclusions
        - vendor/
        - node_modules/
        - dist/
        - coverage/
        - *.generated.ts
        ```

    3. **Schedule KB builds:**

        Run full builds during off-hours rather than on-demand:

        ```yaml
        # Scheduled nightly rebuild
        on:
          schedule:
            - cron: '0 2 * * *'
        ```

    4. **Consider splitting monorepos:**

        For very large monorepos, consider per-package KB generation.

### Slow Command Execution

??? question "Commands take too long to complete"

    **Symptoms:**

    - Simple operations take minutes
    - Responses feel sluggish
    - Timeouts during complex operations

    **Solutions:**

    1. **Break large tasks into smaller units:**

        Instead of: "Review all 50 files in this PR"

        Use: "Review the auth changes in this PR" (then separate reviews for other areas)

    2. **Use targeted commands:**

        Instead of broad commands, use specific ones:

        - `/code-check` for quick hygiene checks
        - `/pr-review` for full PR analysis

    3. **Check your network connection:**

        AI operations require stable network. High latency or packet loss impacts performance.

    4. **Consider time of day:**

        AI provider capacity varies. If consistently slow, try off-peak hours.

### High Memory Usage

??? question "AI tool using excessive memory"

    **Symptoms:**

    - System slowdown during operations
    - Out of memory errors
    - Application crashes

    **Solutions:**

    1. **Close unused conversations:**

        Long conversations accumulate context. Start fresh for new tasks.

    2. **Reduce KB size:**

        Exclude large generated files and vendored code from KB.

    3. **Process files sequentially:**

        Instead of batch operations, process files one at a time:

        ```
        Review file1.ts first, then I'll ask about file2.ts
        ```

---

## Platform-Specific Issues

### Claude Code

??? question "Plugins not appearing in Claude Code"

    **Symptoms:**

    - `/rp1-*` commands not available
    - Plugin installation reported success but commands missing
    - "Unknown command" errors

    **Solutions:**

    1. **Restart Claude Code:**

        Plugins load at startup. Restart required after installation.

    2. **Verify plugin installation:**

        ```bash
        ls ~/.claude/plugins/ | grep rp1
        ```

        Should show `rp1-base` and `rp1-dev`.

    3. **Check plugin directory permissions:**

        ```bash
        ls -la ~/.claude/plugins/
        ```

        Ensure read permissions on plugin directories.

    4. **Reinstall plugins:**

        ```bash
        rp1 install:claudecode
        ```

??? question "Claude Code crashes during rp1 operations"

    **Symptoms:**

    - Application closes unexpectedly
    - Operations interrupted mid-task
    - "Connection lost" messages

    **Solutions:**

    1. **Update Claude Code:**

        Ensure you're on the latest version.

    2. **Check system resources:**

        Close other memory-intensive applications.

    3. **Simplify the task:**

        Complex operations may exceed limits. Break into smaller steps.

    4. **Report the issue:**

        If reproducible, report to rp1 GitHub issues with steps to reproduce.

??? question "Commands work differently in Claude Code vs terminal"

    **Symptoms:**

    - Same command produces different results
    - Features work in one context but not another

    **Solutions:**

    1. **Verify same plugin versions:**

        ```bash
        cat ~/.claude/plugins/rp1-base/.claude-plugin
        cat ~/.claude/plugins/rp1-dev/.claude-plugin
        ```

    2. **Check working directory:**

        Ensure you're in the same project directory in both contexts.

    3. **Compare instruction files:**

        Terminal commands don't use CLAUDE.md context. Ensure necessary instructions are in the command/agent prompts.

### OpenCode

??? question "rp1 commands not working in OpenCode"

    **Symptoms:**

    - Commands not recognized
    - Different syntax required
    - Missing functionality

    **Solutions:**

    1. **Use correct command syntax:**

        OpenCode uses namespaced commands:

        ```
        @rp1-dev/build
        ```

        vs Claude Code:

        ```
        /rp1-dev:build
        ```

    2. **Verify plugin installation:**

        OpenCode requires manual plugin setup. Check OpenCode documentation for prompt configuration.

    3. **Check AGENTS.md exists:**

        OpenCode reads `AGENTS.md` instead of `CLAUDE.md`:

        ```bash
        cat AGENTS.md | head -50
        ```

??? question "OpenCode prompts behave differently than Claude Code"

    **Symptoms:**

    - Same workflow produces different results
    - Missing features in OpenCode
    - Unexpected agent behavior

    **Causes:**

    OpenCode and Claude Code have different capabilities and constraints. Some rp1 features may behave differently.

    **Solutions:**

    1. **Check platform-specific documentation:**

        Some commands have platform-specific notes in their reference pages.

    2. **Use core commands:**

        Stick to well-tested commands like:

        - `/knowledge-build`
        - `/build` (orchestrates feature workflow)
        - `/build-fast` (quick tasks)

    3. **Report discrepancies:**

        File issues for significant behavioral differences between platforms.

---

## Getting Help

### Self-Service Resources

| Resource | Best For |
|----------|----------|
| [Documentation](https://rp1.run) | Command reference, guides, concepts |
| [GitHub Issues](https://github.com/rp1-run/rp1/issues) | Bug reports, feature requests |
| [GitHub Discussions](https://github.com/rp1-run/rp1/discussions) | Questions, community help |

### Reporting Issues

When reporting issues, include:

1. **Environment:**
    - rp1 version: `rp1 --version`
    - AI tool: Claude Code / OpenCode + version
    - OS: macOS / Linux / Windows

2. **Steps to reproduce:**
    - Exact commands run
    - Project context (language, framework)
    - Expected vs actual behavior

3. **Relevant files:**
    - KB files if KB-related
    - Error messages
    - Screenshots if visual issue

**Example issue template:**

```markdown
## Environment
- rp1 version: 0.2.7
- Claude Code version: 2.0.75
- OS: macOS 14.1

## Problem
Agent not following TypeScript patterns from KB.

## Steps to Reproduce
1. Run `/knowledge-build`
2. Run `/build-fast "Add a new service"`
3. Generated code uses `any` instead of proper types

## Expected
Generated code should use typed interfaces per patterns.md

## Actual
Generated code uses `any` type throughout

## KB Content
```
[paste relevant patterns.md section]
```

---

## Related

- [Installation](../getting-started/installation.md) - Setup and installation guide
- [CI/CD Integration](../guides/ci-cd-integration.md) - Automated workflow setup
- [Knowledge-Aware Agents](../concepts/knowledge-aware-agents.md) - How agents use KB
- [init Reference](../reference/cli/init.md) - Initialization troubleshooting
