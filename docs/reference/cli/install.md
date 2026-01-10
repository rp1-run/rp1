# install

Install rp1 plugins for AI coding assistants.

---

## Synopsis

```bash
rp1 install <subcommand> [options]
```

## Description

The `install` command installs rp1 plugins (rp1-base and rp1-dev) for your AI coding assistant. It supports Claude Code, OpenCode, and can auto-detect all installed tools.

## Subcommands

### `install claude-code`

Install plugins to Claude Code.

```bash
rp1 install claude-code [options]
```

This command:

1. Verifies Claude Code is installed
2. Installs rp1-base plugin
3. Installs rp1-dev plugin
4. Confirms installation success

### `install opencode`

Install plugins to OpenCode.

```bash
rp1 install opencode [options]
```

This command:

1. Verifies OpenCode is installed
2. Copies plugin files to OpenCode prompts directory
3. Confirms installation success

### `install all`

Install plugins to all detected AI tools.

```bash
rp1 install all [options]
```

This command:

1. Detects installed AI tools (Claude Code, OpenCode)
2. Installs plugins for each detected tool
3. Reports results for all tools

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | | Show what would be installed without making changes |
| `--yes` | `-y` | Skip confirmation prompts |
| `--help` | `-h` | Display help information |

## Examples

### Install for Claude Code

```bash
rp1 install claude-code
```

**Expected output:**

```
Installing rp1 plugins for Claude Code...

  Installing rp1-base...
  Installing rp1-dev...

Plugins installed successfully.

Next steps:
  1. Restart Claude Code to load plugins
  2. Type / to see available commands
```

### Install for all detected tools

```bash
rp1 install all
```

**Expected output:**

```
Detecting AI tools...
  Found: Claude Code v2.0.75
  Found: OpenCode v0.8.0

Installing plugins for all detected tools...

Claude Code:
  Installing rp1-base...
  Installing rp1-dev...

OpenCode:
  Copying plugins to ~/.opencode/prompts/...

All plugins installed successfully.
```

### Preview installation (dry run)

```bash
rp1 install claude-code --dry-run
```

**Expected output:**

```
[DRY RUN] Would install:
  - rp1-base to Claude Code
  - rp1-dev to Claude Code

No changes made.
```

### Non-interactive installation

```bash
rp1 install all --yes
```

Skips all confirmation prompts. Useful for CI/CD or automation scripts.

## Verification

After installation, verify plugins are correctly installed:

```bash
# Verify Claude Code installation
rp1 verify claude-code

# Verify OpenCode installation
rp1 verify opencode
```

**Example output:**

```
Plugin Verification: Claude Code

Component        Status    Path
rp1-base         OK        ~/.claude/commands/rp1-base
rp1-dev          OK        ~/.claude/commands/rp1-dev

All plugins verified successfully.
```

## Troubleshooting

??? question "Installation fails with 'tool not found'"

    Ensure your AI tool is installed and in your PATH:

    ```bash
    # Check Claude Code
    which claude

    # Check OpenCode
    which opencode
    ```

    If the binary is installed but not in PATH, add it to your shell configuration.

??? question "Plugins not appearing after installation"

    1. **Restart your AI tool** - Plugins are only loaded at startup
    2. **Verify installation** - Run `rp1 verify claude-code` or `rp1 verify opencode`
    3. **Check plugin directory** - Ensure plugins exist in the expected location:
        - Claude Code: `~/.claude/commands/`
        - OpenCode: `~/.opencode/prompts/`

??? question "Permission denied during installation"

    Check file permissions on the plugin directory:

    ```bash
    # Claude Code
    ls -la ~/.claude/

    # OpenCode
    ls -la ~/.opencode/
    ```

    Ensure your user has write access to these directories.

## Deprecated Syntax

!!! warning "Deprecated Commands"
    The following commands are deprecated and will be removed in a future release:

    | Deprecated | New Command |
    |------------|-------------|
    | `rp1 install:claude-code` | `rp1 install claude-code` |
    | `rp1 install:opencode` | `rp1 install opencode` |

    The deprecated commands still work but display a warning message.

## See Also

- [Installation Guide](../../getting-started/installation.md) - Complete installation walkthrough
- [`init`](init.md) - Initialize rp1 in a project (includes plugin installation)
- [`update`](update.md) - Update CLI and plugins
