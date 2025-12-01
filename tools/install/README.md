# rp1-opencode: Installation Tool for OpenCode Platform

Installation and management tool for rp1 plugins on the OpenCode platform.

## Features

- Install rp1 commands, agents, and skills to OpenCode
- Validate OpenCode prerequisites (version, opencode-skills plugin)
- Manage configuration files with backup support
- Verify installation health
- Update to new versions safely
- Rollback to previous installations
- List installed commands
- Global installation support (~/.config/opencode/)

## Installation

### For End Users (via install script)

The easiest way to install (requires `gh` CLI for private repo access):

```bash
# Prerequisites: Install and authenticate gh CLI
brew install gh && gh auth login

# Clone and run install script
gh repo clone rp1-run/rp1 /tmp/rp1 && bash /tmp/rp1/scripts/install-for-opencode.sh
```

### For End Users (via uvx with specific version)

Run directly with `uvx` using a specific version from GitHub Releases:

```bash
# Install specific version (replace 1.0.2 with desired version)
uvx --from https://github.com/rp1-run/rp1/releases/download/opencode-v1.0.2/rp1_opencode-1.0.2-py3-none-any.whl rp1-opencode install
```

No separate build step required!

### For Developers (from source)

```bash
# 1. Clone repository
git clone https://github.com/rp1-run/rp1
cd rp1

# 2. Build artifacts for install tool
./scripts/build.sh

# 3. Install from local source
cd install-tool
uvx --from . rp1-opencode install
```

## Usage

All examples below use `$RPI_WHL` as a shorthand for the wheel URL. Set it first:

```bash
# Get latest version URL (or use install script instead)
export RP1_WHL=$(curl -fsSL https://api.github.com/repos/rp1-run/rp1/releases | grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | head -1)
```

### Install rp1 on OpenCode

```bash
# Install with bundled artifacts (recommended)
uvx --from "$RP1_WHL" rp1-opencode install

# Install from custom artifacts directory
uvx --from "$RP1_WHL" rp1-opencode install --artifacts-dir /path/to/dist/opencode

# Skip skills if opencode-skills plugin not installed
uvx --from "$RP1_WHL" rp1-opencode install --skip-skills

# Dry run (show what would be installed)
uvx --from "$RP1_WHL" rp1-opencode install --dry-run
```

### Verify Installation

```bash
uvx --from "$RP1_WHL" rp1-opencode verify
```

### List Installed Commands

```bash
uvx --from "$RP1_WHL" rp1-opencode list-commands
```

### Check Version

```bash
uvx --from "$RP1_WHL" rp1-opencode version
```

### Update rp1

```bash
# Update to latest version
uvx --from "$RP1_WHL" rp1-opencode update

# Update to specific version
uvx --from "$RP1_WHL" rp1-opencode update --version 2.6.0

# Dry run
uvx --from "$RP1_WHL" rp1-opencode update --dry-run
```

### Uninstall rp1

```bash
uvx --from "$RP1_WHL" rp1-opencode uninstall

# Keep config files
uvx --from "$RP1_WHL" rp1-opencode uninstall --keep-config
```

### Rollback to Previous Version

```bash
uvx --from "$RP1_WHL" rp1-opencode rollback
```

## Requirements

- Python 3.13+
- OpenCode >=0.8.0 (tested with 0.9.x)
- opencode-skills plugin (optional, for skills support)

## Development

### Setup

```bash
cd install-tool
uv sync
```

### Run Tests

```bash
uv run pytest
```

### Type Check

```bash
uv run mypy src/
```

### Lint

```bash
uv run ruff check src/
```

## License

Apache-2.0
