# install

Install rp1 plugins for supported host tools and Gemini CLI extension
assets.

---

## Synopsis

```bash
rp1 install <subcommand> [options]
```

## Description

Use `rp1 install` when you want to install or refresh rp1 for a specific host
tool, or for every detected stable host on the machine. Gemini CLI is a
first-class first-class Gemini target and participates in default setup when it
is detected.

Supported targets:

- Claude Code
- OpenCode
- Codex
- Copilot CLI
- Gemini CLI Gemini CLI extension assets

## Subcommands

### `install claude-code`

```bash
rp1 install claude-code [options]
```

Installs rp1 into Claude Code.

### `install opencode`

```bash
rp1 install opencode [options]
```

Installs rp1 into OpenCode.

### `install codex`

```bash
rp1 install codex [options]
```

Installs rp1 into Codex. This writes:

- skills to `~/.codex/skills/`
- agents to `~/.codex/agents/rp1/`
- the rp1-managed section in `~/.codex/config.toml`

### `install copilot`

```bash
rp1 install copilot [options]
```

Installs or updates rp1 for GitHub Copilot CLI through the supported Copilot
plugin commands. Use this target when Copilot is your coding host or when
`rp1 verify copilot` reports that the rp1 plugins are missing or out of date.

Requires the standalone GitHub Copilot CLI (`copilot`) with `copilot plugin --help` available.

### `install gemini`

```bash
rp1 install gemini [options]
```

Installs Gemini CLI extension assets from the current
`dist/gemini/` build output. Validation-only smoke, proof, and manual-copy
assets are not installed as normal product workflows. Review the
[Gemini CLI platform guide](../platforms/gemini.md) for lifecycle and
support-matrix details.

### `install all`

```bash
rp1 install all [options]
```

Detects installed tools and installs rp1 to every detected stable target it
finds, including Gemini CLI when it is available on `PATH`.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | | Show what would be installed without changing anything |
| `--strict` | | Fail if required source artifacts are missing |
| `--yes` | `-y` | Skip confirmation prompts |
| `--help` | `-h` | Display help information |

## Examples

### Install for a single host

```bash
rp1 install claude-code
rp1 install opencode
rp1 install codex
rp1 install copilot
rp1 install gemini
```

### Install everywhere detected

```bash
rp1 install all
```

### Preview without changing anything

```bash
rp1 install codex --dry-run
rp1 install copilot --dry-run
rp1 install gemini --dry-run
```

## Contributor Local Install (`just install`)

Contributors building rp1 locally use `just install` to compile and install a
fresh binary and its assets. When Arcade is already running, the install flow
handles daemon replacement automatically:

1. **Before build** -- the install recipe stops the active daemon through the
   shared lifecycle manager and records the port it was serving on.
2. **Build and install** -- the web UI cache is cleared and the new binary is
   compiled and installed to all detected host tools.
3. **After install** -- if Arcade was running before the install, the new
   `./bin/rp1` binary restarts the daemon on the previously recorded port.
   If Arcade was not running, no daemon is started as a side effect.

This means you do not need to manually stop and restart Arcade around
`just install`. The flow preserves the prior port so browser tabs and
bookmarks continue to work.

### What you should see

| Before install | After install |
|----------------|---------------|
| Arcade was running on port 7710 | Arcade is restarted on port 7710 using the new build |
| Arcade was running on port 8080 | Arcade is restarted on port 8080 using the new build |
| Arcade was not running | No daemon is started; the install completes cleanly |

### Manual recovery

Under normal conditions no manual steps are needed. If an install is
interrupted mid-flow, the next `just install` or `rp1 arcade` call detects
and cleans up stale restart markers and daemon state automatically.

## Troubleshooting Copilot Install Locations

Most users should rely on `rp1 install copilot` and `rp1 verify copilot` rather
than inspecting generated plugin files. The locations below are useful only
when troubleshooting a Copilot install that still loads an old plugin version.

- rp1 prepares Copilot plugin data under `~/.rp1/copilot/marketplace/`.
- Copilot installs the active plugins under
  `~/.copilot/installed-plugins/rp1-local/rp1-*`.
- Unsupported legacy paths under `~/.config/github-copilot/` are not a valid
  install target.

## Verification

After installation, verify the target host:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
rp1 verify gemini
```

For Copilot, the clean success signal is `healthy_native`. A `mixed_native_and_legacy` result means the native install works, but old rp1 files still need cleanup under `~/.config/github-copilot/`.

For Gemini, verification reports Gemini extension lifecycle state,
support-matrix readiness, and optional feature evidence:

```bash
rp1 verify gemini
rp1 verify gemini --feature-id <feature-id>
```

The Gemini section uses `Support: first-class (Gemini CLI extension assets)`
and reports `State` values such as `ready`,
`degraded_missing_binary`, `degraded_missing_command`,
`degraded_trust_or_approval`, or `registration_failed`.

The `Manifest lifecycle` section reports `Stage: verify`, an asset count, and a
Gemini-specific lifecycle `State`:

| State | Meaning | Next action |
|-------|---------|-------------|
| `current` | All rp1-owned Gemini assets match the manifest. | Restart Gemini CLI if assets were just installed, then run installed rp1 workflows from Gemini slash commands. |
| `removed` | No rp1-owned Gemini assets are installed. | Run `rp1 install gemini` before using Gemini commands. |
| `missing` | One manifest-owned asset is missing. | Run `rp1 install gemini` to restore it. |
| `partial` | More than one, but not all, manifest-owned assets are missing. | Reinstall the complete Gemini asset set with `rp1 install gemini`. |
| `stale` | One or more assets differ from the current manifest. | Run `rp1 install gemini` or `rp1 update plugins gemini` to refresh assets. |
| `blocked` | rp1 could not read one or more Gemini extension assets. | Fix local file permissions or trust/approval blockers, then rerun `rp1 verify gemini`. |

Use `--workflow` to attribute a workflow attempt against the Gemini support
matrix:

```bash
rp1 verify gemini --workflow dev:build
```

The current Gemini support matrix supports all 15 Gemini workflow rows.
Supported workflow attribution reports the first-class Gemini evidence source for
the row.

Gemini may still require workspace trust, shell approval, or project agent
acknowledgement when Gemini extension commands run. rp1 reports those as
boundary states and remediation actions; it does not grant trust or approval
automatically. The [verify reference](verify.md) and
[Gemini CLI platform guide](../platforms/gemini.md) explain the verifier output
and current support matrix.

## Listing Installed Skills

Use `rp1 list` to inspect installed skills across supported hosts:

```bash
rp1 list
rp1 list --json
```

`--json` emits one object per canonical installed skill. Alongside identity and
host-install details, it includes discovery metadata used by `guide`, `init`,
and automation.

The field names below are shown because they are part of the JSON output. Normal
setup does not require memorizing them; they are most useful when scripting
installation checks or debugging why a workflow resumes.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Platform-neutral skill name such as `guide` |
| `description` | `string` | Skill description |
| `plugin` | `string` | Plugin id such as `base`, `dev`, or `utils` |
| `canonical_name` | `string` | Canonical id such as `base:guide` |
| `user_facing_name` | `string` | User-facing canonical id such as `rp1-base:guide` |
| `category` | `string` | Canonical discovery category such as `knowledge` or `review` |
| `is_workflow` | `boolean` | Whether the skill is a workflow-style orchestrator |
| `key_args` | `string[]` | Primary argument names shown by discovery and setup flows |
| `run_policy` | `string` | Resume mode (`fresh` or `resumable`) for tracked workflows |
| `identity_args` | `string[]` | Arguments used to identify a resumable workflow run. `[]` for fresh workflows |
| `installed_platforms` | `string[]` | Hosts where the skill is installed |
| `invocations` | `object` | Host-specific invocation strings keyed by platform |

These discovery fields are additive. Existing consumers remain compatible if
they ignore keys they do not use.

## Typical Locations

| Host | Typical Install Location |
|------|--------------------------|
| OpenCode | `~/.config/opencode/plugins/` |
| Codex skills | `~/.codex/skills/` |
| Codex agents | `~/.codex/agents/rp1/` |
| Gemini extensions | `~/.gemini/extensions/rp1-base/`, `~/.gemini/extensions/rp1-dev/` |

Copilot install paths are covered in
[Troubleshooting Copilot Install Locations](#troubleshooting-copilot-install-locations)
because most users should use `rp1 install copilot` and `rp1 verify copilot`
instead of inspecting Copilot plugin files directly.

## Troubleshooting

### Tool not found

Confirm the host is installed and on your `PATH`:

```bash
which claude
which opencode
which codex
which copilot    # For Copilot CLI
copilot version
copilot plugin --help
```

### Plugins do not appear after install

1. Restart the host tool
2. Run the matching `rp1 verify ...` command
3. For Copilot, confirm `copilot plugin list` includes `rp1-base@rp1-local` and `rp1-dev@rp1-local`
4. Do not use `~/.config/github-copilot/...` as a Copilot success signal

### Permission denied

Confirm you can write to the relevant configuration directory:

```bash
ls -la ~/.config/opencode/
ls -la ~/.codex/
ls -la ~/.rp1/copilot/
```

## See Also

- [Installation Guide](../../getting-started/installation.md)
- [verify](verify.md)
- [Gemini CLI Platform Guide](../platforms/gemini.md)
- [update](update.md)
