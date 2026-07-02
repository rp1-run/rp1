# settings

Manage rp1 settings files and model tier remappings.

---

## Synopsis

```bash
rp1 settings validate
rp1 settings apply [options]
rp1 settings presets
```

## Description

`rp1 settings` provides subcommands for validating settings files, applying
model tier remappings to installed agent artifacts, and listing available
presets.

rp1 reads settings from two locations:

| Location | Path |
|----------|------|
| Global (user) | `~/.config/rp1/settings.toml` |
| Local (project) | `.rp1/settings.toml` |

When both files exist, project settings take precedence over user settings
(per-platform, per-tier). See [Configuration](../configuration.md) for the
full settings.toml reference.

## Subcommands

### validate

Check settings files for TOML syntax errors and tier remapping semantic
validity.

```bash
rp1 settings validate
```

Validates both global and local settings files. Missing files are not
considered errors. When TOML syntax is valid and a `[models]` section exists,
also runs semantic validation on the tier remapping configuration (preset
names, platform names, model IDs).

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | All files valid (or do not exist) |
| `1` | One or more files have syntax or semantic errors |

### apply

Apply tier remappings to installed agent artifacts.

```bash
rp1 settings apply
rp1 settings apply --preset budget
rp1 settings apply --dry-run
```

Orchestrates: load config, validate, discover installed agents, rewrite
model/effort fields, report results. Only platforms with declared remappings
are modified (currently Claude Code and Codex).

**Options:**

| Option | Description |
|--------|-------------|
| `--preset <name>` | Apply a named preset directly, ignoring settings.toml `[models]` |
| `--dry-run` | Preview changes without modifying files |

When `--preset` is passed on the command line, it replaces custom mappings
entirely. When the preset comes from settings.toml, per-platform overrides in
the same file are merged on top of preset values.

After modifying Claude Code artifacts, the command refreshes the Claude Code
plugin cache so changes take effect in the current session.

### presets

List available tier remapping presets with their per-platform model mappings.

```bash
rp1 settings presets
```

Displays all presets ordered by cost (budget, standard, premium) with the
concrete model ID for each tier on each supported platform.

**Available presets:**

| Preset | Description |
|--------|-------------|
| `budget` | Cost-optimized: uses only fast-class models across all tiers |
| `standard` | Balanced: collapses deep tier to sonnet-class for users without Opus access |
| `premium` | Full capability: matches build defaults with frontier-class models at deep tier |

See [Configuration](../configuration.md#presets) for the full preset model
mappings.

## Examples

```bash
# Validate all settings files
rp1 settings validate

# Apply tier remappings from settings.toml
rp1 settings apply

# Apply the budget preset directly
rp1 settings apply --preset budget

# Preview what would change without modifying files
rp1 settings apply --dry-run

# List available presets with their model mappings
rp1 settings presets
```

## See Also

- [Configuration](../configuration.md) - settings.toml `[models]` reference
- [update](update.md) - Automatic re-apply after plugin refresh
