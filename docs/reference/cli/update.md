# update

Update the rp1 CLI and plugins.

---

## Synopsis

```bash
rp1 update [options]
rp1 update plugins [tool]
```

## Description

The `update` command updates the rp1 CLI to the latest version. After updating the CLI, it prompts to update plugins for all detected AI tools.

## Usage

### Update CLI

```bash
rp1 update
```

This command:

1. Checks for the latest rp1 release
2. Downloads the new binary to a temporary location
3. Verifies the binary works by running `--version`
4. Replaces the existing binary only after verification
5. Prompts to update plugins for detected AI tools
6. Reports the update result

The pre-validation step ensures your CLI is never left in a broken state if the download is corrupted.

### Check for Updates

```bash
rp1 update --check
```

Check if updates are available without installing. Useful for CI/CD pipelines or scripts that need to know update status.

### Update Plugins Only

```bash
rp1 update plugins [tool]
```

Update plugins without updating the CLI. The `tool` argument can be:

| Value | Description |
|-------|-------------|
| `all` | Update plugins for all detected AI tools (default) |
| `claude-code` | Update plugins for Claude Code only |
| `opencode` | Update plugins for OpenCode only |

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--check` | | Check for updates without installing |
| `--dry-run` | | Show what would be done without executing |
| `--force` | | Force update even if already on latest version |
| `--yes` | `-y` | Skip confirmation prompts |
| `--help` | `-h` | Display help information |

## Examples

### Standard update

```bash
rp1 update
```

**Expected output:**

```
Checking for updates...

Current version: 0.2.12
Latest version:  0.2.13

Downloading rp1 v0.2.13...
Installing...

rp1 updated successfully to v0.2.13.

Would you like to update plugins as well? [Y/n] y

Updating plugins for detected tools...
  Updating Claude Code plugins...
  Updating OpenCode plugins...

All plugins updated successfully.
```

### Check for updates (no installation)

```bash
rp1 update --check
```

**Expected output (update available):**

```
Current version: 0.2.12
Latest version:  0.2.13

Update available! Run 'rp1 update' to install.
```

**Expected output (up to date):**

```
Current version: 0.2.13
Latest version:  0.2.13

rp1 is up to date.
```

### Force update

```bash
rp1 update --force
```

Re-downloads and reinstalls the latest version even if already up to date. Useful for repairing a corrupted installation.

### Update plugins only

```bash
# Update for all detected tools
rp1 update plugins all

# Update for Claude Code only
rp1 update plugins claude-code

# Update for OpenCode only
rp1 update plugins opencode
```

### Non-interactive update

```bash
rp1 update --yes
```

Skips all confirmation prompts. After CLI update, automatically updates plugins without prompting.

### Preview update (dry run)

```bash
rp1 update --dry-run
```

**Expected output:**

```
[DRY RUN] Would perform:
  - Download rp1 v0.2.13
  - Replace /usr/local/bin/rp1
  - Update plugins for: Claude Code, OpenCode

Validating prerequisites...
  Package manager: brew doctor OK
  Network connectivity: OK
  Disk space: OK (250 MB available)
  Target version: 0.2.13

No changes made.
```

The enhanced dry-run validates prerequisites before showing the update plan, helping you catch issues before they cause failures.

## Reliability Features

### Safe Interruption

You can safely press Ctrl+C during updates. The system will:

1. Stop the update gracefully
2. Clean up any temporary files
3. Preserve your current installation
4. Display guidance for retrying

### Pre-Validation

Before replacing the binary, rp1:

1. Downloads to a temporary location
2. Runs `--version` to verify the binary works
3. Only then replaces the existing binary

This ensures you're never left with a broken CLI.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (up to date or updated successfully) |
| `1` | Error (network failure, permission denied, etc.) |
| `5` | Strict mode failure (missing source directories) |

## CI/CD Integration

### Check for updates in pipeline

```yaml
# GitHub Actions example
- name: Check for rp1 updates
  run: |
    if rp1 update --check | grep -q "Update available"; then
      echo "rp1 update available"
    fi
```

### Automated update script

```bash
#!/bin/bash
# Update rp1 CLI and plugins non-interactively
rp1 update --yes
rp1 update plugins all
```

## Troubleshooting

??? question "Update fails with permission denied"

    The rp1 binary location may require elevated permissions:

    ```bash
    # Check binary location
    which rp1

    # If in /usr/local/bin, you may need sudo for updates via package manager
    brew upgrade rp1  # Homebrew handles permissions
    scoop update rp1  # Scoop handles permissions
    ```

    If installed via the install script, ensure write access to the binary directory.

??? question "Network error during update"

    Update requires access to GitHub releases. Check:

    1. Network connectivity: `curl -I https://github.com`
    2. Proxy settings: Ensure `HTTPS_PROXY` is configured if behind a proxy
    3. Firewall rules: Allow connections to `github.com` and `objects.githubusercontent.com`

??? question "Plugin update fails"

    If plugin update fails after CLI update:

    1. Run plugin update separately: `rp1 update plugins all`
    2. Try manual installation: `rp1 install claude-code` or `rp1 install opencode`
    3. Verify AI tool is installed and in PATH

??? question "Version shows old after update"

    If `rp1 --version` shows old version after update:

    1. **Shell cache** - Start a new terminal session
    2. **Multiple installations** - Check `which rp1` and ensure the updated binary is first in PATH
    3. **Package manager** - If using Homebrew/Scoop, use `brew upgrade rp1` or `scoop update rp1` instead

## Deprecated Syntax

!!! warning "Deprecated Commands"
    The following commands are deprecated and will be removed in a future release:

    | Deprecated | New Command |
    |------------|-------------|
    | `rp1 self-update` | `rp1 update` |
    | `rp1 check-update` | `rp1 update --check` |

    The deprecated commands still work but display a warning message.

## See Also

- [`install`](install.md) - Install plugins for AI tools
- [`init`](init.md) - Initialize rp1 in a project
- [Installation Guide](../../getting-started/installation.md) - Full installation instructions
