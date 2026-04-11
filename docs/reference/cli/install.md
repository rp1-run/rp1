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
```

### Install everywhere detected

```bash
rp1 install all
```

### Preview without changing anything

```bash
rp1 install codex --dry-run
```

## Verification

After installation, verify the target host:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
```

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

## Troubleshooting

### Tool not found

Confirm the host is installed and on your `PATH`:

```bash
which claude
which opencode
which codex
```

### Plugins do not appear after install

1. Restart the host tool
2. Run the matching `rp1 verify ...` command
3. Check the install location for the host you are using

### Permission denied

Confirm you can write to the relevant configuration directory:

```bash
ls -la ~/.config/opencode/
ls -la ~/.codex/
```

## See Also

- [Installation Guide](../../getting-started/installation.md)
- [update](update.md)
