# Configuration

rp1 settings are stored in TOML files at two locations. Project-level settings
take precedence over user-level settings when both exist.

| Scope | Path |
|-------|------|
| User (global) | `~/.config/rp1/settings.toml` |
| Project (local) | `.rp1/settings.toml` |

---

## Model Tier Remapping

The `[models]` section lets you remap abstract model tiers (deep, standard,
fast) to concrete model identifiers per platform. This controls which models
rp1 agents use after installation, without requiring a rebuild.

### Schema

```toml
[models]
preset = "standard"              # Optional: apply a named preset as base

[models.claude-code]             # Per-platform tier overrides
deep = "sonnet"
standard = "sonnet"
fast = "haiku"

[models.codex]
deep = "gpt-5.4"
standard = "gpt-5.4"
fast = "gpt-5.4-mini"
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `preset` | string | Named preset to use as base configuration. Valid values: `budget`, `standard`, `premium` |
| `[models.<platform>]` | table | Per-platform tier-to-model mappings. Supported platforms: `claude-code`, `codex` |

### Tier Keys

Each platform sub-table accepts these tier keys:

| Tier | Description |
|------|-------------|
| `deep` | Reasoning-intensive agents (architects, reviewers, investigators) |
| `standard` | General-purpose agents (builders, editors, reporters) |
| `fast` | Lightweight agents (discovery, formatting, simple transforms) |

Omitted tiers keep the build-time default model for that platform.

### Valid Model Identifiers

| Platform | Valid Models |
|----------|-------------|
| `claude-code` | `opus`, `sonnet`, `haiku`, `fable` |
| `codex` | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` |

Other platforms (`copilot`, `opencode`, `antigravity`) do not support per-agent
model fields in their installed artifacts. Remappings for these platforms
produce a validation warning and have no effect.

---

## Presets

Presets are complete tier-to-model configurations ordered by cost. Use a preset
as a starting point, optionally overriding individual tiers per platform.

### budget

Cost-optimized: uses only fast-class models across all tiers.

| Platform | deep | standard | fast |
|----------|------|----------|------|
| `claude-code` | `haiku` | `haiku` | `haiku` |
| `codex` | `gpt-5.4-mini` | `gpt-5.4-mini` | `gpt-5.4-mini` |

### standard

Balanced: collapses deep tier to sonnet-class for users without Opus access.

| Platform | deep | standard | fast |
|----------|------|----------|------|
| `claude-code` | `sonnet` | `sonnet` | `haiku` |
| `codex` | `gpt-5.4` | `gpt-5.4` | `gpt-5.4-mini` |

### premium

Full capability: matches build defaults with frontier-class models at deep
tier.

| Platform | deep | standard | fast |
|----------|------|----------|------|
| `claude-code` | `opus` | `sonnet` | `haiku` |
| `codex` | `gpt-5.5` | `gpt-5.4` | `gpt-5.4-mini` |

---

## Merge Precedence

When both user and project settings define `[models]` sections:

1. **Preset**: project-level preset overrides user-level preset.
2. **Per-platform tiers**: project-level tier mappings override user-level
   mappings for the same platform and tier. Tiers defined only at the
   user level are preserved.
3. **Preset + overrides**: when a preset is set in settings.toml (not via
   `--preset` CLI flag), explicit `[models.<platform>]` entries in the same
   file are merged on top of preset values.

### Example: Hybrid Configuration

User-level `~/.config/rp1/settings.toml`:

```toml
[models]
preset = "standard"
```

Project-level `.rp1/settings.toml`:

```toml
[models.claude-code]
deep = "opus"
```

Result: the standard preset applies as the base, but the project overrides
the Claude Code deep tier to `opus`. All other tiers remain at preset values.

---

## Effort Auto-Strip

When a tier is remapped to a fast-class model (e.g., `haiku` on Claude Code,
`gpt-5.4-mini` on Codex), the effort field is automatically stripped from
agent artifacts during `rp1 settings apply`. Fast-class models do not support
effort control, so the effort parameter would have no effect.

The apply command reports each effort adjustment so you can see which agents
are affected.

---

## Protected Agent Warnings

Certain reasoning-critical agents are marked as protected. When a remapping
would downgrade a protected agent to a lower tier than its build default, the
apply command emits a warning. The remapping is still applied, but the warning
alerts you that reasoning quality may be reduced.

Protected agents include architects, reviewers, investigators, and other
agents where reasoning depth directly affects output quality.

---

## Automatic Re-apply

When you run `rp1 update` to refresh plugins, rp1 automatically re-applies
your `[models]` tier remappings if configured. This ensures that updated
agent artifacts retain your model preferences. The re-apply is non-blocking:
failures produce warnings but do not interrupt the update.

See [`rp1 update`](cli/update.md) for details.

---

## Configuration Examples

### Preset Only

Apply the standard preset with no customization:

```toml
[models]
preset = "standard"
```

### Custom Per-Platform

Set specific models per platform without a preset:

```toml
[models.claude-code]
deep = "sonnet"
standard = "sonnet"
fast = "haiku"

[models.codex]
deep = "gpt-5.4"
fast = "gpt-5.4-mini"
```

Omitted tiers (e.g., `standard` under `[models.codex]`) keep the build
default.

### Preset with Overrides

Use a preset as a base and override specific tiers:

```toml
[models]
preset = "budget"

[models.claude-code]
deep = "sonnet"
```

Result: all tiers start at budget values, but Claude Code deep is upgraded
to `sonnet`.

---

## Validation

Run `rp1 settings validate` to check your configuration for:

- TOML syntax errors in both settings files
- Unknown preset names
- Unknown or unsupported platform names
- Invalid model identifiers for a platform
- Effort compatibility warnings

See [`rp1 settings validate`](cli/settings.md#validate) for exit codes and
output details.

---

## See Also

- [`settings`](cli/settings.md) - CLI command reference for validate, apply, and presets
- [The `.rp1` Directory](../getting-started/rp1-directory.md) - Project directory structure
