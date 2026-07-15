# Settings

Arcade settings live in the `[arcade]` section of rp1's canonical TOML
configuration files. This places theme, downsampling, and model tier
preferences in a single file.

---

## Settings File Locations

| Scope | Path | Purpose |
|-------|------|---------|
| **Global** | `~/.config/rp1/settings.toml` | Default settings for all projects |
| **Project** | `.rp1/settings.toml` | Project-specific overrides |

Settings resolve in cascade order: **project > global > application default**.
Each key is merged independently -- a project file only needs to contain the
keys it wants to override.

---

## Available Settings

### Theme

Controls the UI color scheme.

| Value | Description |
|-------|-------------|
| `"system"` | Follow OS preference (default) |
| `"light"` | Warm stone light theme |
| `"dark"` | Warm stone dark theme |

### Downsampling

Controls event compression for historical runs.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `thresholdHours` | number | `24` | Compress events for runs completed longer than this |

Completed runs older than the threshold have intermediate events aggregated
while preserving key events (step-start, step-complete, error, waiting-input).

---

## TOML Schema

```toml
[arcade]
theme = "system"

[arcade.downsampling]
thresholdHours = 24
```

### Field Reference

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `theme` | `"light"` \| `"dark"` \| `"system"` | No | `"system"` |
| `downsampling.thresholdHours` | number | No | `24` |

All fields are optional. Missing fields use application defaults.

---

## Examples

### Minimal Global Settings

Add to `~/.config/rp1/settings.toml`:

```toml
[arcade]
theme = "dark"
```

### Project Override

Add to `.rp1/settings.toml` in your project:

```toml
[arcade]
theme = "light"

[arcade.downsampling]
thresholdHours = 48
```

This project uses light theme and retains full event detail for 48 hours,
regardless of global settings.

### Cascade Example

Given:

User-level `~/.config/rp1/settings.toml`:

```toml
[arcade]
theme = "dark"

[arcade.downsampling]
thresholdHours = 12
```

Project-level `.rp1/settings.toml`:

```toml
[arcade]
theme = "light"
```

Result:
- `theme`: `"light"` (project overrides global)
- `downsampling.thresholdHours`: `12` (inherited from global)

### Combined with Model Settings

Arcade and model tier settings coexist in the same file:

```toml
[models]
preset = "standard"

[arcade]
theme = "dark"

[arcade.downsampling]
thresholdHours = 48
```

---

## Applying Changes

Settings are loaded at server startup. To apply changes:

1. Edit `settings.toml`
2. Restart Arcade (`rp1 arcade`)

Changes take effect immediately on restart.

---

## Migrating from settings.json

If you previously configured Arcade via `settings.json`, run `rp1 migrate` to
convert your settings automatically. The migration reads each `settings.json`,
writes the equivalent `[arcade]` entries into `settings.toml`, and renames the
original to `settings.json.migrated`.

If you start Arcade without running `rp1 migrate` first, the daemon detects
leftover `settings.json` files and migrates them automatically on startup.

---

## Related

- [Configuration Reference](../reference/configuration.md) - Model tier remapping and full settings reference
- [Dashboard](dashboard.md) - Status monitoring dashboard
- [Keyboard Shortcuts](keyboard-shortcuts.md) - Navigation shortcuts
