# check-update

Check whether a newer version of rp1 is available and report stanza staleness.

---

## Synopsis

```bash
rp1 check-update [options]
```

## Description

`rp1 check-update` queries the latest rp1 release and compares it against the
installed version. When run inside an rp1 project, it also scans fence markers
in `CLAUDE.md`, `AGENTS.md`, and `.gitignore` for staleness and suggests
`rp1 migrate` when stanza content is outdated.

Results are cached locally to avoid repeated network requests. Use `--force` to
bypass the cache.

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output result as JSON |
| `--format <format>` | Output format: `human` (default) or `hook-text` |
| `--timeout <ms>` | API timeout in milliseconds (default: 5000) |
| `--force` | Bypass cache and force a fresh check |
| `--cache-ttl <hours>` | Cache TTL in hours (default: 24) |
| `--help`, `-h` | Display help information |

`--json` and `--format` are mutually exclusive.

## Output

### Human output

```
rp1 v0.7.0 is installed.

A new version is available: v0.7.1

Run 'rp1 self-update' or '/self-update' to update.

Stanza configuration is outdated (v0.6.0 -> v0.7.1).
  Outdated: CLAUDE.md, AGENTS.md
  Run 'rp1 migrate' to update.

(cached 3 minutes ago)
```

The stanza section only appears when the current directory is an rp1 project
and at least one fence marker is older than the version bundled with the CLI.
When all fences are current or no project exists, the section is omitted.

### JSON output

```json
{
  "current_version": "0.7.0",
  "latest_version": "0.7.1",
  "update_available": true,
  "release_url": "https://github.com/rp1-run/rp1/releases/tag/v0.7.1",
  "error": null,
  "cached": true,
  "cache_age_hours": 0.5,
  "cache_expires_in_hours": 23.5,
  "fence_version": {
    "current": "0.6.0",
    "latest": "0.7.1",
    "update_available": true,
    "stale_files": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

The `fence_version` object is present only when the command runs inside an rp1
project. Fields:

| Field | Type | Description |
|-------|------|-------------|
| `current` | `string \| null` | Oldest fence version found (`null` when all markers are legacy) |
| `latest` | `string` | The fence version bundled with the installed CLI |
| `update_available` | `boolean` | `true` when any stanza is outdated |
| `stale_files` | `string[]` | List of files with outdated fence markers |

### Hook-text output

The `hook-text` format produces a single compact line for use in shell hooks
and prompts. When an update is available, it emits an actionable update line:

```
rp1 update available: v0.7.0 -> v0.7.1 | Run /self-update to update
```

When no update is available, it emits the current running version instead:

```
rp1 is running v0.7.1
```

When stale fences are detected, it appends a stanza suffix to either form:

```
rp1 is running v0.7.1 | stanza update: run rp1 migrate
```

## Examples

```bash
rp1 check-update                  # Human-readable output
rp1 check-update --json           # JSON output
rp1 check-update --force          # Bypass cache
rp1 check-update --timeout 10000  # 10-second timeout
rp1 check-update --format hook-text  # Single-line for shell hooks
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Check completed successfully and emitted status output when requested |
| 1 | The check failed, or hook-text output could not be emitted after a partial version lookup |
| 2 | Hook-text mode failed before version status could be determined |

## See Also

- [`update`](update.md) - Update the rp1 CLI and plugins
- [`rp1 migrate`](rp1-migrate.md) - Migrate and upgrade stanza content
- [Fence Versioning](fence-versioning.md) - How fence version markers work
