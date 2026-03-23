# Installation Troubleshooting

Solutions for installation and update issues including recovery procedures.

---

## Automatic Recovery

### How Rollback Works

When an installation fails, rp1 automatically:

1. Detects the failure
2. Locates the backup created before installation started
3. Restores all backed-up files to their original locations
4. Deletes the backup manifest to prevent duplicate restoration
5. Reports what was restored

**Example output:**

```
Error: Failed to copy plugin files (permission denied)
Installation failed. Restored previous installation (15 files). You can safely retry the installation.
```

### What Gets Backed Up

Before any installation modification, rp1 backs up:

- All existing `rp1-*` agent files in the agents folder
- All existing `rp1-*` skill directories
- All existing `rp1-*` plugin hook directories
- The `opencode.json` configuration (if present)

### Backup Location

Backups are stored in a timestamped directory:

```
~/.opencode-rp1-backups/backup_{timestamp}/
├── manifest.json
├── agents/
│   └── rp1-base-*.md
│   └── rp1-dev-*.md
├── skills/
│   └── rp1-base/
│   └── rp1-dev/
├── plugin/
│   └── rp1-base-hooks/
└── opencode.json
```

---

## Signal Interruption Recovery

### Safe Cancellation

You can safely interrupt installation with Ctrl+C. The system handles this gracefully:

1. **Signal caught** - Installation stops immediately
2. **Cleanup initiated** - Partial files are removed
3. **Backup restored** - Previous installation is restored (if backup exists)
4. **Guidance displayed** - Instructions for retrying

**Example output when interrupted:**

```
^C
Installation interrupted. Cleaning up...
Restored previous installation from backup.

To retry: rp1 install claude-code
```

### What Happens During Interruption

| Phase Interrupted | Recovery Action |
|-------------------|-----------------|
| Before file copy | No action needed (nothing changed) |
| During file copy | Partial files removed, backup restored |
| During plugin registration | Plugin unregistered, backup restored |
| After completion | No recovery needed (installation complete) |

### CI/CD SIGTERM Handling

In CI environments, graceful shutdown via SIGTERM is handled identically to SIGINT (Ctrl+C). Your pipelines can safely cancel jobs without leaving broken state.

---

## Common Issues

### Installation Fails with Permission Denied

??? question "Cannot write to plugin directory"

    **Symptoms:**

    - Error: `EACCES: permission denied`
    - Installation aborts with file system error

    **Solutions:**

    1. **Check directory ownership:**

        ```bash
        ls -la ~/.claude/
        ls -la ~/.config/opencode/
        ```

    2. **Fix permissions:**

        ```bash
        # For Claude Code
        sudo chown -R $(whoami) ~/.claude/

        # For OpenCode
        sudo chown -R $(whoami) ~/.config/opencode/

        ```

    3. **If using brew-installed Claude:**

        The plugin directory may be owned by root. Contact Claude Code support.

### Partial Installation State

??? question "Some commands work, others don't"

    **Symptoms:**

    - `/rp1-base:*` commands work but `/rp1-dev:*` don't (or vice versa)
    - Some agents available, others missing

    **This shouldn't happen** with the atomic installation feature. If you see this:

    1. **Check if atomic installation is enabled:**

        For OpenCode, plugins install atomically via staging directory. For Claude Code, plugins are registered one at a time.

    2. **Force reinstall:**

        ```bash
        rp1 install claude-code --force
        # or
        rp1 install opencode --force
        ```

    3. **Report the issue:**

        This indicates a bug. Please report with steps to reproduce.

### Backup Not Found

??? question "Rollback failed: no backup available"

    **Symptoms:**

    - Installation fails but no previous state to restore
    - Message: "Installation failed. No previous installation to restore."

    **This is expected** on first installation. There's nothing to roll back to.

    **Solutions:**

    1. Fix the underlying error (network, permissions, etc.)
    2. Retry installation
    3. For clean state, manually remove any partial files:

        ```bash
        # Claude Code
        rm -rf ~/.claude/commands/rp1-*
        rm -rf ~/.claude/agents/rp1-*

        # OpenCode
        rm -rf ~/.config/opencode/agents/rp1-*
        rm -rf ~/.config/opencode/skills/rp1-*
        rm -rf ~/.config/opencode/plugin/rp1-*
        ```

### Staging Directory Cleanup

??? question "Orphaned staging directory"

    **Symptoms:**

    - Directory exists at `~/.config/.rp1-staging/`
    - Happened after crash or power loss

    **Solutions:**

    1. **Safe to delete:**

        ```bash
        rm -rf ~/.config/.rp1-staging/
        ```

        The staging directory is only used during installation. If installation completed or was interrupted, this directory can be safely removed.

    2. **Retry installation:**

        After cleanup, retry:

        ```bash
        rp1 install opencode
        ```

---

## Strict Mode

### Using Strict Mode

Strict mode (`--strict`) converts warnings to errors. Use it in CI/CD for deterministic behavior:

```bash
rp1 install all --strict --yes
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `5` | Strict mode failure (missing source directory) |

### Example CI Configuration

```yaml
# GitHub Actions
- name: Install rp1 plugins
  run: rp1 install all --strict --yes
  continue-on-error: false

# The step fails immediately if any source directory is missing
# rather than silently skipping it
```

---

## Dry Run Validation

### What Dry Run Checks

When you run `rp1 install --dry-run`, the system validates:

| Check | Description |
|-------|-------------|
| Network connectivity | Can reach GitHub API |
| Disk space | Sufficient space for installation |
| Package manager | `brew doctor` passes (macOS/Linux) |
| Target version | Fetches exact version to install |

### Example Output

```bash
$ rp1 install claude-code --dry-run

[DRY RUN] Would install:
  - rp1-base to Claude Code
  - rp1-dev to Claude Code

Validating prerequisites...
  Network connectivity: OK
  Disk space: OK (150 MB available)
  Package manager: OK (brew doctor passed)
  Latest version: 0.3.1

All prerequisites satisfied. Run without --dry-run to proceed.
```

### Dry Run Failures

If validation fails, you'll see specific guidance:

```bash
$ rp1 install claude-code --dry-run

Validating prerequisites...
  Network connectivity: FAILED
    Cannot reach api.github.com
    Check your network connection or proxy settings

  Disk space: OK (150 MB available)

Prerequisites validation failed. Fix the issues above before installation.
```

---

## Related

- [install Reference](../reference/cli/install.md) - Full command documentation
- [update Reference](../reference/cli/update.md) - Update command documentation
- [General Troubleshooting](index.md) - Other common issues
