# OpenCode Troubleshooting Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-24

---

## Overview

This guide provides solutions to common issues when using rp1 on OpenCode platform. Each issue includes symptoms, root cause, diagnostic commands, and resolution steps.

**Installation**:

```bash
# One-liner installation (no authentication required)
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

**Setup for rp1-opencode commands**:

Since rp1-opencode is distributed via GitHub releases (not PyPI), you need to specify the wheel URL for subsequent commands:

```bash
# Set the wheel URL for all rp1-opencode commands in this session
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)
```

All `uvx rp1-opencode` commands below assume `$RP1_WHL` is set. Use: `uvx --from "$RP1_WHL" rp1-opencode <command>`

**Quick Diagnostic**:
```bash
# Run comprehensive verification
uvx --from "$RP1_WHL" rp1-opencode verify --verbose

# Check OpenCode version
opencode --version

# Check installed rp1 version
uvx --from "$RP1_WHL" rp1-opencode version
```

---

## Installation Issues

### Issue 1: "OpenCode CLI not found in PATH"

**Symptoms**:
```
✗ OpenCode CLI not found
ERROR: rp1-opencode requires OpenCode ≥0.8.0
Installation instructions: https://opencode.ai/docs/installation
```

**Root Cause**: OpenCode is not installed or not in system PATH.

**Diagnostic**:
```bash
# Check if opencode command exists
which opencode

# Check PATH
echo $PATH
```

**Resolution**:

1. **Install OpenCode** (if not installed):
   - Visit https://opencode.ai/docs/installation
   - Follow platform-specific installation instructions
   - Verify: `opencode --version`

2. **Add OpenCode to PATH** (if installed but not in PATH):
   ```bash
   # Find OpenCode installation
   find / -name "opencode" 2>/dev/null

   # Add to PATH (example for ~/.bashrc)
   echo 'export PATH="/path/to/opencode/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

3. **Retry installation**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install
   ```

---

### Issue 2: "OpenCode version too old"

**Symptoms**:
```
OpenCode version 0.7.5 is too old.
Minimum required: 0.8.0
Tested versions: 0.9.x
```

**Root Cause**: OpenCode version does not meet minimum requirement (≥0.8.0).

**Diagnostic**:
```bash
opencode --version
```

**Resolution**:

1. **Update OpenCode** to latest version:
   - Check release notes: https://opencode.ai/releases
   - Follow update instructions for your platform
   - Verify: `opencode --version` (should show ≥0.8.0)

2. **Retry installation**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install
   ```

---

### Issue 3: "opencode-skills plugin not found"

**Symptoms**:
```
⚠ opencode-skills plugin not detected
Skills will not be available without this plugin.

Installation instructions:
  git clone https://github.com/malhashemi/opencode-skills.git ~/.opencode-skills
  (Follow plugin setup instructions)

Continue installation without skills? [y/N]:
```

**Root Cause**: Third-party opencode-skills plugin is not installed or not configured.

**Impact**: Skills (maestro, mermaid, markdown-preview, knowledge-base-templates) will not work. Commands and agents still functional.

**Diagnostic**:
```bash
# Check if opencode-skills is installed
ls ~/.opencode-skills

# Check OpenCode config for skills
cat ~/.config/opencode/opencode.json | grep -i "skills"
```

**Resolution**:

1. **Install opencode-skills plugin**:
   ```bash
   git clone https://github.com/malhashemi/opencode-skills.git ~/.opencode-skills
   cd ~/.opencode-skills
   # Follow plugin's README for setup
   ```

2. **Verify installation**:
   ```bash
   cat ~/.config/opencode/opencode.json | grep -A 5 "custom_tools"
   ```

   Should show skills configuration:
   ```json
   "custom_tools": [
     {
       "name": "skills_maestro",
       ...
     }
   ]
   ```

3. **Reinstall rp1 to register skills**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

### Issue 4: "Permission denied" writing to ~/.config/opencode/

**Symptoms**:
```
✗ Permission denied: ~/.config/opencode/command/
ERROR: Cannot write to installation directory
```

**Root Cause**: Insufficient file system permissions for target directory.

**Diagnostic**:
```bash
# Check directory permissions
ls -la ~/.config/opencode/

# Check if directory exists
test -d ~/.config/opencode/ && echo "Exists" || echo "Does not exist"
```

**Resolution**:

1. **Fix permissions** (if directory exists):
   ```bash
   chmod -R u+w ~/.config/opencode/
   ```

2. **Create directory** (if doesn't exist):
   ```bash
   mkdir -p ~/.config/opencode/{command,agent,skills}
   ```

3. **Retry installation**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install
   ```

---

### Issue 5: Installation hangs or times out

**Symptoms**:
- Installation process appears stuck
- No progress for > 5 minutes
- Terminal unresponsive

**Root Cause**: Network issues, large artifact download, or process deadlock.

**Diagnostic**:
```bash
# Check network connectivity
ping github.com

# Check disk space
df -h ~/.config/opencode/

# Check running processes
ps aux | grep rp1-opencode
```

**Resolution**:

1. **Cancel installation**: Press `Ctrl+C`

2. **Check network**: Ensure stable internet connection

3. **Retry with verbose output**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --verbose
   ```

4. **If still failing, clean install**:
   ```bash
   # Remove partial installation
   rm -rf ~/.config/opencode/command/rp1-*
   rm -rf ~/.config/opencode/agent/{kb-*,project-*,strategic-*,security-*,bug-*,code-*,comment-*,feature-*,pr-*,test-*}
   rm -rf ~/.config/opencode/skills/{maestro,mermaid,markdown-preview,knowledge-base-templates}

   # Retry
   uvx --from "$RP1_WHL" rp1-opencode install
   ```

---

## Command Discovery Issues

### Issue 6: Commands not appearing in OpenCode

**Symptoms**:
- `/rp1-base:knowledge-build` not recognized
- "Unknown command" error
- Command list doesn't show rp1 commands

**Root Cause**: Command files not in correct location or incorrect file format.

**Diagnostic**:
```bash
# Check if command files exist
ls ~/.config/opencode/command/ | grep rp1

# Count rp1 commands (should be 21)
ls ~/.config/opencode/command/rp1-* | wc -l

# Check file permissions
ls -la ~/.config/opencode/command/rp1-*

# Check file content (frontmatter)
head -20 ~/.config/opencode/command/rp1-base-knowledge-build.md
```

**Resolution**:

1. **Verify installation completed**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode verify
   ```

2. **Check OpenCode configuration**:
   ```bash
   cat ~/.config/opencode/opencode.json
   ```

3. **Restart OpenCode CLI**:
   ```bash
   # Exit and restart OpenCode session
   ```

4. **Reinstall if files missing**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

5. **Check command file format** (should have YAML frontmatter):
   ```yaml
   ---
   template: |
     Command content here
   description: Command description
   ---
   ```

---

### Issue 7: Namespace prefix not recognized

**Symptoms**:
```
Error: Command '/rp1-base:knowledge-build' not found
Did you mean: 'knowledge-build'?
```

**Root Cause**: Command file name doesn't match expected format or namespace handling issue.

**Diagnostic**:
```bash
# Check command file naming
ls ~/.config/opencode/command/ | grep knowledge-build

# Expected: rp1-base-knowledge-build.md
```

**Resolution**:

1. **Verify file naming convention**:
   - Format: `rp1-{plugin}-{command-name}.md`
   - Example: `rp1-base-knowledge-build.md`

2. **Check for typos in namespace prefix**:
   - Correct: `/rp1-base:knowledge-build`
   - Wrong: `/rp1base:knowledge-build` (missing hyphen)
   - Wrong: `/rp-base:knowledge-build` (missing '1')

3. **Reinstall to fix naming**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

## Agent Invocation Issues

### Issue 8: "Agent not found" when using @ mention

**Symptoms**:
```
@kb-spatial-analyzer not recognized
Unknown agent: kb-spatial-analyzer
```

**Root Cause**: Agent config file missing or incorrect location.

**Diagnostic**:
```bash
# Check if agent file exists
ls ~/.config/opencode/agent/ | grep kb-spatial-analyzer

# Count rp1 agents (should be 17)
ls ~/.config/opencode/agent/{kb-*,project-*,strategic-*,security-*,bug-*,code-*,comment-*,feature-*,pr-*,test-*}.md 2>/dev/null | wc -l

# Check file permissions
ls -la ~/.config/opencode/agent/kb-spatial-analyzer.md
```

**Resolution**:

1. **Verify agent files installed**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode verify
   ```

2. **Check agent file format** (should have YAML frontmatter):
   ```bash
   head -20 ~/.config/opencode/agent/kb-spatial-analyzer.md
   ```

   Should show:
   ```yaml
   ---
   description: Agent description
   mode: subagent
   tools:
     bash: true
     write: true
   ---
   ```

3. **Reinstall agents**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

### Issue 9: "Tool access denied" for agents

**Symptoms**:
```
Agent error: Tool 'read_file' not permitted
Agent error: Bash execution not allowed
Permission denied: write_file
```

**Root Cause**: Agent config missing tool permissions in frontmatter.

**Diagnostic**:
```bash
# Check agent config
cat ~/.config/opencode/agent/kb-spatial-analyzer.md | head -15
```

Should include tools section:
```yaml
---
tools:
  bash: true
  write: true
  edit: true
---
```

**Resolution**:

1. **Verify agent frontmatter has tools field**

2. **Reinstall to fix permissions**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

3. **Check OpenCode agent configuration** (if custom):
   - Ensure agent mode is `subagent`
   - Ensure all required tools are enabled

---

### Issue 10: Agents fail with "Subagent invocation failed"

**Symptoms**:
```
Error invoking subagent @kb-spatial-analyzer
Subagent execution failed
```

**Root Cause**: Agent prompt syntax error, missing dependencies, or OpenCode subagent configuration issue.

**Diagnostic**:
```bash
# Check agent file syntax
head -50 ~/.config/opencode/agent/kb-spatial-analyzer.md

# Check OpenCode logs (if available)
# (Location varies by OpenCode version)
```

**Resolution**:

1. **Verify agent file is valid markdown**:
   ```bash
   # Use markdown linter if available
   markdownlint ~/.config/opencode/agent/kb-spatial-analyzer.md
   ```

2. **Check for missing dependencies**:
   - For KB agents: Ensure git is installed
   - For code agents: Ensure project tools available (npm, cargo, etc.)

3. **Test agent isolation**:
   ```
   # Try simpler agent first
   @project-documenter generate overview
   ```

4. **Reinstall agents**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

## Skills Issues

### Issue 11: "Tool 'skills_mermaid' not found"

**Symptoms**:
```
Error: Unknown tool 'skills_mermaid'
Custom tool not registered
Skills are not available
```

**Root Cause**: opencode-skills plugin not installed or skills not registered in opencode.json.

**Diagnostic**:
```bash
# Check if skills exist
ls ~/.config/opencode/skills/

# Should show: maestro/ mermaid/ markdown-preview/ knowledge-base-templates/

# Check OpenCode config
cat ~/.config/opencode/opencode.json | grep -A 10 "custom_tools"
```

Should show:
```json
"custom_tools": [
  {
    "name": "skills_maestro",
    "path": "~/.config/opencode/skills/maestro/SKILL.md"
  },
  {
    "name": "skills_mermaid",
    "path": "~/.config/opencode/skills/mermaid/SKILL.md"
  },
  ...
]
```

**Resolution**:

1. **Install opencode-skills plugin** (if missing):
   ```bash
   git clone https://github.com/malhashemi/opencode-skills.git ~/.opencode-skills
   cd ~/.opencode-skills
   # Follow setup instructions
   ```

2. **Verify skill files exist**:
   ```bash
   ls ~/.config/opencode/skills/mermaid/SKILL.md
   ```

3. **Update opencode.json** (manual or reinstall):
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

4. **Restart OpenCode** to reload custom tools

---

### Issue 12: Skills invoked but fail to execute

**Symptoms**:
```
skills_mermaid invoked successfully
Error processing skill output
Skill execution failed
```

**Root Cause**: Skill SKILL.md syntax error or missing supporting files.

**Diagnostic**:
```bash
# Check skill file structure
ls -la ~/.config/opencode/skills/mermaid/

# Should show:
# SKILL.md
# reference.md (or other supporting files)

# Check SKILL.md frontmatter
head -20 ~/.config/opencode/skills/mermaid/SKILL.md
```

Should show:
```yaml
---
name: mermaid
description: Mermaid diagram validation and generation
---
```

**Resolution**:

1. **Verify SKILL.md format** matches Anthropic Skills v1.0 spec

2. **Check description length** (must be ≥20 characters):
   ```bash
   grep "description:" ~/.config/opencode/skills/mermaid/SKILL.md
   ```

3. **Reinstall skills**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

## Knowledge Base Generation Issues

### Issue 13: "Git not found" during KB generation

**Symptoms**:
```
Error running git command
Git repository not detected
KB generation failed: git command not found
```

**Root Cause**: Git is not installed or not in PATH.

**Diagnostic**:
```bash
# Check if git installed
which git

# Check git version
git --version
```

**Resolution**:

1. **Install Git**:
   - macOS: `brew install git`
   - Ubuntu/Debian: `sudo apt install git`
   - Windows: Download from https://git-scm.com/downloads

2. **Verify git in PATH**:
   ```bash
   echo $PATH | grep git
   ```

3. **Initialize git repo** (if not a git repository):
   ```bash
   cd ~/my-project
   git init
   git add .
   git commit -m "Initial commit"
   ```

4. **Retry KB generation**:
   ```bash
   /rp1-base/knowledge-build
   ```

---

### Issue 14: KB generation slow or hangs

**Symptoms**:
- KB generation takes > 30 minutes
- Process appears stuck
- No progress updates

**Root Cause**: Very large repository, sequential agent execution (not parallel), or file system issue.

**Diagnostic**:
```bash
# Check if agents are running
ps aux | grep opencode

# Check disk space
df -h .rp1/

# Check repository size
du -sh .

# Count files in repository
find . -type f | wc -l
```

**Resolution**:

1. **For first-time build (FULL mode)**: 10-15 minutes is normal for large repos

2. **Check parallelism**:
   - Expected: 4 agents (kb-index-builder, kb-concept-extractor, kb-architecture-mapper, kb-module-analyzer) run simultaneously
   - If sequential: Performance issue with OpenCode subagent execution

3. **Cancel and retry**:
   ```bash
   # Press Ctrl+C to cancel
   # Wait 10 seconds
   /rp1-base:knowledge-build
   ```

4. **Check `.rp1/context/state.json` for partial progress**:
   ```bash
   cat .rp1/context/state.json
   ```

5. **If consistently failing, clear state and rebuild**:
   ```bash
   rm -rf .rp1/context/
   /rp1-base/knowledge-build
   ```

---

### Issue 15: Monorepo detection fails or incorrect

**Symptoms**:
- state.json missing `repo_type` field
- False positive KB rebuilds when changes in other projects
- Repository Structure section missing from index.md

**Root Cause**: Monorepo detection heuristics didn't match repository structure.

**Diagnostic**:
```bash
# Check state.json
cat .rp1/context/state.json | jq '.repo_type, .monorepo_projects'

# Should show for monorepo:
# "monorepo"
# ["project1", "project2"]

# Check for monorepo indicators
ls -la pnpm-workspace.yaml lerna.json nx.json 2>/dev/null
find . -name "plugin.json" -path "*/.claude-plugin/*" | wc -l  # Should be > 1
```

**Resolution**:

1. **Trigger re-detection**:
   ```bash
   rm .rp1/context/state.json
   /rp1-base/knowledge-build
   ```

4. **Test incremental update**:
   ```bash
   # Make a small change
   echo "# Test" >> README.md
   git add README.md
   git commit -m "Test change"

   # Should trigger INCREMENTAL mode
   /rp1-base/knowledge-build
   ```

---

## Update and Rollback Issues

### Issue 17: Update fails with "Version mismatch"

**Symptoms**:
```
Current version: 1.0.0
New version: 1.1.0
Error: Incompatible version upgrade
```

**Root Cause**: Breaking changes between versions or corrupted version metadata.

**Diagnostic**:
```bash
# Check installed version
uvx --from "$RP1_WHL" rp1-opencode version

# Check version file
cat ~/.opencode-rp1/version.json
```

**Resolution**:

1. **Clean uninstall and reinstall**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode uninstall
   uvx --from "$RP1_WHL" rp1-opencode install
   ```

2. **If KB regeneration needed**, backup first:
   ```bash
   cp -r .rp1/context .rp1/context.backup
   ```

---

### Issue 18: Rollback fails or backup not found

**Symptoms**:
```
Error: No backups found
Backup directory does not exist: ~/.opencode-rp1-backups/
```

**Root Cause**: Backups were deleted or never created.

**Diagnostic**:
```bash
# List backups
ls -la ~/.opencode-rp1-backups/

# Check backup timestamps
uvx --from "$RP1_WHL" rp1-opencode list-backups
```

**Resolution**:

1. **If no backups exist, reinstall**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

2. **In future, preserve backups**:
   - Backups in `~/.opencode-rp1-backups/` are user-managed
   - Don't delete without checking

---

## Verification Issues

### Issue 19: "Verification failed" with no specific errors

**Symptoms**:
```
✗ Verification failed
Some checks did not pass
```

**Root Cause**: Silent validation failures or missing verbose output.

**Diagnostic**:
```bash
# Run verbose verification
uvx --from "$RP1_WHL" rp1-opencode verify --verbose

# Check specific categories
uvx --from "$RP1_WHL" rp1-opencode verify --commands
uvx --from "$RP1_WHL" rp1-opencode verify --agents
uvx --from "$RP1_WHL" rp1-opencode verify --skills
```

**Resolution**:

1. **Read verbose output** for specific failures

2. **Common fixes**:
   - Commands: Reinstall commands
   - Agents: Check tool permissions
   - Skills: Install opencode-skills plugin

3. **Full reinstall if multiple failures**:
   ```bash
   uvx --from "$RP1_WHL" rp1-opencode install --force
   ```

---

## Performance Issues

### Issue 20: OpenCode commands slower than Claude Code

**Symptoms**:
- Commands take 5+ seconds to execute
- Agent invocations lag
- Skills timeout

**Root Cause**: Platform overhead, network latency, or system resource constraints.

**Diagnostic**:
```bash
# Check system resources
top | grep opencode

# Check disk I/O
iostat 1 5

# Check network latency (if remote OpenCode)
ping opencode-server
```

**Resolution**:

1. **Expected performance**: OpenCode adds <100ms overhead vs Claude Code (design target)

2. **If significantly slower**:
   - Check system resources (CPU, memory, disk)
   - Close other heavy applications
   - Check network if using remote OpenCode

3. **Optimize OpenCode config** (if applicable):
   - Review opencode.json for unnecessary plugins
   - Disable unused features

---

## Getting Help

### Collect Diagnostic Information

Before reporting issues, collect this information:

```bash
# System info
uname -a

# OpenCode version
opencode --version

# rp1 version
uvx --from "$RP1_WHL" rp1-opencode version

# Installation status
uvx --from "$RP1_WHL" rp1-opencode verify --verbose > rp1-verification.txt

# OpenCode config
cat ~/.config/opencode/opencode.json > opencode-config.json

# KB state (if applicable)
cat .rp1/context/state.json > kb-state.json

# Recent logs (if available)
# (Location varies by OpenCode version)
```

### Report Issues

**GitHub Issues**: https://github.com/rp1-run/rp1/issues

**Include**:
- Detailed problem description
- Symptoms and error messages
- Diagnostic information (see above)
- Steps to reproduce
- Expected vs actual behavior

**Template**:
```markdown
## Problem Description
[Describe the issue]

## Symptoms
[Error messages, unexpected behavior]

## Environment
- OpenCode version: [from opencode --version]
- rp1 version: [from uvx --from "$RP1_WHL" rp1-opencode version]
- OS: [macOS / Linux / Windows]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
...

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Diagnostic Output
[Paste relevant output from diagnostic commands]
```

---

## See Also

- [Installation Guide](installation.md) - Setup instructions
- [Platform Comparison](comparison.md) - Feature parity details
- [Migration Guide](migration.md) - Switching platforms

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
