# self-update

Updates rp1 to the latest version using the appropriate package manager.

---

## Synopsis

=== "Claude Code"

    ```bash
    /self-update
    ```

=== "OpenCode"

    ```bash
    /rp1-base-self-update
    ```


## Description

The `self-update` command detects your rp1 installation method and runs the appropriate update
command. It supports automatic updates for Homebrew and Scoop installations, and provides manual
instructions for other installation methods.

`rp1 update` now runs a coordinated lifecycle:
- stop the Arcade daemon first when it is already running
- update the rp1 binary
- relaunch post-update work in the freshly installed binary
- refresh plugins for all detected tools
- run project migrations when the current directory is an rp1 project
- restore the Arcade daemon after the update finishes

## Options

| Option | Description |
|--------|-------------|
| `--check` | Check for available updates without installing |
| `--json` | Output result as JSON (only with `--check`) |
| `--dry-run` | Preview what would be done without making changes |
| `--force` | Force update even if already on the latest version |
| `-y, --yes` | Skip all confirmation prompts |

## Supported Package Managers

| Installation Method | Update Command | Platform |
|---------------------|----------------|----------|
| Homebrew | `brew upgrade rp1` | macOS, Linux |
| Scoop | `scoop update rp1` | Windows |
| Manual | Provides GitHub release link | All |

## Exit Codes

The command returns specific exit codes to indicate the result:

| Exit Code | Meaning | Action Required |
|-----------|---------|-----------------|
| `0` | Update successful | Restart IDE |
| `1` | Update failed | Check error message, retry or update manually |
| `2` | Manual update required | Download from GitHub releases |

## Examples

### Successful Update (Homebrew)

=== "Claude Code"

    ```bash
    /self-update
    ```

=== "OpenCode"

    ```bash
    /rp1-base-self-update
    ```


**Expected output:**
```
Detecting installation method...
Homebrew installation detected

Updating rp1...
Successfully updated rp1 from 0.2.3 to 0.3.0
```

### Manual Installation

When automatic update is not available:

**Expected output:**
```
Detecting installation method...
Manual installation detected

Automatic update is not available for manual installations.
Please download the latest version from:
https://github.com/rp1-run/rp1/releases/latest
```

### Update Error

When the update fails:

**Expected output:**
```
Error: brew upgrade failed: Permission denied
```

In this case, check file permissions or try updating manually.

## Post-Update Steps

!!! warning "Restart Required"
    After updating, you must restart Claude Code (or OpenCode) to use the new version. The updated CLI will not take effect until the IDE is restarted.

### Verify Update

After restarting your IDE, verify the update was successful:

```bash
rp1 --version
```

## Manual Installation

For manual installations or when automatic update fails, download the latest version from GitHub:

[:octicons-download-24: GitHub Releases](https://github.com/rp1-run/rp1/releases/latest){ .md-button }

### Installation Options

| Method | Command |
|--------|---------|
| Homebrew (macOS/Linux) | `brew install rp1-run/tap/rp1` |
| Scoop (Windows) | `scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket && scoop install rp1` |
| Direct download | Download binary from GitHub releases |

## Plugin Updates

After the binary step, `rp1 update` automatically detects installed tools and refreshes their
plugins:

```
Updating plugins for all detected tools...

Detected tools: Claude Code, OpenCode
Successfully updated: 2/2

Claude Code: Plugins updated
OpenCode: Plugins updated
```

You can also refresh plugins independently:

```bash
rp1 update plugins                  # Update all detected tools
rp1 update plugins claude-code      # Update Claude Code plugins only
rp1 update plugins opencode         # Update OpenCode plugins only
```

## Safe to Run

The command is safe to run even if you are already on the latest version. In this case, the
command reports no updates available:

```
You are already on the latest version (v0.3.0)
```

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Already on latest | Reports "Already up-to-date" |
| Network error | Returns error with suggestion to retry |
| Permission denied | Returns error with suggestion to check permissions |
| Unknown installation | Provides manual update instructions |

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Rebuild KB after major updates

## See Also

- [Installation Guide](../../getting-started/installation.md) - Initial installation instructions
- [GitHub Releases](https://github.com/rp1-run/rp1/releases) - All available versions
