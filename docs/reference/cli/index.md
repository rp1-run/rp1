# CLI Reference

The rp1 CLI provides commands for initializing projects, managing plugin installations, and keeping rp1 up to date.

---

## Available Commands

| Command | Description |
|---------|-------------|
| [`init`](init.md) | Initialize rp1 in a project with guided setup |
| [`install`](install.md) | Install rp1 plugins for AI tools |
| [`verify`](install.md#verification) | Verify plugin installation |
| [`update`](update.md) | Update rp1 CLI and plugins |

---

## Agent Tools

Agent tools are CLI utilities designed for use by AI agents during automated workflows. They provide structured JSON output for programmatic consumption.

| Command | Description |
|---------|-------------|
| [`rp1-root-dir`](rp1-root-dir.md) | Resolve canonical project, KB, and work directories with worktree detection |
| [`emit`](../agent-tools.md#emit) | Record events for the rp1 workflow event system |
| [`comment-extract`](../agent-tools.md#comment-extract) | Extract comments from git-changed files |
| [`feedback`](../agent-tools.md#feedback) | Read, resolve, reply to, and accept feedback from the Arcade |
| [`github-pr`](../agent-tools.md#github-pr) | GitHub PR operations (submit-review, add-reaction, reply-comment, fetch-comments) |
| [`mmd-validate`](../agent-tools.md#mmd-validate) | Validate Mermaid diagram syntax in markdown or raw input |
| [`task`](../agent-tools.md#task) | Manage task queue (create, list, pickup, complete, fail, cancel, get) |

See [Agent Tools Reference](../agent-tools.md) for the full documentation.

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
