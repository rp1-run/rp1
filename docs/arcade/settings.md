# Settings

Arcade uses a cascading settings system that allows global defaults with
project-specific overrides. Settings are stored as JSON files that users edit
directly.

---

## Settings File Locations

| Scope | Path | Purpose |
|-------|------|---------|
| **Global** | `~/.config/rp1/settings.json` | Default settings for all projects |
| **Project** | `.rp1/settings.json` | Project-specific overrides |

Settings resolve in cascade order: **project > global > application default**.

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

Completed runs older than the threshold have intermediate events aggregated while preserving key events (step-start, step-complete, error, waiting-input).

---

## JSON Schema

```json
{
  "version": 1,
  "theme": "system",
  "downsampling": {
    "thresholdHours": 24
  }
}
```

### Field Reference

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `version` | number | No | `1` |
| `theme` | `"light"` \| `"dark"` \| `"system"` | No | `"system"` |
| `downsampling.thresholdHours` | number | No | `24` |

All fields are optional. Missing fields use application defaults.

---

## Examples

### Minimal Global Settings

Create `~/.config/rp1/settings.json`:

```json
{
  "theme": "dark"
}
```

### Project Override

Create `.rp1/settings.json` in your project:

```json
{
  "theme": "light",
  "downsampling": {
    "thresholdHours": 48
  }
}
```

This project uses light theme and retains full event detail for 48 hours, regardless of global settings.

### Cascade Example

Given:
- Global: `{"theme": "dark", "downsampling": {"thresholdHours": 12}}`
- Project: `{"theme": "light"}`

Result:
- `theme`: `"light"` (project overrides global)
- `downsampling.thresholdHours`: `12` (inherited from global)

---

## Version Field

The `version` field tracks the settings schema version for future migrations.

| Behavior | Description |
|----------|-------------|
| **Current version** | `1` |
| **Older versions** | Automatically migrated to current |
| **Newer versions** | Warning logged, unknown fields ignored |

Always include the `version` field when creating settings files:

```json
{
  "version": 1,
  "theme": "dark"
}
```

If a settings file has a version higher than supported, the server logs a warning and uses defaults for any unrecognized fields.

---

## Applying Changes

Settings are loaded at server startup. To apply changes:

1. Edit the settings JSON file
2. Restart Arcade (`rp1 arcade`)

Changes take effect immediately on restart.

---

## Related

- [Dashboard](dashboard.md) - Status monitoring dashboard
- [Keyboard Shortcuts](keyboard-shortcuts.md) - Navigation shortcuts
