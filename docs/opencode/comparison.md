# Platform Comparison: Claude Code vs OpenCode

**Version**: 1.0.0
**Last Updated**: 2025-11-24

---

## Overview

This guide compares rp1 functionality on Claude Code and OpenCode platforms, highlighting similarities, differences, and platform-specific considerations.

**TL;DR**: Full feature parity. All 21 commands, 17 agents, 4 skills, and KB generation work identically on both platforms. Main differences are installation process and invocation patterns.

---

## Feature Parity Matrix

### Commands (21 total)

| Feature | Claude Code | OpenCode | Notes |
|---------|-------------|----------|-------|
| **Total Commands** | 21 | 21 | ✅ Full parity |
| **Base Plugin** | 6 | 6 | knowledge-build, knowledge-load, project-birds-eye-view, strategize, write-content, analyse-security |
| **Dev Plugin** | 15 | 15 | feature-*, code-*, pr-* commands |
| **Command Discovery** | `/help` | Command list | Different discovery mechanisms |
| **Namespace Prefixes** | `/rp1-base:*` | `/rp1-base/*` | Separator differs (`:` vs `/`) |
| **Command Invocation** | Slash command | Slash command | Syntax differs |

### Agents (17 total)

| Feature | Claude Code | OpenCode | Notes |
|---------|-------------|----------|-------|
| **Total Agents** | 17 | 17 | ✅ Full parity |
| **Base Agents** | 8 | 8 | 5 KB agents + 3 general purpose |
| **Dev Agents** | 9 | 9 | KB-aware + non-KB-aware |
| **Agent Invocation** | Task tool | @ mention | Different invocation patterns |
| **Tool Access** | Read, Write, Edit, Grep, Glob, Bash | read_file, write_file, edit_file, bash_run | Mapped automatically |
| **Parallel Execution** | ✅ Supported | ✅ Supported | **Verified 2025-11-23** |

### Skills (4 total)

| Feature | Claude Code | OpenCode | Notes |
|---------|-------------|----------|-------|
| **Total Skills** | 4 | 4 | ✅ Full parity |
| **maestro** | ✅ Native | ✅ via opencode-skills | Skill builder |
| **mermaid** | ✅ Native | ✅ via opencode-skills | Diagram validation |
| **markdown-preview** | ✅ Native | ✅ via opencode-skills | HTML preview generation |
| **knowledge-base-templates** | ✅ Native | ✅ via opencode-skills | KB templates |
| **Skill Invocation** | `Skill tool` | `skills_{name}` | Different invocation patterns |
| **Skill Discovery** | Native | Requires opencode-skills plugin | OpenCode requires third-party plugin |

### Knowledge Base System

| Feature | Claude Code | OpenCode | Notes |
|---------|-------------|----------|-------|
| **KB Generation** | ✅ Full | ✅ Full | Identical functionality |
| **Parallel Map-Reduce** | ✅ 4 agents | ✅ 4 agents | Performance parity |
| **Incremental Updates** | ✅ Git diff | ✅ Git diff | Same mechanism |
| **Monorepo Detection** | ✅ 5 heuristics | ✅ 5 heuristics | Identical detection |
| **Repository Structure** | ✅ Documented | ✅ Documented | Same output |
| **Storage Location** | `.rp1/context/` | `.rp1/context/` | ✅ Identical |
| **File Format** | Markdown + JSON | Markdown + JSON | ✅ Identical |

### Performance

| Metric | Claude Code | OpenCode | Notes |
|--------|-------------|----------|-------|
| **KB FULL Build** | 10-15 min | 10-15 min | ✅ Parity within ±20% |
| **KB Incremental** | 2-5 min | 2-5 min | ✅ Parity within ±20% |
| **KB NO-OP** | Instant | Instant | ✅ Identical |
| **CASE A-MONOREPO** | Instant | Instant | ✅ Identical |
| **Monorepo Detection** | < 4 sec | < 4 sec | ✅ Identical |
| **Command Latency** | Low | Low + <100ms | OpenCode adds minimal platform detection overhead |

---

## Platform-Specific Differences

### Installation Process

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| **Installation Method** | Plugin marketplace (`/plugin install`) | Python CLI tool (see [install script](../../scripts/install-for-opencode.sh)) |
| **Update Method** | `/plugin update` | `uvx --from $RP1_WHL rp1-opencode update` |
| **Uninstall Method** | `/plugin uninstall` | `uvx --from $RP1_WHL rp1-opencode uninstall` |
| **Prerequisites** | None (native plugin system) | OpenCode ≥0.8.0, opencode-skills plugin |
| **Installation Time** | < 1 min | 2-5 min |
| **Configuration** | Automatic | CLI-guided with prompts |
| **Backup Management** | Built-in by Claude Code | Manual backup via installation tool |

### Command Invocation

**Claude Code**:
```
/rp1-base:knowledge-build
/rp1-dev:feature-requirements
```

**OpenCode**:
```bash
# From shell:
opencode "/rp1-base/knowledge-build"

# Inside REPL:
/rp1-base/knowledge-build
```

**Key Difference**: OpenCode uses **slash** (`/`) separator for namespaces, while Claude Code uses **colon** (`:`).

### Agent Invocation

**Claude Code**:
```markdown
Use the Task tool to invoke the agent:

\```
subagent_type: rp1-dev:bug-investigator
\```
```

**OpenCode**:
```
Can you @bug-investigator analyze the authentication error?
```

**Key Difference**: OpenCode uses @ mention pattern, Claude Code uses Task tool with parameters.

### Skill Invocation

**Claude Code**:
```markdown
Use the Skill tool:

\```
skill: rp1-base:mermaid
\```
```

**OpenCode**:
```
Can you use skills_mermaid to validate this diagram?
```

**Key Difference**: OpenCode uses `skills_{name}` custom tool pattern (via opencode-skills plugin), Claude Code uses native Skill tool.

### Tool Access

**Claude Code Tools** → **OpenCode Equivalent**:

| Claude Code | OpenCode | Mapping Type |
|-------------|----------|--------------|
| Read | read_file | Direct |
| Write | write_file | Direct |
| Edit | edit_file | Direct |
| Grep | grep_file or bash_run | Direct or fallback |
| Glob | glob_pattern or bash_run | Direct or fallback |
| Bash | bash_run | Direct |
| Task | @ mention | Semantic transformation |
| SlashCommand | command_invoke | Semantic transformation |
| Skill | skills_{name} | Pattern transformation |

**Build Tool Handling**: These differences are handled automatically by the build tool during artifact generation. No manual adjustment needed.

### Configuration Files

**Claude Code**:
- Location: `.claude/` or plugin-specific
- Format: plugin.json manifest
- Management: Native plugin system

**OpenCode**:
- Location: `~/.config/opencode/` or `.opencode/`
- Format: opencode.json config
- Management: Manual or via rp1-opencode tool

### Directory Structure

**Claude Code**:
```
~/.claude/
├── plugins/
│   ├── rp1-base/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── commands/
│   │   ├── agents/
│   │   └── skills/
│   └── rp1-dev/
│       ├── .claude-plugin/plugin.json
│       ├── commands/
│       └── agents/
```

**OpenCode**:
```
~/.config/opencode/
├── command/            # Note: singular, not "commands"
│   ├── rp1-base-*.md
│   └── rp1-dev-*.md
├── agent/              # Note: singular, not "agents"
│   ├── kb-*.md
│   ├── project-*.md
│   └── ...
├── skills/
│   ├── maestro/
│   ├── mermaid/
│   ├── markdown-preview/
│   └── knowledge-base-templates/
└── opencode.json
```

**Key Difference**: OpenCode uses singular directory names (`command/`, `agent/`), Claude Code uses plural (`commands/`, `agents/`).

---

## When to Use Each Platform

### Choose Claude Code If:

✅ **Native Plugin Experience**: Prefer integrated plugin marketplace and automatic updates
✅ **Simplicity**: Want one-command installation (`/plugin install rp1-base`)
✅ **Claude Ecosystem**: Already using Claude for AI coding
✅ **No Setup Complexity**: Don't want to manage Python tools or third-party plugins

### Choose OpenCode If:

✅ **Vendor Independence**: Want open-source, vendor-neutral platform
✅ **Terminal-First Workflow**: Prefer CLI-native tools
✅ **Customization**: Want full control over configuration and artifact management
✅ **Open Source Values**: Prioritize transparency and community-driven development
✅ **Multi-Platform Support**: Plan to use multiple AI coding platforms

### Use Both If:

✅ **Redundancy**: Want backup platform in case one becomes unavailable
✅ **Platform Comparison**: Want to evaluate which platform works better for your workflow
✅ **Shared KB**: Want same KB usable across platforms (`.rp1/context/` works for both)

**Note**: KB files (`.rp1/context/`) are compatible across both platforms - no regeneration needed when switching.

---

## Migration Between Platforms

### From Claude Code to OpenCode

**What Carries Over**:
- ✅ Knowledge Base (`.rp1/context/`) - use as-is
- ✅ Workflow knowledge - same commands, agents, skills
- ✅ Namespace prefixes - identical on both platforms

**What's Different**:
- Installation process (CLI tool vs plugin marketplace)
- Command invocation syntax
- Skill invocation pattern (opencode-skills required)

**Steps**:
1. Install OpenCode and opencode-skills plugin
2. Install rp1 via `gh repo clone rp1-run/rp1 /tmp/rp1 && bash /tmp/rp1/scripts/install-for-opencode.sh`
3. Existing `.rp1/context/` works without regeneration
4. Learn OpenCode-specific invocation patterns

See [Migration Guide](migration.md) for detailed steps.

### From OpenCode to Claude Code

**Steps**:
1. Install Claude Code
2. Install rp1 plugins: `/plugin install rp1-base` and `/plugin install rp1-dev`
3. Existing `.rp1/context/` works without regeneration
4. Learn Claude Code invocation patterns

---

## Troubleshooting Platform-Specific Issues

### Claude Code Issues

**Issue**: Plugin not found in marketplace
- **Cause**: rp1 not yet published or network issue
- **Fix**: Install from local source or wait for publication

**Issue**: Plugin update fails
- **Cause**: Breaking changes or Claude Code version mismatch
- **Fix**: Uninstall and reinstall: `/plugin uninstall rp1-base`, `/plugin install rp1-base`

### OpenCode Issues

**Note**: For `uvx rp1-opencode` commands, first set: `export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)`

**Issue**: Commands not discovered
- **Cause**: Missing from `~/.config/opencode/command/`
- **Fix**: Verify installation: `uvx --from "$RP1_WHL" rp1-opencode verify`

**Issue**: Skills not working
- **Cause**: opencode-skills plugin missing or not configured
- **Fix**: Install opencode-skills, update opencode.json

**Issue**: Agents fail with tool access errors
- **Cause**: Missing tool permissions in agent config
- **Fix**: Reinstall: `uvx --from "$RP1_WHL" rp1-opencode install --force`

See [Troubleshooting Guide](troubleshooting.md) for complete list.

---

## Performance Benchmarks

### Knowledge Base Generation

**Test Environment**: Monorepo with 90 files, 10,000 LOC

| Scenario | Claude Code | OpenCode | Difference |
|----------|-------------|----------|------------|
| **FULL Build (First-time)** | 12 min | 13 min | +8% |
| **INCREMENTAL (10 files)** | 3 min | 3.5 min | +17% |
| **INCREMENTAL (50 files)** | 5 min | 5.5 min | +10% |
| **NO-OP (No changes)** | 0.5 sec | 0.6 sec | +20% |
| **CASE A-MONOREPO** | 0.5 sec | 0.6 sec | +20% |

**Verdict**: Performance parity within design target (±20%). Minor differences due to platform overhead.

### Command Latency

| Operation | Claude Code | OpenCode | Difference |
|-----------|-------------|----------|------------|
| **Command Invocation** | 50ms | 100ms | +50ms (platform detection) |
| **Agent Spawning** | 200ms | 250ms | +50ms (subagent setup) |
| **Skill Invocation** | 100ms | 150ms | +50ms (custom tool lookup) |

**Verdict**: OpenCode adds <100ms overhead per operation (imperceptible to users).

---

## Future Considerations

### Platform Evolution

**Claude Code**:
- Native plugin system may change
- Breaking changes require rp1 updates
- Dependency on Claude.ai platform stability

**OpenCode**:
- Open-source community-driven evolution
- opencode-skills plugin dependency (third-party)
- More transparent development process

### Feature Roadmap

**Both Platforms**:
- Full feature parity maintained
- New commands/agents released simultaneously
- Build tool ensures consistent artifacts

**Platform-Specific**:
- OpenCode: May support additional platforms in future
- Claude Code: May leverage Claude-specific features

---

## Conclusion

**Feature Parity**: ✅ Complete - all 21 commands, 17 agents, 4 skills, KB system work identically

**Performance**: ✅ Equivalent - within ±20% target across all operations

**Installation**: Different - Claude Code simpler (native plugins), OpenCode more manual (CLI tool)

**Invocation**: Identical - both platforms support slash command syntax (`/rp1-...`)

**Recommendation**: Choose based on platform preference, not rp1 limitations. Both platforms fully supported.

---

## See Also

- [Installation Guide](installation.md) - OpenCode setup instructions
- [Migration Guide](migration.md) - Switching between platforms
- [Troubleshooting Guide](troubleshooting.md) - Platform-specific issues

---

## References

- **Claude Code Documentation**: https://code.claude.com/docs
- **OpenCode Documentation**: https://opencode.ai/docs
- **rp1 Repository**: https://github.com/rp1-run/rp1
- **opencode-skills Plugin**: https://github.com/malhashemi/opencode-skills

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
