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
├── cli/                      # Unified TypeScript CLI (rp1 command)
│   ├── src/
│   │   ├── main.ts           # CLI entry point
│   │   ├── commands/         # CLI command implementations
│   │   ├── build/            # OpenCode artifact builder
│   │   └── install/          # OpenCode installer
│   ├── shared/               # Shared utilities (logger, errors, fp)
│   └── web-ui/               # Web-based documentation viewer
│       ├── src/
│       │   ├── app/          # React app components
│       │   ├── components/   # Reusable UI components
│       │   └── server/       # Bun HTTP/WebSocket server
│       └── dist/             # Built frontend assets
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

## rp1 CLI

The unified TypeScript CLI (`cli/`) provides tooling for building, installing, and viewing rp1 artifacts. It runs on both Node.js (>=20) and Bun.

### Prerequisites

- **Runtime**: Node.js >= 20.0.0 or Bun
- **Package Manager**: bun (recommended) or npm

### Installation

```bash
# From repository root
cd cli
bun install
bun run build
```

### CLI Commands

#### `rp1 view` - Documentation Viewer

Launch a web-based documentation viewer for browsing `.rp1/` artifacts.

```bash
rp1 view                        # View current project
rp1 view /path/to/project       # View specific project
rp1 view --port 8080            # Use custom port (default: 7710)
rp1 view --no-open              # Don't auto-open browser
```

Features:
- Markdown rendering with syntax highlighting (Shiki)
- Mermaid diagram support
- File tree navigation
- Live reloading via WebSocket
- Light/dark theme toggle

#### `rp1 build:opencode` - Build OpenCode Artifacts

Transform Claude Code plugins into OpenCode-compatible format.

```bash
rp1 build:opencode                      # Build all plugins to cli/dist/opencode/
rp1 build:opencode --plugin dev         # Build specific plugin (base, dev, all)
rp1 build:opencode -o ./output          # Custom output directory
rp1 build:opencode --json               # JSON output for CI/CD
```

Output structure:
```
dist/opencode/
├── rp1-base/
│   ├── commands/
│   ├── agents/
│   └── skills/
├── rp1-dev/
│   ├── commands/
│   └── agents/
└── manifest.json
```

#### `rp1 install:opencode` - Install to OpenCode

Install rp1 plugins to the OpenCode platform.

```bash
rp1 install:opencode                    # Install from default artifacts
rp1 install:opencode --dry-run          # Preview installation
rp1 install:opencode -a ./my-artifacts  # Install from custom path
rp1 install:opencode --skip-skills      # Skip skills installation
rp1 install:opencode -y                 # Skip confirmation prompts
```

#### `rp1 verify:opencode` - Verify Installation

Check that rp1 is correctly installed in OpenCode.

```bash
rp1 verify:opencode                     # Verify installation health
rp1 verify:opencode --artifacts-dir .   # Verify against specific artifacts
```

#### `rp1 list` - List Installed Commands

List all installed rp1 commands.

```bash
rp1 list
```

### Global Options

```bash
rp1 --version, -V      # Show version number
rp1 --verbose, -v      # Enable debug logging
rp1 --trace            # Enable trace logging
rp1 --help, -h         # Show help message
```

### Development Workflow

```bash
# Run CLI in development mode
cd cli
bun run dev view /path/to/project

# Type checking
bun run typecheck

# Build for distribution
bun run build
bun run build:web-ui
bun run build:all
```

### Web UI Development

The web viewer is a React application with a Bun server backend.

```bash
cd cli/web-ui

# Development mode (hot reload)
bun run dev

# Build production assets
bun run build
```

Architecture:
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Bun HTTP server with WebSocket support
- **Features**: File tree, markdown viewer, Mermaid diagrams, live reload

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
     - Builds and attaches OpenCode tarball artifacts
     - Updates version files (`plugin.json`, `package.json`, README badges)

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

   # Verify - should see 21 commands (6 base + 15 dev)
   /help | grep rp1
   ```

**For OpenCode:**

1. Build artifacts using the rp1 CLI:
   ```bash
   cd cli
   bun run dev build:opencode
   ```

2. Install from built artifacts:
   ```bash
   bun run dev install:opencode
   ```

3. Verify installation:
   ```bash
   bun run dev verify:opencode
   bun run dev list
   ```

4. Or install from GitHub release:
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh  # Install uv first (if needed)
   curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
   ```

**General Testing Steps:**

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

- **Commands** (21 total): Lightweight entry points that users invoke
  - Base: 6 commands
  - Dev: 15 commands
- **Agents** (18 total): Specialized sub-agents with deep execution logic
  - Base: 9 agents
  - Dev: 9 agents
- **Skills** (4 total): Reusable capabilities in base plugin
  - maestro, mermaid, markdown-preview, knowledge-base-templates

Commands delegate to agents via Claude Code's Task tool, ensuring only relevant context is loaded.

### CLI Architecture

The `cli/` directory contains a unified TypeScript CLI built with:

- **Commander.js**: CLI argument parsing and command structure
- **fp-ts**: Functional programming utilities for error handling
- **Bun/Node.js**: Runtime-agnostic execution
- **React + Vite**: Web UI frontend
- **TailwindCSS**: Styling

Key modules:
- `cli/src/build/`: Claude Code → OpenCode artifact transformation
- `cli/src/install/`: OpenCode installation management
- `cli/web-ui/`: Documentation viewer with live reload

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
   - OpenCode artifact tarball build and attachment
   - npm package publish with OIDC provenance
   - Version file updates (handled by release-please extra-files)

### CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `release-please.yml` | Push to main | Version management, releases, npm publish |
| `npm-publish.yml` | Called by release-please | Reusable npm publish with OIDC provenance |
| `lighthouse.yml` | Push/PR to main (docs changes) | Documentation quality checks via Cloudflare Pages |

### Manual npm Publish

If npm publish fails during a release (network issue, npm outage, OIDC token problem), you can manually trigger it:

1. Go to **GitHub repo → Actions → "Release Please"**
2. Click **"Run workflow"** dropdown
3. Check **"Manually trigger npm publish for current version"**
4. Click **"Run workflow"**

This builds and publishes whatever version is currently in `cli/package.json` to npm. Use this for:
- Recovering from failed npm publishes
- Re-publishing after a yanked version
- Testing the publish workflow without creating a new release

### Version Files Managed

- `plugins/base/.claude-plugin/plugin.json` - version field
- `plugins/dev/.claude-plugin/plugin.json` - version field
- `cli/package.json` - version field
- `README.md` - version badges
- `.release-please-manifest.json` - canonical version source

## Getting Help

- **Issues**: <https://github.com/rp1-run/rp1/issues>
- **Contributing Guidelines**: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- **Design Docs**: `.rp1/work/features/plugin-split-base-dev/design.md` (v2.0.0 architecture)
