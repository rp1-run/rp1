# CLI Reference

The rp1 CLI provides commands for initializing projects and managing plugin installations.

---

## Available Commands

| Command | Description |
|---------|-------------|
| [`init`](init.md) | Initialize rp1 in a project with guided setup |

---

## Agent Tools

Agent tools are CLI utilities designed for use by AI agents during automated workflows. They provide structured JSON output for programmatic consumption.

| Command | Description |
|---------|-------------|
| [`rp1-root-dir`](rp1-root-dir.md) | Resolve RP1_ROOT path with worktree awareness |
| [`worktree`](worktree.md) | Create and manage git worktrees for isolated execution |

---

## Global Options

These options are available for all CLI commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Display help information |
| `--version`, `-v` | Display version information |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Custom location for rp1 data directory |

### Using RP1_ROOT

To use a custom location for rp1 data:

```bash
# Set via environment variable
export RP1_ROOT=/custom/path/.rp1
rp1 init

# Or use direnv (.envrc)
echo 'export RP1_ROOT=.config/rp1' >> .envrc
direnv allow
rp1 init
```

---

## Installation

The rp1 CLI is installed via the install script:

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

See [Installation](../../getting-started/installation.md) for detailed instructions.

---

## See Also

- [Installation Guide](../../getting-started/installation.md) - Full installation instructions
- [First Workflow](../../getting-started/first-workflow.md) - Getting started after init
