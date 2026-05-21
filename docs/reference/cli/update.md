# update

Update the rp1 CLI and installed plugins.

---

## Synopsis

```bash
rp1 update [options]
rp1 update plugins [tool]
```

## Description

`rp1 update` refreshes the rp1 CLI itself. You can then update plugins for the
host tools you use.

## Usage

### Update the CLI

```bash
rp1 update
```

This checks for the latest release, installs it safely, and can then refresh
plugins for detected tools.

### Check for updates only

```bash
rp1 update --check
```

### Update plugins only

```bash
rp1 update plugins [tool]
```

Supported `tool` values:

| Value | Description |
|-------|-------------|
| `all` | Update plugins for all detected tools |
| `claude-code` | Update Claude Code only |
| `opencode` | Update OpenCode only |
| `codex` | Update Codex only |
| `copilot` | Update GitHub Copilot CLI only |
| `antigravity` | Refresh Antigravity CLI plugin assets only |

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--check` | | Check whether an update is available |
| `--dry-run` | | Preview the work without applying it |
| `--force` | | Reinstall even if already on the latest version |
| `--yes` | `-y` | Skip confirmation prompts |
| `--help` | `-h` | Display help information |

## Examples

```bash
rp1 update
rp1 update --check
rp1 update plugins all
rp1 update plugins codex
rp1 update plugins copilot
rp1 update plugins antigravity --dry-run
```

## Antigravity Plugin Refresh

`rp1 update plugins antigravity` is the targeted refresh path for Antigravity
CLI plugin assets. Antigravity is the active Google host target, and refresh is
also included in `rp1 update plugins all` when `agy` is detected. The command
updates only rp1-owned files under the Antigravity plugin directories, such as
`~/.gemini/antigravity-cli/rp1-base/` and
`~/.gemini/antigravity-cli/rp1-dev/`.

The command reports `Lifecycle stage: update` and one of these states or
results:

| Output | Meaning | Next action |
|--------|---------|-------------|
| `Lifecycle state: current` | Antigravity assets already match the current manifest. | Restart Antigravity CLI only if you recently changed assets, then run `rp1 verify antigravity`. |
| `Lifecycle state: missing` or `partial` | Some or all manifest-owned Antigravity assets are absent. | Run `rp1 update plugins antigravity -y` or `rp1 install antigravity`, restart Antigravity CLI, then verify. |
| `Lifecycle state: stale` | At least one manifest-owned asset differs from the current build. | Run `rp1 update plugins antigravity -y`, restart Antigravity CLI, then verify. |
| `Lifecycle state: blocked` | rp1 could not safely inspect or refresh an asset. | Follow the printed `Next action`, usually fixing permissions under the Antigravity plugin directory. |
| `Lifecycle result: refreshed` | rp1 refreshed manifest-owned Antigravity assets. | Restart Antigravity CLI, then run `rp1 verify antigravity`. |
| `Lifecycle state: failed` | Refresh failed after command execution started. | Check file permissions under `~/.gemini/antigravity-cli/`, then rerun `rp1 update plugins antigravity`. |

Use `--dry-run` to preview the files that would be refreshed. The targeted
`antigravity` command is useful when you want Antigravity-specific lifecycle
details. The [Antigravity CLI platform guide](../platforms/antigravity.md)
explains the current support matrix, dynamic delegation boundary, and stale-asset
recovery boundary.

Refreshing Antigravity assets restores the generated workflow assets. Run
`rp1 verify antigravity --workflow <workflow-id>` after refresh to see workflow
attribution and any dynamic delegation limitation.

## Safety

rp1 validates the downloaded binary before replacing the current one, so a bad
download does not leave you with a broken CLI.

## Troubleshooting

### Permission denied

Check where `rp1` is installed:

```bash
which rp1
```

If you installed rp1 through a package manager, use that package manager to
upgrade it.

### Plugin update failed

If the CLI updated but plugin refresh failed:

```bash
rp1 update plugins all
rp1 install claude-code
rp1 install opencode
rp1 install codex
rp1 install copilot
```

For Antigravity, rerun the targeted refresh path so the command can print
Antigravity-specific lifecycle state and remediation:

```bash
rp1 update plugins antigravity --dry-run
rp1 update plugins antigravity -y
rp1 verify antigravity --workflow <workflow-id>
```

## See Also

- [install](install.md)
- [verify](verify.md)
- [uninstall](uninstall.md)
- [Antigravity CLI Platform Guide](../platforms/antigravity.md)
- [Troubleshooting](../../troubleshooting/index.md)
