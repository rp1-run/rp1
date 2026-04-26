# rp1 CLI

Command-line interface for rp1 - AI-assisted development workflows.

## Installation

```bash
# macOS / Linux (Homebrew)
brew install rp1-run/tap/rp1

# Windows (Scoop)
scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
scoop install rp1

# Or use the install script
curl -fsSL https://rp1.run/install.sh | sh
```

## Commands

### Project Setup

#### `rp1 init`

Initialize rp1 in a project with guided setup.

```bash
cd your-project
rp1 init
```

**Options:**
- `-y, --yes` - Accept all defaults (non-interactive mode)

### Plugin Installation

#### `rp1 install <tool>`

Install rp1 plugins for a specific AI tool or all detected tools.

```bash
# Install for Claude Code
rp1 install claude-code

# Install for OpenCode
rp1 install opencode

# Install for all detected tools
rp1 install all
```

**Subcommands:**
| Subcommand | Description |
|------------|-------------|
| `claude-code` | Install plugins to Claude Code |
| `opencode` | Install plugins to OpenCode |
| `all` | Install plugins to all detected AI tools |

**Options:**
- `--dry-run` - Show what would be installed without installing
- `-y, --yes` - Skip confirmation prompts

**Examples:**
```bash
# Install to Claude Code with confirmation
rp1 install claude-code

# Install to all tools, skip prompts
rp1 install all --yes

# Preview installation without making changes
rp1 install opencode --dry-run
```

### Verification

#### `rp1 verify <tool>`

Verify plugin installation for a specific AI tool.

```bash
# Verify Claude Code installation
rp1 verify claude-code

# Verify OpenCode installation
rp1 verify opencode
```

**Subcommands:**
| Subcommand | Description |
|------------|-------------|
| `claude-code` | Verify Claude Code plugin installation |
| `opencode` | Verify OpenCode plugin installation |

**Example output:**
```
Plugin Verification: Claude Code

Component        Status    Path
rp1-base         OK        ~/.claude/commands/rp1-base
rp1-dev          OK        ~/.claude/commands/rp1-dev

All plugins verified successfully.
```

### Updates

#### `rp1 update`

Update the rp1 CLI and optionally update plugins.

```bash
# Update CLI (prompts for plugin update after)
rp1 update

# Check for updates without installing
rp1 update --check

# Force update even if already on latest
rp1 update --force

# Preview what would be done
rp1 update --dry-run
```

**Options:**
- `--check` - Check for updates without installing
- `--dry-run` - Show what would be done without executing
- `--force` - Force update even if already on latest version
- `-y, --yes` - Skip confirmation prompts

#### `rp1 update plugins <tool>`

Update plugins for a specific AI tool or all detected tools.

```bash
# Update plugins for all detected tools
rp1 update plugins all

# Update plugins for Claude Code only
rp1 update plugins claude-code

# Update plugins for OpenCode only
rp1 update plugins opencode
```

**Examples:**
```bash
# Full update: CLI + all plugins
rp1 update --yes && rp1 update plugins all

# Update only plugins
rp1 update plugins all
```

### Other Commands

#### `rp1 list`

List installed plugins.

```bash
rp1 list
```

#### `rp1 uninstall`

Uninstall rp1 plugins from an AI tool.

```bash
rp1 uninstall claude-code
rp1 uninstall opencode
```

#### `rp1 agent-tools`

Tools for AI agents (lazy-loaded to avoid startup overhead).

| Command | Description |
|---------|-------------|
| `mmd-validate` | Validate Mermaid diagram syntax from a file or stdin |
| `rp1-root-dir` | Resolve the current rp1 project, KB, and work directories |
| `work-search` | Search project-scoped markdown artifacts under `.rp1/work` |

```bash
# Validate Mermaid diagram syntax
rp1 agent-tools mmd-validate ./document.md

# Pipe diagram content
cat diagram.mmd | rp1 agent-tools mmd-validate

# Search prior work artifacts in the active project
rp1 agent-tools work-search "phase plan" --limit 5

# Refresh the work-search sidecar index without searching
rp1 agent-tools work-search --refresh-only
```

`work-search` refreshes the project-local `.rp1/search.db` sidecar index by
default, searches only markdown work artifacts for the resolved project, and
returns a JSON `ToolResult` with ranked snippets, normalized work paths, project
scope, refresh stats, and artifact metadata. Use `--project <path>` to search an
explicit rp1 project, `--no-refresh` to query an existing index, and
`--limit <n>` to cap results (default 10, max 50).

## Global Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-V, --version` | Show version number |
| `-v, --verbose` | Enable debug logging |
| `--trace` | Enable trace logging |

## Environment Variables

rp1 derives its directories from the project root:

- Knowledge base: `.rp1/context/`
- Work artifacts: `.rp1/work/`
- Legacy directory override environment variables are no longer supported

## Deprecated Commands

The following commands are deprecated and will be removed in a future release. They still work but display a deprecation warning.

| Deprecated Command | New Command |
|--------------------|-------------|
| `rp1 install:claude-code` | `rp1 install claude-code` |
| `rp1 install:opencode` | `rp1 install opencode` |
| `rp1 verify:claude-code` | `rp1 verify claude-code` |
| `rp1 verify:opencode` | `rp1 verify opencode` |
| `rp1 self-update` | `rp1 update` |
| `rp1 check-update` | `rp1 update --check` |

**Migration:**
```bash
# Old syntax (deprecated)
rp1 install:claude-code
rp1 self-update

# New syntax (recommended)
rp1 install claude-code
rp1 update
```

## Development

### Building

```bash
cd cli
bun install
bun run build
```

### Testing

```bash
bun test
```

### Linting

```bash
bun run lint
bun run format
```

## Documentation

- [Full CLI Reference](https://rp1.run/reference/cli/)
- [Installation Guide](https://rp1.run/getting-started/installation/)
- [First Workflow](https://rp1.run/getting-started/first-workflow/)
