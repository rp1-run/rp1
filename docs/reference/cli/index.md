# CLI Reference

The rp1 CLI provides the setup and maintenance commands that sit outside your
AI assistant session.

---

## Available Commands

| Command | Description |
|---------|-------------|
| [`init`](init.md) | Initialize rp1 in a project with guided setup |
| [`install`](install.md) | Install rp1 plugins for AI tools |
| [`verify`](verify.md) | Verify host integrations and Antigravity plugin assets |
| [`update`](update.md) | Update rp1 CLI and plugins |
| [`uninstall`](uninstall.md) | Remove rp1 project setup or host-specific assets |
| [`check-update`](check-update.md) | Check for CLI and stanza updates |
| [`settings`](settings.md) | Manage settings files and model tier remappings |
| [`rp1 migrate`](rp1-migrate.md) | Migrate older projects into the project-local `.rp1/` layout |
| [Fence Versioning](fence-versioning.md) | How fence version markers work |

---

## Global Options

These options are available for all CLI commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Display help information |
| `--version`, `-v` | Display version information |

---

## Directory Resolution

rp1 derives its directories from the project root:

- Project root: directory containing `.rp1/project_id`
- Knowledge base: `.rp1/context/`
- Work artifacts: `.rp1/work/`

The home directory is not auto-discovered as a project root.

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
