# Development Guide

## Prerequisites

- [Bun](https://bun.sh/) v1.1+ (primary runtime and package manager)
- [Just](https://github.com/casey/just) (command runner)
- [Claude Code](https://claude.ai/code), [OpenCode](https://opencode.ai/), [Codex](https://github.com/openai/codex), or [GitHub Copilot CLI](https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line) (for testing plugins)
- Python 3.10+ with `uvx` (for documentation only)

## Quick Start

```bash
# Clone and install dependencies
git clone https://github.com/rp1-run/rp1.git
cd rp1
cd cli && bun install && cd ..

# Build and install locally
just install

# Run tests
just test
```

## Justfile Recipes

All development commands use [Just](https://github.com/casey/just). Run `just` to see available recipes.

### Build

| Recipe | Description |
|--------|-------------|
| `build` | Build everything for local testing |
| `build-opencode` | Transform Claude Code plugins to OpenCode format |
| `build-codex` | Transform Claude Code plugins to Codex format |
| `build-copilot` | Transform Claude Code plugins to Copilot CLI format |
| `build-web-ui` | Bundle the React web-ui with Vite |
| `build-local-dev` | Build binary with `-dev` version suffix |
| `clean-web-ui-cache` | Clear `~/.rp1/web-ui/` cache |

### Test

| Recipe | Description |
|--------|-------------|
| `test` | Run all tests |
| `test-unit` | Run unit tests only (~60 files, fast) |
| `test-integration` | Run integration tests |
| `test-all` | Run all CLI tests |

### Code Quality

| Recipe | Description |
|--------|-------------|
| `check` | Lint and type check everything |
| `check-cli` | Lint (Biome) + typecheck (tsc) + format |
| `check-web-ui` | Type check web-ui only |
| `fix` | Auto-fix lint and format issues |

### Local Installation

| Recipe | Description |
|--------|-------------|
| `install` | Full local install: build + remove stable + install to all platforms |
| `run *args` | Build and run local binary with arguments |
| `install-opencode` | Install to OpenCode |
| `install-codex` | Install to Codex |
| `copilot` | Launch Copilot with local `--plugin-dir` artifacts |
| `rm-stable` | Remove stable rp1 from all platforms |

### Web-UI Development

| Recipe | Description |
|--------|-------------|
| `serve-web-ui` | Run web-ui in dev mode with hot reload |

```bash
just serve-web-ui
# Opens Vite at http://localhost:5173 (proxies to backend at :7710)
```

### Documentation

| Recipe | Description |
|--------|-------------|
| `serve-docs` | Serve MkDocs documentation with live reload |

```bash
just serve-docs
# Opens at http://localhost:8000
```

### Evaluations

| Recipe | Description |
|--------|-------------|
| `eval-setup` | One-time setup: install eval dependencies |
| `eval-run suite` | Run evaluation suite inside Docker (e.g., `just eval-run rp1-dev/build`) |
| `eval-run-local suite` | Container-only eval entrypoint for use from inside `rp1-dev` |
| `eval-attest file` | Generate attestation from eval output |
| `eval-verify` | Verify all attestations are current |
| `eval-status` | Show commands needing re-attestation |
| `eval-view` | Open Promptfoo web viewer |

**Eval workflow:**
```bash
# First time only
just eval-setup

# Supported host entrypoint: run evals in the rp1-dev Docker container
just eval-run rp1-dev/build
just eval-attest output/rp1-dev-build-2026-01-23T10-30-00.json

# Check attestation status
just eval-verify
just eval-status
```

`just eval-run` is the supported public entrypoint. It builds and launches the existing `rp1-dev` Docker image, mounts the repo at `/src/rp1`, forwards the credential allowlist (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`), bind-mounts host Promptfoo state, and runs `just eval-run-local ...` inside the container with `RP1_EVAL_DOCKER=1`. It bounces the host-side Promptfoo viewer before Docker starts so the UI watches the active eval DB during the run, then bounces it again after Docker exits so final results are re-indexed. The default headless path does not publish Arcade on host port `7710`, and it does not mount host `~/.rp1` or other host rp1 config directories into the container.

`just eval-run-local` is the container-only entrypoint. Use it only after you are already inside the dev container, or from other in-container automation, so eval execution does not recursively start Docker again. When `--commit` is requested through the public `just eval-run` entrypoint, the Docker run only produces artifacts and attestation updates; the actual Git commit happens on the host after the container exits. Promptfoo state is written to host `~/.promptfoo` by default so Dockerized eval runs and the host-side Promptfoo viewer share the same history database across disposable worktrees. The Docker launcher bind-mounts that host directory to `/home/rp1user/.promptfoo` and forces `PROMPTFOO_CONFIG_DIR` inside the container. Set `PROMPTFOO_CONFIG_DIR` on the host to override the state directory explicitly.

`just eval-view` remains a host-side promptfoo viewer command. It uses the same Promptfoo config directory (`~/.promptfoo` by default, or `PROMPTFOO_CONFIG_DIR` when set) as the Dockerized eval runner, so Promptfoo Web sees evals produced inside Docker.

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
- 4 skills: mermaid, markdown-preview, artifact-templates, code-comments (shared)
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

#### `rp1 arcade` - Web Dashboard

Launch a web-based dashboard for browsing `.rp1/` artifacts and monitoring agent activity.

```bash
rp1 arcade                        # View current project
rp1 arcade /path/to/project       # View specific project
rp1 arcade --port 8080            # Use custom port (default: 7710)
rp1 arcade --no-open              # Don't auto-open browser
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
bun run dev arcade /path/to/project

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

## Asset Bundling

The rp1 CLI supports bundling all plugin and web-ui assets into a single binary for distribution. This enables self-contained installation without requiring network access to download plugins.

### How It Works

**Development Builds** (`bun run dev` or `bun run build`):

- Uses a placeholder `src/assets/embedded.ts` with `IS_BUNDLED = false`
- Requires `--artifacts-dir` flag for `install:opencode`
- Serves web-ui from local `web-ui/dist/` directory

**Release Builds** (via GoReleaser):

- Generates `src/assets/embedded.ts` with all assets imported via Bun's `with { type: "file" }` syntax
- `install:opencode` extracts plugins from bundled assets
- `arcade` command extracts and caches web-ui at `~/.rp1/web-ui/{version}/`

### Build Scripts

```bash
# Generate asset imports (creates populated embedded.ts)
bun run generate:assets

# Full release build (web-ui + assets)
bun run build:release

# Individual steps
bun run build:web-ui         # Build web-ui frontend
bun run scripts/generate-asset-imports.ts  # Generate embedded.ts
```

### Testing Bundled Assets Locally

To test the bundled asset workflow without doing a full release:

```bash
cd cli

# 1. Build web-ui assets
bun run build:web-ui

# 2. Generate embedded.ts with all imports
bun run generate:assets

# 3. Build the CLI with bundled assets
bun build src/main.ts --compile --outfile dist/rp1-bundled

# 4. Test the bundled binary
./dist/rp1-bundled install:opencode --dry-run
./dist/rp1-bundled arcade

# 5. Restore placeholder for development
git checkout src/assets/embedded.ts
```

### CI/CD Integration

The GoReleaser workflow automatically:

1. Builds web-ui (`bun run build:web-ui`)
2. Generates asset imports (`bun run generate:assets`)
3. Verifies `IS_BUNDLED = true` in embedded.ts
4. Compiles platform binaries with assets bundled

See `.github/workflows/goreleaser.yml` for the full pipeline.

### Asset Structure

When bundled, the following assets are embedded:

```
plugins/
├── base/
│   ├── .claude-plugin/*.json   # Plugin metadata
│   ├── commands/*.md           # Command prompts
│   ├── agents/*.md             # Agent prompts
│   └── skills/*/SKILL.md       # Skill prompts
└── dev/
    ├── .claude-plugin/*.json
    ├── commands/*.md
    └── agents/*.md

cli/web-ui/dist/                # Compiled web-ui frontend
```

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

### Manual Beta Releases

Beta releases are intentionally separate from the `main` + `release-please` stable flow.

Use:

```bash
just beta-release v0.7.0-beta.1
```

The beta recipe now adds release hygiene automatically:

1. Verifies the current branch is clean before doing anything
2. Verifies required release credentials are present (`GITHUB_TOKEN`, `HOMEBREW_TAP_TOKEN`)
3. Fetches remote tags and refuses to reuse an existing beta tag
4. Resets a temporary local branch named `beta-release` to the current branch tip
5. Builds and commits the temporary beta version bump on `beta-release`
6. Prompts for explicit confirmation before pushing the beta tag
7. Switches back to your original branch and deletes `beta-release` on exit

This lets you publish a beta from your current branch without merging to `main`. Stable releases still go through `release-please` on `main`.

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
   - Structured `arguments` and `environment` in frontmatter (not hand-written parameter tables)
   - Structured workflow with pseudocode
   - Anti-loop directives
   - **Artifact output**: Producer agents must use the two-hop template loading pattern from `rp1-base:artifact-templates` -- read the SKILL.md index to find the template row, then read the template file. Do not embed inline output templates. See [AGENTS.md](AGENTS.md#artifact-templates) for variant details.
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

## 0. Parameters (deprecated -- use frontmatter `arguments` instead)
[Structured arguments defined in frontmatter, resolved via `rp1 agent-tools resolve-args`]

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
   just rm-stable

   # Install both plugins
   /plugin marketplace add ~/Development/rp1
   /plugin install rp1-base@rp1-local
   /plugin install rp1-dev@rp1-local

   # Verify - should see 34 commands (15 base + 19 dev)
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

**For Copilot CLI:**

1. Use the fast development loop while iterating on Copilot behavior:

   ```bash
   just copilot
   ```

   This auto-builds stale Copilot artifacts and launches:

   ```bash
   gh copilot -- --plugin-dir dist/copilot/base --plugin-dir dist/copilot/dev
   ```

   This path does not mutate installed-plugin state or register `rp1-local`. Set `PLUGIN_UTILS=1 just copilot` only when you intentionally need the internal-only `rp1-utils` plugin; `rp1-base` and `rp1-dev` remain the required MVP plugins.

2. Use the install-like path before release or when validating the supported user experience:

   ```bash
   just build-copilot
   ./bin/rp1 install copilot --yes --artifacts-dir dist/copilot
   ./bin/rp1 verify copilot
   gh copilot
   ```

   Release readiness requires the native install to succeed and `rp1 verify copilot` to report a healthy native state. Use this path to validate discovery and verification, not just file generation.

   Clean success signals for this path:

   - `gh copilot -- plugin list` shows `rp1-base@rp1-local` and `rp1-dev@rp1-local`
   - `rp1 verify copilot` reports `healthy_native`
   - `mixed_native_and_legacy` means the native install works, but legacy cleanup is still required before sign-off

3. Do not use legacy Copilot success signals such as `~/.config/github-copilot/skills/` or `~/.config/github-copilot/agents/`. The supported install surface is the native marketplace flow above.

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

- **Skills** (39 total): Lightweight entry points that users invoke
  - Base: 15 skills
  - Dev: 19 skills
  - Utils: 5 skills
- **Agents** (49 total): Specialized sub-agents with deep execution logic
  - Base: 12 agents
  - Dev: 33 agents
  - Utils: 4 agents
  - mermaid, markdown-preview, artifact-templates, code-comments

Commands delegate to agents via Claude Code's Task tool, ensuring only relevant context is loaded.

### CLI Architecture

The `cli/` directory contains a unified TypeScript CLI built with:

- **Commander.js**: CLI argument parsing and command structure
- **fp-ts**: Functional programming utilities for error handling
- **Bun/Node.js**: Runtime-agnostic execution
- **React + Vite**: Web UI frontend
- **TailwindCSS**: Styling

Key modules:

- `cli/src/build/`: Multi-platform artifact transformation (OpenCode, Codex, Copilot CLI)
- `cli/src/install/`: Platform installation management (OpenCode, Codex, Copilot CLI)
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

## Simulating Workflow Runs (`rp1 fake`)

A hidden CLI command that emits real events into the rp1 event pipeline without running agents. Useful for testing the Web UI dashboard, step transitions, artifact rendering, and sub-flow expansion.

This command is hidden from `rp1 --help` — it's a developer-only tool.

### Basic Usage

```bash
# Simulate a /build workflow with default timing (~2-5s per step)
rp1 fake "/build 'my test feature'"

# Fast mode — finishes in ~3-6s total
rp1 fake "/build 'test'" --speed fast

# Slow mode — 5-15s per step, good for watching transitions
rp1 fake "/build 'test'" --speed slow
```

### Injecting Failures and Pauses

```bash
# Fail at the build step (run shows as failed, subsequent steps skipped)
rp1 fake "/build 'test'" --fail-at build

# Pause at design (run shows as waiting, subsequent steps skipped)
rp1 fake "/build 'test'" --pause-at design
```

### Rich Simulation

```bash
# Emit BTW progress messages during each step
rp1 fake "/build 'test'" --with-btw

# Create fake artifact files and emit artifact_registered events
rp1 fake "/build 'test'" --with-artifacts

# Emit subflow diagrams and unit-level task events
rp1 fake "/build 'test'" --with-subflows

# Full simulation with everything enabled
rp1 fake "/build 'test'" --with-btw --with-artifacts --with-subflows
```

### Concurrent Runs

```bash
# Launch 5 concurrent simulated runs (staggered start)
rp1 fake "/build 'test'" --count 5 --speed fast

# Stress test with 10 runs
rp1 fake "/build 'test'" --count 10 --speed fast
```

### Custom Feature ID

```bash
# Use a specific feature ID instead of auto-generated
rp1 fake "/build 'test'" --feature my-feature
```

### All Options

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --speed <fast\|normal\|slow>` | `normal` | Delay between steps |
| `-f, --feature <id>` | auto-generated | Feature ID for the run |
| `--fail-at <step>` | — | Inject failure at a step |
| `--pause-at <step>` | — | Inject waiting state at a step |
| `--with-btw` | `false` | Emit BTW progress messages |
| `--with-artifacts` | `false` | Create fake artifact files |
| `--with-subflows` | `false` | Emit subflow and unit events |
| `-n, --count <n>` | `1` | Number of concurrent runs |

### Cleaning Up Fake Data

All fake runs use a `fake-` prefix on their run IDs, making them easy to identify and purge:

```bash
just clean-fake-runs
```

This deletes all `fake-`-prefixed rows from the status database (annotations, artifacts, events, and runs).

## Adding a New Platform

The build pipeline is data-driven via `PlatformDefinition` entries. Adding support for a new AI coding platform (e.g., Cursor) requires creating configuration and templates -- no changes to the generic build loop (`buildPlatformPlugin()`) or asset embedding script (`generate-asset-imports.ts`). The Copilot CLI platform (`cli/src/build/copilot/`) is a real worked example of this process.

### Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `cli/src/build/template-context.ts` | Edit | Add platform ID to `BuildPlatform` union type |
| `cli/src/build/platform-definitions.ts` | Edit | Add `PlatformDefinition` entry to `PLATFORM_DEFINITIONS` map |
| `cli/src/build/<platform>/registry.ts` | Create | Define `PlatformRegistry` with tool name mappings |
| `cli/src/build/templates/<platform>/` | Create | LiquidJS templates for skill, agent, and manifest artifacts |
| `cli/src/config/supported-tools.yaml` | Edit | Add platform metadata (binary name, min version, instruction file) |
| `cli/scripts/build-<platform>.ts` | Create | Thin wrapper calling `executeBuild` with `--platform <name>` |

### Step-by-Step Process

**1. Extend the `BuildPlatform` type** in `cli/src/build/template-context.ts`:

```typescript
export type BuildPlatform = "opencode" | "codex" | "claude-code" | "copilot" | "cursor";
```

**2. Create a platform registry** in `cli/src/build/<platform>/registry.ts`. The registry maps abstract tool names (Read, Write, Bash, etc.) to the platform's concrete tool names:

```typescript
import type { PlatformRegistry } from "../models.js";

export const cursorRegistry: PlatformRegistry = {
  tools: {
    Read: "read_file",
    Write: "write_file",
    // ... map all tools the platform supports
  },
};
```

See `cli/src/build/registry.ts` (OpenCode), `cli/src/build/claude-code/registry.ts`, `cli/src/build/codex/registry.ts`, or `cli/src/build/copilot/registry.ts` for examples.

**3. Create LiquidJS templates** in `cli/src/build/templates/<platform>/`:

- `skill.liquid` -- renders a skill artifact
- `agent.liquid` or `agent-toml.liquid` -- renders an agent artifact
- `manifest.liquid` -- renders the platform manifest (e.g., `manifest.json`)

Templates receive the full build context including plugin metadata, parsed frontmatter, rendered content, and registry. See existing platform templates for the available context variables.

**4. Add a `PlatformDefinition` entry** in `cli/src/build/platform-definitions.ts`:

```typescript
const cursorPlatform: PlatformDefinition = {
  id: "cursor",
  registry: cursorRegistry,
  config: platformConfigs.cursor,
  templates: {
    skill: "cursor/skill",
    agent: "cursor/agent",
    manifest: "cursor/manifest",
  },
  naming: {
    skillDirPrefix: "rp1-",
    agentFileName: (pluginName, agentName) => `rp1-${pluginName}-${agentName}`,
    agentExtension: ".md",
  },
  producesBundleAssets: false,
};
```

Then add it to the `PLATFORM_DEFINITIONS` map:

```typescript
["cursor", cursorPlatform],
```

**5. (Optional) Add lifecycle hooks** if the platform requires custom build behavior. Available hooks:

- `preparePlugin` -- initialize state before building (e.g., discover skill maps)
- `enrichSkillContext` / `enrichAgentContext` -- inject platform-specific template variables
- `postSkillWrite` -- run per-skill post-processing (e.g., generate companion config files)
- `postPluginBuild` -- run per-plugin post-processing (e.g., generate index files, validate output)

**6. Create a build script** at `cli/scripts/build-<platform>.ts`:

```typescript
#!/usr/bin/env bun
import * as E from "fp-ts/lib/Either.js";
import { createLogger, LogLevel } from "../shared/logger.js";
import { executeBuild } from "../src/build/index.js";

const logger = createLogger({
  level: process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
  color: process.stdout.isTTY ?? false,
});

const args = process.argv.slice(2);
const result = await executeBuild(
  [...args, "--platform", "cursor"],
  logger,
)();

if (E.isLeft(result)) {
  process.exit(1);
}
```

**7. Update `parseBuildArgs()`** in `cli/src/build/command.ts` to add the platform to `VALID_PLATFORMS`.

**8. Verify the build**:

```bash
cd cli
bun run scripts/build-<platform>.ts
ls ../dist/<platform>/   # Verify output structure
```

The `--platform all` flag in `bun run build` will automatically include the new platform since `executeBuild` iterates `PLATFORM_DEFINITIONS`.

### PlatformDefinition Interface Reference

```typescript
interface PlatformDefinition {
  id: BuildPlatform;                    // Platform identifier
  registry: PlatformRegistry;           // Tool name mappings
  config: SupportedTool;                // Platform metadata
  templates: PlatformTemplates;         // LiquidJS template paths
  naming: PlatformNaming;               // Output file naming conventions
  hooks?: PlatformHooks;                // Optional lifecycle hooks
  copyDirs?: readonly string[];         // Directories to copy verbatim
  producesBundleAssets: boolean;         // Include in embedded binary manifest
}
```

## Docker Environment

A containerized environment for testing rp1 against a real TypeScript codebase (`zod-to-json-schema`). Two scenarios are available: **Stable Tester** (production rp1 binary) and **Active Developer** (local source mounted).

### Prerequisites

- Docker Desktop (or compatible runtime) installed and running
- Apple Silicon Mac (images target `linux/arm64` only)
- `just` command runner installed on the host

### Stable Tester (Clean Room)

Starts a **clean room** container with all harness CLIs (Claude Code, OpenCode, Codex, Copilot CLI) pre-installed but **no rp1**. Use `test-install.sh` inside the container to simulate the user installation experience. Your local rp1 source is mounted read-only at `/src/rp1`.

```bash
just start-docker-stable
```

What it does:

1. Builds the `stable` Docker image (cached after first build)
2. Starts the container with port forwarding, env var injection, and local source mounted read-only
3. Drops you into an interactive zsh shell at `~/target/zod-to-json-schema`

The shell prompt shows `[rp1-stable]`. Use the test harness to install rp1:

```bash
# Simulate a first-time user running the production install script
test-install.sh fresh

# Simulate a first-time install with a locally-built binary (raw copy, skips install script)
test-install.sh fresh --from-source

# Simulate a first-time install through the real install script using local artifacts
test-install.sh fresh --local-install

# Simulate upgrading an existing install
test-install.sh update --from-source
test-install.sh update --local-install

# Reset to clean room state (remove all rp1 artifacts)
test-install.sh clean
```

Three modes are available:

- **(default)**: Runs the real production install script (`curl -fsSL https://rp1.run/install.sh | sh`) — exactly what a user would run.
- **`--from-source`**: Builds a linux/arm64 binary from the mounted source at `/src/rp1` and copies it directly into `~/.local/bin`. Fast, but skips the install script entirely.
- **`--local-install`**: Builds the binary from source, stages it with goreleaser-style naming (`rp1-linux-arm64` + `checksums.txt`), then runs the real install script against those local artifacts. This exercises checksum verification, file permissions, and PATH checks — use this to test unreleased versions through the full install flow.

### Active Developer

Starts a container with your local rp1 source tree mounted at `/src/rp1`. The container automatically builds rp1 from your local source and installs plugins on startup. Use this for testing in-progress changes.

```bash
just start-docker-dev
```

What it does:

1. Builds the `dev` Docker image (cached after first build)
2. Starts the container with your local rp1 directory bind-mounted at `/src/rp1`
3. Runs `setup-dev.sh` which:
   - Installs CLI dependencies (`bun install`)
   - Builds rp1 from local source (compiles to a temp dir to avoid virtiofs rename issues, then copies the binary)
   - Installs plugins to detected platforms (`rp1 install -y`)
4. Drops you into an interactive zsh shell at `/src/rp1`

The shell prompt shows `[rp1-dev]` to indicate the active scenario. Changes to local files on the host are reflected inside the container without restart (bind mount).

**Note**: The dev image includes Node.js, Claude Code, OpenCode, and Codex CLIs so that `rp1 install -y` can detect and install plugins to all platforms.

### Debugging Dockerized Evals

Use the interactive dev container when you need to inspect a failing dockerized eval without touching the host runtime:

```bash
just start-docker-dev
PRESERVE_EVAL_WORKSPACES=true just eval-run-local rp1-dev/build-fast
```

This keeps the eval execution inside the container while preserving failed workspaces under `/tmp/rp1-evals/*` for inspection. If you need Arcade during debugging, start it inside the container with `rp1 arcade` and open `http://localhost:17710` on the host. The interactive Docker flow keeps the host default Arcade port `7710` free, while `just eval-view` remains available on the host for promptfoo result browsing.

### Environment Variables

Both recipes forward API keys and tokens from your host shell to the container using `docker run -e VAR_NAME` syntax. The following variables are forwarded when set:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GITHUB_TOKEN`

No `.env` file is needed. If a variable is not set on the host, it is silently skipped (no error). No secrets are baked into the Docker image.

### Port Forwarding

The container's Arcade dashboard port (7710) is mapped to host port **17710** to avoid conflicts with a locally running rp1 Arcade instance:

```
Container :7710  -->  Host :17710
```

After starting Arcade inside the container (`rp1 arcade`), access it at `http://localhost:17710` in your host browser. The container sets `RP1_ARCADE_HOST=0.0.0.0` so the Arcade server binds to all interfaces, enabling Docker port forwarding to reach it.

To forward additional ports, modify the `docker run` command in the `start-docker-stable` or `start-docker-dev` recipes in the `justfile` by adding `-p <host-port>:<container-port>` flags.

### Pinning the Target Repository

The target repository (`zod-to-json-schema`) commit can be overridden at build time:

```bash
docker build --platform linux/arm64 --target stable \
  --build-arg ZOD_COMMIT=<commit-sha> \
  -t rp1-stable -f docker/Dockerfile .
```

By default, it checks out the `master` branch.

### Container Layout

```
/home/rp1user/
├── .local/bin/         # User-local binaries (rp1, bun)
├── target/
│   └── zod-to-json-schema/   # Target repository (working directory)
/src/rp1/               # Volume mount point (dev container only)
```

### Installed Tools

Both containers include: git, gh, zsh, ripgrep, bun, Node.js LTS, python3, curl, make, gcc, g++, tar, gzip, wget, less, vim, jq, just, Claude Code CLI, OpenCode CLI, Codex CLI.

## Troubleshooting

### Docker: `SELF_SIGNED_CERT_IN_CHAIN` during image build

This happens when a corporate VPN intercepts TLS connections inside the Docker build. Disconnect VPN and rebuild, or add the VPN's CA certificate to the container.

### Docker: `failed to rename ... .bun-build` (virtiofs)

Bun's `--compile` flag uses atomic rename which doesn't work on Docker's virtiofs filesystem. The `setup-dev.sh` script already works around this by building to a temp dir. If you hit this in other contexts, compile to a local path first then copy to the mount.

### Docker: Arcade not reachable at localhost:17710

Ensure `RP1_ARCADE_HOST=0.0.0.0` is set inside the container. Without it, the Arcade server binds to `127.0.0.1` which is unreachable from the host via Docker port forwarding. Both Docker images set this env var automatically.

### Port 7710 already in use

```bash
just serve-web-ui       # Automatically kills existing daemon
# Or manually:
pkill -f "rp1 _daemon-server"
lsof -ti:7710 | xargs kill -9
```

### Stale web-ui after rebuild

```bash
just clean-web-ui-cache
just build
```

### Plugin changes not reflecting

```bash
just rm-stable          # Remove any stable version
just install            # Reinstall dev version
```

### Eval dependencies missing

```bash
just eval-setup        # Run once after clone
```

### Tests failing with lint errors

```bash
just fix                # Auto-fix lint/format issues
just test               # Re-run tests
```

## Getting Help

- **Issues**: <https://github.com/rp1-run/rp1/issues>
- **Contributing Guidelines**: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- **Design Docs**: `.rp1/work/features/plugin-split-base-dev/design.md` (v2.0.0 architecture)
