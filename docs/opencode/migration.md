# Migration Guide: Claude Code ↔ OpenCode

**Version**: 1.0.0
**Last Updated**: 2025-11-24

---

## Overview

This guide helps you migrate between Claude Code and OpenCode platforms while using rp1. Since rp1 provides full feature parity on both platforms, migration is straightforward.

**Key Insight**: Knowledge Base (`.rp1/context/`) is compatible across both platforms - no regeneration needed when switching!

---

## Why Migrate?

### Reasons to Use OpenCode

✅ **Vendor Independence**: Open-source, vendor-neutral platform
✅ **Terminal-First Workflow**: CLI-native design for power users
✅ **Transparency**: Open development, community-driven
✅ **Customization**: Full control over configuration and artifacts
✅ **Platform Resilience**: Reduces dependency on single platform

### Reasons to Use Claude Code

✅ **Simplicity**: Native plugin marketplace, one-command installation
✅ **Integration**: Tight integration with Claude ecosystem
✅ **Automatic Updates**: Plugin system handles updates automatically
✅ **User Experience**: Polished UI, streamlined workflows

### Why Use Both?

✅ **Redundancy**: Backup if one platform unavailable
✅ **Comparison**: Evaluate which works better for your workflow
✅ **Shared KB**: Same knowledge base works on both platforms
✅ **Platform Evolution**: Hedge against platform-specific changes

---

## Migration Scenarios

### Scenario 1: Claude Code → OpenCode (Full Migration)

**Who This Is For**:
- Users wanting vendor independence
- Users preferring terminal-native tools
- Users requiring open-source platforms

**Time Required**: 15-30 minutes

**Steps**:

#### 1. Prerequisites Check

**Verify Claude Code setup**:
```bash
# Check if rp1 is installed on Claude Code
/plugin list | grep rp1

# Should show:
# rp1-base   (installed)
# rp1-dev    (installed)
```

**Verify KB exists** (if using KB-aware features):
```bash
# Check for existing KB
ls -la .rp1/context/

# Should show:
# index.md
# concept_map.md
# architecture.md
# modules.md
# state.json
```

#### 2. Install OpenCode

**Install OpenCode CLI**:
- Visit https://opencode.ai/docs/installation
- Follow platform-specific instructions
- Verify: `opencode --version` (≥0.8.0 required, 0.9.x recommended)

**Install opencode-skills plugin** (for skills support):
```bash
git clone https://github.com/malhashemi/opencode-skills.git ~/.opencode-skills
cd ~/.opencode-skills
# Follow plugin's setup instructions
```

#### 3. Install rp1 on OpenCode

**Install via curl** (no authentication required):
```bash
# One-liner installation
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

**Verify installation**:
```bash
# Set wheel URL and verify
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)
uvx --from "$RP1_WHL" rp1-opencode verify

# Should show:
# ✓ All 21 commands present
# ✓ All 17 agents present
# ✓ All 4 skills present (if opencode-skills installed)
```

#### 4. Verify KB Compatibility

**Check existing KB**:
```bash
# Navigate to your project
cd ~/my-project

# Verify KB exists
ls -la .rp1/context/

# Verify state.json has commit hash
cat .rp1/context/state.json | jq '.git_commit'
```

**Test KB loading on OpenCode**:
```bash
# This should work without regeneration!
opencode "/rp1-base/knowledge-load"
```

**Expected**: KB loads successfully without errors.

**If issues**: Regenerate KB on OpenCode (same data, fresh format):
```bash
# Backup existing KB
cp -r .rp1/context .rp1/context.claude-backup

# Regenerate on OpenCode
opencode "/rp1-base/knowledge-build"
```

#### 5. Learn OpenCode Command Patterns

**Command invocation**:

| Claude Code | OpenCode |
|-------------|----------|
| `/rp1-base:knowledge-build` | `opencode "/rp1-base/knowledge-build"` |
| `/rp1-dev:feature-requirements` | `opencode "/rp1-dev/feature-requirements"` |

**Agent invocation**:

| Claude Code | OpenCode |
|-------------|----------|
| Task tool with `subagent_type: rp1-dev:bug-investigator` | `@rp1-dev/bug-investigator analyze error` |

**Skill invocation**:

| Claude Code | OpenCode |
|-------------|----------|
| Skill tool with `skill: rp1-base:mermaid` | `skills_mermaid validate diagram` |

#### 6. Test Common Workflows

**Test KB generation**:
```bash
# Make a small change
echo "# Test" >> README.md
git add README.md
git commit -m "Test change"

# Should trigger INCREMENTAL mode (2-5 min)
opencode "/rp1-base/knowledge-build"
```

**Test feature development**:
```bash
# Start feature workflow
opencode "/rp1-dev/feature-requirements"
```

**Test PR review**:
```bash
# Review PR
opencode "/rp1-dev/pr-review 123"
```

#### 7. Migration Complete!

**What's now available on OpenCode**:
- ✅ All 21 rp1 commands
- ✅ All 17 agents
- ✅ All 4 skills (via opencode-skills)
- ✅ Existing KB (compatible, no regeneration needed)
- ✅ Full KB generation system (FULL, INCREMENTAL, NO-OP)
- ✅ Monorepo detection and support

**Optional: Keep Claude Code**:
- Your Claude Code installation remains functional
- You can use both platforms with same projects
- Same KB works on both platforms

---

### Scenario 2: OpenCode → Claude Code (Full Migration)

**Who This Is For**:
- Users wanting simpler installation process
- Users preferring integrated plugin experience
- Users in Claude ecosystem

**Time Required**: 10-15 minutes

**Steps**:

#### 1. Prerequisites Check

**Verify OpenCode setup**:
```bash
# First set the wheel URL for rp1-opencode commands
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)

# Check installed rp1 version
uvx --from "$RP1_WHL" rp1-opencode version

# Verify installation
uvx --from "$RP1_WHL" rp1-opencode verify
```

**Verify KB exists** (if using KB-aware features):
```bash
ls -la .rp1/context/
```

#### 2. Install Claude Code

**Install Claude Code**:
- Visit https://code.claude.com
- Sign up or log in
- Download and install Claude Code for your platform

#### 3. Install rp1 Plugins

**From plugin marketplace**:
```bash
# Open Claude Code

# Install base plugin
/plugin install rp1-base

# Install dev plugin
/plugin install rp1-dev

# Verify
/plugin list | grep rp1
```

**From local source** (development):
```bash
# Clone repository
git clone https://github.com/rp1-run/rp1.git
cd rp1

# Add to marketplace
/plugin marketplace add .

# Install
/plugin install rp1-base@rp1-local
/plugin install rp1-dev@rp1-local
```

#### 4. Verify KB Compatibility

**Check existing KB**:
```bash
cd ~/my-project
ls -la .rp1/context/
```

**Test KB loading on Claude Code**:
```
/rp1-base:knowledge-load
```

**Expected**: KB loads successfully without errors.

#### 5. Learn Claude Code Command Patterns

**Command invocation**:

| OpenCode | Claude Code |
|----------|-------------|
| `opencode "/rp1-base/knowledge-build"` | `/rp1-base:knowledge-build` |
| `opencode "/rp1-dev/feature-requirements"` | `/rp1-dev:feature-requirements"` |

**Agent invocation**:

| OpenCode | Claude Code |
|----------|-------------|
| `@rp1-dev/bug-investigator analyze error` | Task tool with `subagent_type: rp1-dev:bug-investigator` |

**Skill invocation**:

| OpenCode | Claude Code |
|----------|-------------|
| `skills_mermaid validate diagram` | Skill tool with `skill: rp1-base:mermaid` |

#### 6. Test Common Workflows

**Test KB generation**:
```
/rp1-base:knowledge-build
```

**Test feature development**:
```
/rp1-dev:feature-requirements
```

#### 7. Migration Complete!

**What's now available on Claude Code**:
- ✅ All 21 rp1 commands
- ✅ All 17 agents
- ✅ All 4 skills (native support)
- ✅ Existing KB (compatible)
- ✅ Automatic plugin updates

**Optional: Keep OpenCode**:
- Your OpenCode installation remains functional
- Use both platforms as needed

---

### Scenario 3: Dual-Platform Setup (Best of Both Worlds)

**Who This Is For**:
- Users wanting redundancy
- Users comparing platforms
- Users hedging against platform changes

**Time Required**: 30-45 minutes

**Benefits**:
- ✅ Platform redundancy if one unavailable
- ✅ Compare workflows on both platforms
- ✅ Single KB shared across platforms
- ✅ Flexibility to switch anytime

**Setup**:

#### 1. Install Both Platforms

Follow instructions from Scenario 1 and Scenario 2 to install both:
- Claude Code with rp1 plugins
- OpenCode with rp1 artifacts

#### 2. Shared Knowledge Base

**Key Insight**: `.rp1/context/` is compatible across platforms!

**Setup**:
```bash
# Generate KB once (on either platform)
# Option A: On Claude Code
/rp1-base:knowledge-build

# Option B: On OpenCode
opencode "/rp1-base/knowledge-build"

# Result: .rp1/context/ works on BOTH platforms!
```

#### 3. Workflow Guidelines

**Use Claude Code for**:
- Quick command execution (native slash commands)
- Integrated plugin updates
- When you want simpler UX

**Use OpenCode for**:
- Terminal-native workflows
- When you want vendor independence
- When you need full customization

**KB Updates**:
- Run KB generation on whichever platform you're using
- KB updates are compatible across platforms
- No regeneration needed when switching

#### 4. Switching Between Platforms

**Same project, different platform**:

```bash
# Monday: Work on Claude Code
cd ~/my-project
# Use Claude Code: /rp1-dev:feature-requirements

# Tuesday: Switch to OpenCode (same project)
cd ~/my-project
# Use OpenCode: opencode "/rp1-dev/feature-build"

# KB is shared - no regeneration needed!
```

---

## What Carries Over (Platform-Agnostic)

### ✅ Knowledge Base

**Location**: `.rp1/context/`

**Files**:
- `index.md` - Project overview
- `concept_map.md` - Domain concepts
- `architecture.md` - System architecture
- `modules.md` - Component breakdown
- `state.json` - Metadata (git commit, monorepo data)

**Compatibility**: 100% compatible across platforms. No regeneration needed.

### ✅ Workflow Knowledge

**Commands**: Same namespace prefixes (`/rp1-base:*`, `/rp1-dev:*`)

**Agents**: Same agent names, capabilities, tool access

**Skills**: Same skill names and functionality

**Feature Parity**: All 21 commands, 17 agents, 4 skills work identically

### ✅ Project Files

**rp1 Work Artifacts**: `.rp1/work/` (feature specs, task lists, etc.)

**Git History**: KB change detection works the same

**Monorepo Detection**: Works identically on both platforms

---

## What's Different (Platform-Specific)

### Installation Process

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| Method | Plugin marketplace | Python CLI tool |
| Time | < 1 min | 2-5 min |
| Complexity | Simple | Moderate |
| Prerequisites | None | OpenCode, opencode-skills |

### Command Invocation Syntax

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| Format | `/rp1-base:command` | `/rp1-base:command` |
| Discovery | `/help` | Command list |

### Agent Invocation Pattern

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| Method | Task tool | @ mention |
| Syntax | `subagent_type: agent-name` | `@agent-name prompt` |

### Skill Invocation Pattern

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| System | Native | opencode-skills plugin |
| Syntax | `skill: rp1-base:mermaid` | `skills_mermaid` |

---

## Common Migration Issues

### Issue: KB doesn't load after migration

**Symptoms**:
```
Error loading KB
KB files not found
```

**Resolution**:
1. Verify `.rp1/context/` exists in project directory
2. Check file permissions:
   ```bash
   ls -la .rp1/context/
   ```
3. If missing, regenerate:
   ```bash
   # On target platform
   /rp1-base:knowledge-build  # Claude Code
   # OR
   /rp1-base:knowledge-build  # OpenCode
   ```

### Issue: Commands not found after migration

**Claude Code**:
```bash
# Verify plugins installed
/plugin list | grep rp1
```

**OpenCode**:
```bash
# Set the wheel URL (if not already set)
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)

# Verify installation
uvx --from "$RP1_WHL" rp1-opencode verify
```

### Issue: Skills don't work on OpenCode

**Cause**: opencode-skills plugin not installed

**Resolution**:
```bash
# Install opencode-skills
git clone https://github.com/malhashemi/opencode-skills.git ~/.opencode-skills

# Reinstall rp1 (set RP1_WHL first if not already set)
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)
uvx --from "$RP1_WHL" rp1-opencode install --force
```

---

## Best Practices

### For Dual-Platform Users

1. **Generate KB once**: Use whichever platform you prefer initially
2. **Update KB regularly**: Run KB generation when making significant changes
3. **Backup .rp1/**: Include in version control or backup strategy
4. **Keep platforms in sync**: Update both when new rp1 versions release

### For Single-Platform Users

1. **Choose based on preference**: Both platforms fully supported
2. **Migration is easy**: Can switch anytime with minimal effort
3. **KB is portable**: Your knowledge base investment is safe

---

## FAQ

### Q: Do I need to regenerate KB when switching platforms?

**A**: No! KB files (`.rp1/context/`) are 100% compatible. Just load existing KB.

### Q: Can I use both platforms on the same project?

**A**: Yes! Both platforms can share the same `.rp1/` directory and KB.

### Q: Will my skills work on both platforms?

**A**: Yes, but OpenCode requires the opencode-skills plugin (third-party).

### Q: Is performance the same on both platforms?

**A**: Yes, within ±20%. OpenCode adds <100ms overhead for platform detection.

### Q: Do I need different commands for each platform?

**A**: No! Same command names (`/rp1-base:knowledge-build`). Only invocation syntax differs.

### Q: Can I keep work artifacts (.rp1/work/) when switching?

**A**: Yes! Feature specs, task lists, etc. are platform-agnostic.

### Q: What if I want to go back to my original platform?

**A**: Just use it! Nothing prevents you from switching back. KB remains compatible.

---

## Next Steps After Migration

1. **Test KB generation**: Verify incremental updates work correctly
2. **Test common workflows**: Feature development, PR review, etc.
3. **Learn platform-specific patterns**: Command invocation, agent invocation
4. **Read platform docs**:
   - [Installation Guide](installation.md)
   - [Platform Comparison](comparison.md)
   - [Troubleshooting](troubleshooting.md)

---

## Support

**Issues**: https://github.com/rp1-run/rp1/issues

**Include when reporting migration issues**:
- Source platform (Claude Code or OpenCode)
- Target platform (Claude Code or OpenCode)
- rp1 version on both platforms
- KB state (exists, missing, corrupted)
- Error messages

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
