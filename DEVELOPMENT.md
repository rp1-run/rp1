# Development Guide

## Project Structure

```
rp1/
├── plugins/
│   ├── base/                 # rp1-base plugin (foundation)
│   │   ├── .claude-plugin/   # Plugin metadata (plugin.json)
│   │   ├── agents/           # Specialized agents
│   │   ├── commands/         # Slash commands
│   │   └── skills/           # Reusable skills (shared with dev)
│   └── dev/                  # rp1-dev plugin (development)
│       ├── .claude-plugin/   # Plugin metadata (depends on base)
│       ├── agents/           # Specialized agents
│       └── commands/         # Slash commands
├── tools/
│   ├── build/                # OpenCode artifact builder
│   └── install/              # OpenCode installer
├── scripts/                  # Utility scripts
├── .github/workflows/        # CI/CD automation (release-please)
├── release-please-config.json
├── .release-please-manifest.json
└── .rp1/context/            # Generated knowledge base
```

## Two-Plugin Architecture (v2.0.0+)

The project is split into two plugins:

**rp1-base** (Foundation):
- 6 commands: Knowledge, docs, strategy, security, content writing
- 4 agents: knowledge-builder, project-documenter, strategic-advisor, security-validator
- 3 skills: maestro, mermaid, knowledge-base-templates (shared)
- No dependencies

**rp1-dev** (Development):
- 13 commands: Feature workflows (4), code quality (5), PR management (4)
- 7 agents: bug-investigator, test-runner, code-auditor, comment-cleaner, pr-reviewer, pr-feedback-collector, pr-visualizer
- Depends on: `rp1-base >= 2.0.0`

## Release Process

The project uses **release-please** for fully automated releases based on conventional commits.

### How Releases Work

1. **Commit your changes** using conventional commit format (see below)
2. **Push/merge to main** branch
3. **release-please automatically**:
   - Analyzes commits since the last release
   - Creates/updates a Release PR with changelog
   - When the Release PR is merged:
     - Creates a GitHub Release with version tag
     - Builds and attaches OpenCode wheel artifacts
     - Updates version files (`plugin.json`, `pyproject.toml`, README badges)

No manual tagging or release scripts required - just write good commit messages!

### Commit Convention

Use conventional commit format:

```bash
feat: add new strategic analysis framework
fix: correct KB loading for monorepos
feat!: breaking API change

# Optional scope
feat(agents): add knowledge-aware execution
fix(commands): resolve argument parsing
```

**Version Bumps**:
- `feat:` → Minor version bump (1.3.0 → 1.4.0)
- `fix:` → Patch version bump (1.3.0 → 1.3.1)
- `feat!:` or `BREAKING CHANGE:` → Major version bump (1.3.0 → 2.0.0)

## Contributing

### Development Workflow

1. **Use conventional commit format** for all commits (with plugin scope if applicable)
2. **Test changes locally** by installing both plugins in Claude Code:

   ```bash
   /plugin marketplace add ~/Development/rp1
   /plugin install rp1-base@rp1-local
   /plugin install rp1-dev@rp1-local
   ```

3. **Ensure agents follow constitutional prompt structure**:
   - Frontmatter with name, description, tools, model
   - Parameters section with defaults
   - Structured workflow with pseudocode
   - Anti-loop directives
4. **Use proper namespace prefixes**:
   - Commands: `/rp1-base:command` or `/rp1-dev:command`
   - Skills: `rp1-base:skill-name` (all skills in base)
   - Agent subagent_type: `rp1-base:agent-name` or `rp1-dev:agent-name`
5. **Update relevant documentation** when adding features
6. **Push to main** - release-please handles the rest automatically

### Command-Agent Architecture

The project uses a two-tier architecture:

**Commands** (thin wrappers, < 50 lines):

```markdown
---
name: command-name
version: 2.0.0
description: Brief description
tags: [category]
---

# Command Title

Use the Task tool to invoke the agent:

\```
subagent_type: rp1-{plugin}:agent-name
\```

The agent will:
- [Capabilities list]
```

**Agents** (full constitutional prompts, 300-2000 lines):

```markdown
---
name: agent-name
description: Detailed description
tools: Read, Write, Grep, Glob, Bash, Skill
model: inherit
---

# Agent Title - Subtitle

Role persona and critical instructions

## 0. Parameters
[Parameter definitions with defaults]

## 1-N. Workflow Sections
[Detailed execution logic, algorithms, pseudocode]

## Final. Anti-Loop Directives
[Execution discipline and constraints]
```

### Knowledge-Aware Agents

7 agents automatically load the codebase knowledge base before execution:

**Base (3)**:
- `project-documenter`
- `strategic-advisor`
- `security-validator`

**Dev (4)**:
- `bug-investigator`
- `code-auditor`
- `pr-reviewer`
- `pr-visualizer`

These agents run `/rp1-base:knowledge-load` as their first step to receive comprehensive architectural context.

### Testing Changes

**For Claude Code:**

1. Clean previous dev installations and install fresh versions:

   ```bash
   # Clean previous installations
   ./scripts/clean-dev-plugins.sh

   # Install both plugins
   /plugin marketplace add ~/Development/rp1
   /plugin install rp1-base@rp1-local
   /plugin install rp1-dev@rp1-local

   # Verify - should see 19 commands (6 base + 13 dev)
   /help | grep rp1
   ```

**For OpenCode:**

1. Build artifacts:
   ```bash
   ./scripts/build.sh
   ```

2. Install from local source:
   ```bash
   cd tools/install
   uvx --from . rp1-opencode install --force
   ```

3. **General Testing Steps:**

   1. Test the specific command/agent you modified
   2. Verify constitutional prompt structure is maintained
   3. Check namespace prefixes are correct
   4. For KB-aware agents, verify they load KB correctly via `/rp1-base:knowledge-load`
   5. Ensure no regression in existing functionality
   6. Test cross-plugin dependencies (dev calling base commands)

### Documentation Updates

When adding or modifying features:

- Update `README.md` if adding new user-facing commands or changing project overview
- Update `base/README.md` when changing base plugin functionality (commands, agents, skills)
- Update `dev/README.md` when changing dev plugin functionality
- Update `DEVELOPMENT.md` for development-related changes
- Update command/agent frontmatter metadata (version, description)
- Run `/rp1-base:knowledge-build` to regenerate KB if architecture changes
- Update `CLAUDE.md` if navigation or critical rules change

## Architecture

### Command-Agent Pattern

**Pattern**: Command Pattern + Strategy Pattern

- **Commands** (19 total): Lightweight entry points that users invoke
  - Base: 6 commands
  - Dev: 13 commands
- **Agents** (11 total): Specialized sub-agents with deep execution logic
  - Base: 4 agents
  - Dev: 7 agents
- **Skills** (3 total): Reusable capabilities in base plugin
  - maestro, mermaid, knowledge-base-templates

Commands delegate to agents via Claude Code's Task tool, ensuring only relevant context is loaded.

### Cross-Plugin Dependencies

**Dev depends on Base**:
- Dev agents can invoke base commands: `/rp1-base:command-name`
- Dev agents can use base skills: `rp1-base:skill-name`
- Dev plugin declares dependency in `plugin.json`: `{"rp1-base": ">=2.0.0"}`

**Base is independent**:
- Base has no dependencies
- Base agents cannot call dev commands

### Knowledge Integration

Agents can load codebase context for architecture-aware analysis:

- Documentation stored in `.rp1/context/`
- Generated by `/rp1-base:knowledge-build` command
- Includes architecture diagrams, concept maps, module documentation
- Automatically loaded by 7 knowledge-aware agents

For detailed architecture documentation, generate it by running:

```bash
/rp1-base:knowledge-build
```

Then view `.rp1/context/architecture.md`.

## Automated Release Workflow

Both plugins are released together via **release-please**.

### How It Works

1. Push conventional commits to main
2. release-please creates/updates a Release PR with:
   - Auto-generated changelog
   - Version bump based on commit types
3. Merge the Release PR to trigger:
   - GitHub Release creation
   - OpenCode wheel build and attachment
   - Version file updates (handled by release-please extra-files)

### Version Files Managed

- `plugins/base/.claude-plugin/plugin.json` - version field
- `plugins/dev/.claude-plugin/plugin.json` - version field
- `tools/install/pyproject.toml` - version field
- `README.md` - version badges
- `.release-please-manifest.json` - canonical version source

## Getting Help

- **Issues**: <https://github.com/rp1-run/rp1/issues>
- **Contributing Guidelines**: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- **Design Docs**: `.rp1/work/features/plugin-split-base-dev/design.md` (v2.0.0 architecture)
