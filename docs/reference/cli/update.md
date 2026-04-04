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
```

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
```

## See Also

- [install](install.md)
- [Troubleshooting](../../troubleshooting/index.md)
