# init

Initialize rp1 in a project and prepare it for workflow use.

---

## Synopsis

```bash
rp1 init [options]
```

## Description

`rp1 init` is the normal entry point for bringing rp1 into an existing
repository. It:

1. Creates `.rp1/`, `.rp1/context/`, and `.rp1/work/`
2. Creates local and global rp1 settings files when missing
3. Detects supported host tools installed on your machine
4. Updates the host instruction file (`CLAUDE.md` or `AGENTS.md`)
5. Configures `.gitignore` for local rp1 artifacts
6. Installs plugins where `init` supports automatic installation
7. Verifies the resulting setup and prints the next actions

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Accept safe defaults without prompting |
| `--interactive` | `-i` | Force interactive mode even without a TTY |

## Host Support

| Host | Detected by `init` | Instruction File | Automatic Install in `init` |
|------|---------------------|------------------|-----------------------------|
| Claude Code | Yes | `CLAUDE.md` | Yes |
| OpenCode | Yes | `AGENTS.md` | Yes |
| Codex | Yes | `AGENTS.md` | No, run `rp1 install codex` |

## What Gets Configured

### Project directories

`init` prepares the standard rp1 layout:

```text
.rp1/
├── project_id
├── context/
├── work/
└── settings.toml
```

### Instruction file

rp1 adds project guidance to the instruction file your host uses:

- Claude Code: `CLAUDE.md`
- OpenCode: `AGENTS.md`
- Codex: `AGENTS.md`

These instruction files are generated from pre-rendered templates. For Claude
Code and OpenCode, the ambient `rp1 Skill Awareness` block is rendered from the
same distributable skill registry that feeds the guide catalog, so onboarding
guidance stays aligned with discovery surfaces. Codex intentionally omits that
ambient block and keeps only Codex-specific conventions.

### Git ignore defaults

The recommended setup keeps the knowledge base shareable while treating local
work artifacts as disposable:

- Track `.rp1/context/`
- Ignore `.rp1/work/`
- Ignore `.rp1/context/meta.json`
- Ignore `.rp1/settings.toml`

## Examples

### Standard setup

```bash
cd my-project
rp1 init
```

### Non-interactive setup

```bash
rp1 init --yes
```

Useful for automation, dev containers, and fresh checkouts where you want
repeatable defaults.

## Typical Next Steps

After `init`, the normal path is:

1. Restart the detected host tool so it reloads plugins
2. Run `rp1 install codex` if you are using Codex
3. Generate the knowledge base

| Host | First KB Command |
|------|------------------|
| Claude Code | `/knowledge-build` |
| OpenCode | `/rp1-base-knowledge-build` |
| Codex | `$rp1-base-knowledge-build` |

## See Also

- [Installation Guide](../../getting-started/installation.md)
- [The .rp1 Directory](../../getting-started/rp1-directory.md)
- [install](install.md)
