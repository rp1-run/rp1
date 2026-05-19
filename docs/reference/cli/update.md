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
| `gemini` | Refresh Gemini CLI extension assets assets only |

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
rp1 update plugins gemini --dry-run
```

## Gemini Extension Refresh

`rp1 update plugins gemini` is the targeted refresh path for Gemini CLI
extension assets. Gemini is a first-class target, and refresh is
also included in `rp1 update plugins all` when Gemini CLI is detected. The
command updates only rp1-owned files under the rp1 Gemini extension
directories, such as `~/.gemini/extensions/rp1-base/` and
`~/.gemini/extensions/rp1-dev/`.

The command reports `Lifecycle stage: update` and one of these states or
results:

| Output | Meaning | Next action |
|--------|---------|-------------|
| `Lifecycle state: current` | Gemini assets already match the current manifest. | Restart Gemini CLI only if you recently changed assets, then run `rp1 verify gemini`. |
| `Lifecycle state: missing` or `partial` | Some or all manifest-owned Gemini assets are absent. | Run `rp1 update plugins gemini -y` or `rp1 install gemini`, restart Gemini CLI, then verify. |
| `Lifecycle state: stale` | At least one manifest-owned asset differs from the current build. | Run `rp1 update plugins gemini -y`, restart Gemini CLI, then verify. |
| `Lifecycle state: blocked` | rp1 could not safely inspect or refresh an asset. | Follow the printed `Next action`, usually fixing permissions under the Gemini extension directory. |
| `Lifecycle result: refreshed` | rp1 refreshed manifest-owned Gemini assets. | Restart Gemini CLI, then run `rp1 verify gemini`. |
| `Lifecycle state: failed` | Refresh failed after command execution started. | Check file permissions under `~/.gemini/extensions/`, then rerun `rp1 update plugins gemini`. |

Use `--dry-run` to preview the files that would be refreshed. The targeted
`gemini` command is useful when you want Gemini-specific lifecycle details. The
[Gemini CLI platform guide](../platforms/gemini.md) explains the current
support matrix and stale-asset recovery boundary.

Refreshing Gemini assets restores the generated workflow assets. The current
support matrix supports all 15 Gemini workflow rows.
Run `rp1 verify gemini --workflow <workflow-id>` after refresh to see workflow
attribution.

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

For Gemini, rerun the targeted refresh path so the command can print
Gemini-specific lifecycle state and remediation:

```bash
rp1 update plugins gemini --dry-run
rp1 update plugins gemini -y
rp1 verify gemini --feature-id <feature-id>
```

## See Also

- [install](install.md)
- [verify](verify.md)
- [uninstall](uninstall.md)
- [Gemini CLI Platform Guide](../platforms/gemini.md)
- [Troubleshooting](../../troubleshooting/index.md)
