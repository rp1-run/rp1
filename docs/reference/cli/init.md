# init

Initialize rp1 in a repository and prepare it for workflow use.

---

## Synopsis

```bash
rp1 init [options]
```

## Description

`rp1 init` is the normal entry point for bringing rp1 into an existing
repository. It prepares the project, detects supported hosts, installs
integrations where automatic setup is available, and prints the next actions.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Accept safe defaults without prompting |
| `--interactive` | `-i` | Force interactive mode even without a TTY |

## Host Support

| Host | Detected by `init` | Instruction file | Automatic integration setup |
|------|---------------------|------------------|-----------------------------|
| Claude Code | Yes | `CLAUDE.md` | Yes |
| OpenCode | Yes | `AGENTS.md` | Yes |
| GitHub Copilot CLI | Yes | `AGENTS.md` | Yes |
| Codex | Yes | `AGENTS.md` | No, run `rp1 install codex` after `init` |

Use [Installation and Host Setup](../../getting-started/installation.md) when
you need the full setup path for a specific host.

## What Gets Configured

### Project Directories

`init` prepares the standard rp1 layout:

```text
.rp1/
├── project_id
├── context/
├── work/
└── settings.toml
```

### Instruction File

rp1 adds project guidance to the instruction file your host reads:

- Claude Code: `CLAUDE.md`
- OpenCode: `AGENTS.md`
- Codex: `AGENTS.md`
- GitHub Copilot CLI: `AGENTS.md`

Those files tell the host how to load project context and invoke rp1 workflows.

When both `CLAUDE.md` and `AGENTS.md` exist in the same project, `init` uses
**single-stanza injection**: the full rp1 stanza goes into `AGENTS.md` only, and
`CLAUDE.md` receives a one-line `@AGENTS.md` import reference inside its fence.
This avoids duplicate content that drifts across the two files.

When only one instruction file exists, it receives the full stanza.

### Skill Awareness

The injected stanza includes a condensed skill-awareness pointer that tells the
host about installed plugins and directs it to `/guide` for skill discovery. This
replaces the previous full category table with a compact reference:

- Lists installed plugins (e.g., `rp1-base`, `rp1-dev`)
- Points to `/guide` for task-based skill lookup
- Includes three short suggestion rules

### Ignore Defaults

The recommended setup keeps project context shareable while treating local work
artifacts as disposable:

- Track `.rp1/context/`
- Ignore `.rp1/work/`
- Ignore `.rp1/context/meta.json`
- Ignore `.rp1/settings.toml`

### Git Ignore Presets

`rp1 init` uses the recommended ignore defaults unless you choose a different
setup during interactive initialization. The presets all keep `.rp1/project_id`
shareable so Arcade and rp1 can recognize the same project across clones and
worktrees.

## Examples

### Standard Setup

```bash
cd my-project
rp1 init
```

### Non-Interactive Setup

```bash
rp1 init --yes
```

Use non-interactive setup for automation, dev containers, and fresh checkouts
where you want repeatable defaults.

## Typical Next Steps

After `init`, the normal path is:

1. Restart the detected host tool so it reloads rp1.
2. Run any host-specific install command that `init` printed.
3. Generate project context.
4. Start your first workflow or open Arcade.

| Host | First context command |
|------|-----------------------|
| Claude Code | `/knowledge-build` |
| OpenCode | `/rp1-base-knowledge-build` |
| Codex | `$rp1-base-knowledge-build` |
| GitHub Copilot CLI | `/rp1-base-knowledge-build` |

## See Also

- [Installation and Host Setup](../../getting-started/installation.md)
- [install](install.md)
- [The .rp1 Directory](../../getting-started/rp1-directory.md)
- [Troubleshooting](../../troubleshooting/index.md)
