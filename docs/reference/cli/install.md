# install

Install rp1 plugins for supported host tools.

---

## Synopsis

```bash
rp1 install <subcommand> [options]
```

## Description

Use `rp1 install` when you want to install or refresh rp1 for a specific host
tool, or for every detected host on the machine.

Supported targets:

- Claude Code
- OpenCode
- Codex
- Copilot CLI

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

Installs rp1 into GitHub Copilot CLI using the native marketplace flow. rp1 stages a local marketplace, registers it as `rp1-local`, and then installs or updates the required Copilot plugins from that marketplace.

This writes:

- local marketplace metadata to `~/.rp1/copilot/marketplace/marketplace.json`
- staged plugin roots to `~/.rp1/copilot/marketplace/plugins/rp1-*`
- native installed plugins to `~/.copilot/installed-plugins/rp1-local/rp1-*`

Unsupported legacy paths under `~/.config/github-copilot/` are not a valid install target.

Requires the GitHub CLI (`gh`) version 2.74.0 or later with `gh copilot -- plugin --help` available.

### `install all`

```bash
rp1 install all [options]
```

Detects installed tools and installs rp1 to every supported one it finds.

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
```

### Install everywhere detected

```bash
rp1 install all
```

### Preview without changing anything

```bash
rp1 install codex --dry-run
rp1 install copilot --dry-run
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

## Verification

After installation, verify the target host:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

For Copilot, the clean success signal is `healthy_native`. A `mixed_native_and_legacy` result means the native install works, but old rp1 files still need cleanup under `~/.config/github-copilot/`.

## Listing Installed Skills

Use `rp1 list` to inspect installed skills across supported hosts:

```bash
rp1 list
rp1 list --json
```

`--json` emits one object per canonical installed skill. Alongside identity and
host-install details, it includes the registry-backed discovery metadata used by
guide and init:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Platform-neutral skill name such as `guide` |
| `description` | `string` | Skill description |
| `plugin` | `string` | Plugin id such as `base`, `dev`, or `utils` |
| `canonical_name` | `string` | Canonical id such as `base:guide` |
| `user_facing_name` | `string` | User-facing canonical id such as `rp1-base:guide` |
| `category` | `string` | Canonical discovery category such as `knowledge` or `review` |
| `is_workflow` | `boolean` | Whether the skill is a workflow-style orchestrator |
| `key_args` | `string[]` | Primary argument names from `SKILL.md` frontmatter |
| `run_policy` | `string` | Workflow run policy (`fresh` or `resumable`) when the skill is a tracked workflow |
| `identity_args` | `string[]` | Workflow identity arguments. `[]` for fresh workflows; argument names for resumable workflows |
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
| Copilot CLI staged marketplace | `~/.rp1/copilot/marketplace/` |
| Copilot CLI native installed plugins | `~/.copilot/installed-plugins/rp1-local/` |
| Copilot CLI legacy leftovers | `~/.config/github-copilot/` |

## Troubleshooting

### Tool not found

Confirm the host is installed and on your `PATH`:

```bash
which claude
which opencode
which codex
which gh         # For Copilot CLI
gh copilot -- plugin --help
```

### Plugins do not appear after install

1. Restart the host tool
2. Run the matching `rp1 verify ...` command
3. For Copilot, confirm `gh copilot -- plugin list` includes `rp1-base@rp1-local` and `rp1-dev@rp1-local`
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
- [update](update.md)
