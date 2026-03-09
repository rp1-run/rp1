# install

Install rp1 plugins for AI coding assistants.

---

## Synopsis

```bash
rp1 install <subcommand> [options]
```

## Description

The `install` command installs rp1 plugins (rp1-base and rp1-dev) for your AI coding assistant. It supports Claude Code, OpenCode, Codex CLI, and can auto-detect all installed tools.

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

### `install codex`

Install plugins to Codex CLI.

```bash
rp1 install codex [options]
```

This command:

1. Verifies Codex CLI is installed
2. Copies rp1 skill directories to `~/.agents/skills/`
3. Merges rp1-managed agent definitions and shell approvals into `~/.codex/config.toml`
4. Confirms installation success

### `install all`

Install plugins to all detected AI tools.

```bash
rp1 install all [options]
```

This command:

1. Detects installed AI tools (Claude Code, OpenCode, Codex CLI)
2. Installs plugins for each detected tool
3. Reports results for all tools

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | | Show what would be installed without making changes. Also validates prerequisites (network, disk space). |
| `--strict` | | Fail on any missing source directories (useful for CI/CD). Exit code 5 on strict mode failures. |
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
  Found: Codex CLI v0.110.0

Installing plugins for all detected tools...

Claude Code:
  Installing rp1-base...
  Installing rp1-dev...

OpenCode:
  Copying plugins to ~/.opencode/prompts/...

Codex CLI:
  Copying skills to ~/.agents/skills/...
  Updating ~/.codex/config.toml...

All plugins installed successfully.
```

### Preview installation (dry run)

```bash
rp1 install claude-code --dry-run
```

For Codex:

```bash
rp1 install codex --dry-run
```

**Expected output:**

```
[DRY RUN] Would install:
  - rp1-base to Claude Code
  - rp1-dev to Claude Code

Validating prerequisites...
  Network connectivity: OK
  Disk space: OK (150 MB available)
  Latest version: 0.3.1

No changes made.
```

### Strict mode for CI/CD

```bash
rp1 install opencode --strict
```

In strict mode, the command fails with exit code 5 if any source directories are missing. This is useful for CI/CD pipelines where you want deterministic failures rather than silent warnings.

**Example in CI:**

```yaml
- name: Install rp1 plugins
  run: rp1 install all --strict --yes
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

# Verify Codex installation
rp1 verify codex
```

**Example output:**

```
Plugin Verification: Claude Code

Component        Status    Path
rp1-base         OK        ~/.claude/commands/rp1-base
rp1-dev          OK        ~/.claude/commands/rp1-dev

All plugins verified successfully.
```

For Codex, verification checks both rp1 skill directories in `~/.agents/skills/` and the rp1-managed fenced section in `~/.codex/config.toml`.

## Reliability Features

### Automatic Rollback

If installation fails partway through, rp1 automatically restores your previous installation from backup. You'll see a message like:

```
Installation failed. Restored previous installation (12 files). You can safely retry the installation.
```

### Safe Interruption

You can safely press Ctrl+C during installation. The system will:

1. Stop the installation gracefully
2. Restore any backed-up files
3. Clean up partial state
4. Display guidance for retrying

### Atomic Installation (OpenCode)

For OpenCode installations, plugins are first copied to a staging directory (`~/.config/.rp1-staging/`), verified, then atomically moved to the target location. This ensures you never end up with a partial installation.

## Troubleshooting

??? question "Installation fails with 'tool not found'"

    Ensure your AI tool is installed and in your PATH:

    ```bash
    # Check Claude Code
    which claude

    # Check OpenCode
    which opencode

    # Check Codex CLI
    which codex
    ```

    If the binary is installed but not in PATH, add it to your shell configuration.

??? question "Plugins not appearing after installation"

    1. **Restart your AI tool** - Plugins are only loaded at startup
    2. **Verify installation** - Run `rp1 verify claude-code`, `rp1 verify opencode`, or `rp1 verify codex`
    3. **Check plugin directory** - Ensure plugins exist in the expected location:
        - Claude Code: `~/.claude/commands/`
        - OpenCode: `~/.opencode/prompts/`
        - Codex CLI: `~/.agents/skills/`

??? question "Codex prompts for shell approval too often"

    `rp1 install codex` writes an rp1-managed fenced section into `~/.codex/config.toml`
    with agent definitions and `[[shell.approved]]` entries for rp1 shell usage.

    Verify the managed section exists:

    ```bash
    rg -n "rp1:start|shell.approved" ~/.codex/config.toml
    ```

    If it is missing or outdated, rerun:

    ```bash
    rp1 install codex
    ```

??? question "How do I invoke rp1 skills from Codex?"

    Use Codex skill mentions with the `$` prefix, for example:

    ```text
    $rp1-build-fast fix the authentication bug
    $rp1-knowledge-build
    ```

??? question "Codex limitations"

    Current Codex support differs from Claude Code and OpenCode in a few ways:

    - Skill invocation uses `$skill-name` mentions rather than slash commands
    - Codex does not support per-skill `allowed-tools`; approvals are configured globally in `~/.codex/config.toml`
    - If a platform capability required by a workflow is unavailable, rp1 should surface an explicit message instead of silently degrading

??? question "Permission denied during installation"

    Check file permissions on the plugin directory:

    ```bash
    # Claude Code
    ls -la ~/.claude/

    # OpenCode
    ls -la ~/.opencode/

    # Codex CLI
    ls -la ~/.agents/
    ```

    Ensure your user has write access to these directories.

## Deprecated Syntax

!!! warning "Deprecated Commands"
    The following commands are deprecated and will be removed in a future release:

    | Deprecated | New Command |
    |------------|-------------|
    | `rp1 install:claude-code` | `rp1 install claude-code` |
    | `rp1 install:opencode` | `rp1 install opencode` |
    | `rp1 install:codex` | `rp1 install codex` |

    The deprecated commands still work but display a warning message.

## See Also

- [Installation Guide](../../getting-started/installation.md) - Complete installation walkthrough
- [`init`](init.md) - Initialize rp1 in a project (includes plugin installation)
- [`update`](update.md) - Update CLI and plugins
