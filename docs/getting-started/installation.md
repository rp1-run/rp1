# Installation

Get rp1 installed and connected to your AI coding assistant.

---

## Prerequisites

Before installing rp1, make sure you have:

- **Git 2.15+**
- **One supported host tool**:
  [Claude Code](https://claude.ai/code),
  [OpenCode](https://github.com/opencode-ai/opencode), or
  [Codex](https://github.com/openai/codex)
- **A repository** where you want to use rp1

---

## Step 1: Install the rp1 CLI

=== "macOS"

    ```bash
    brew install rp1-run/tap/rp1
    rp1 install
    ```

=== "Linux"

    ```bash
    brew install rp1-run/tap/rp1
    rp1 install
    ```

=== "Windows"

    ```bash
    scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
    scoop install rp1
    rp1 install
    ```

Alternative install script:

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

Package-manager installs add the rp1 CLI, then you run `rp1 install` to install integrations into detected host tools. The standalone install script already attempts that `rp1 install` step automatically unless you set `SKIP_PLUGINS=1`.

Verify the CLI:

```bash
rp1 --version
```

---

## Step 2: Initialize Your Project

From your repository root:

```bash
cd your-project
rp1 init
```

`rp1 init` prepares the project for rp1:

- creates `.rp1/`, `.rp1/context/`, and `.rp1/work/`
- detects supported host tools on your machine
- updates `CLAUDE.md` or `AGENTS.md`
- configures `.gitignore` for local rp1 artifacts
- installs plugins automatically where supported
- verifies the resulting setup

### Current `init` behavior by host

| Host | Detected | Instruction File | Plugin Install During `init` |
|------|----------|------------------|-------------------------------|
| Claude Code | Yes | `CLAUDE.md` | Automatic |
| OpenCode | Yes | `AGENTS.md` | Automatic |
| Codex | Yes | `AGENTS.md` | Run `rp1 install codex` after `init` |

For non-interactive setup:

```bash
rp1 init --yes
```

---

## Step 3: Install or Verify the Host Plugin

If `init` did not install the host automatically, install it manually:

```bash
rp1 install claude-code
rp1 install opencode
rp1 install codex
```

You can verify the result at any time:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
```

Useful install locations:

| Host | Typical Location |
|------|------------------|
| OpenCode | `~/.config/opencode/plugins/` |
| Codex skills | `~/.codex/skills/` |
| Codex agents | `~/.codex/agents/rp1/` |

---

## Step 4: Restart the Host Tool

After installation or updates, restart the host so it reloads rp1.

This applies to Claude Code, OpenCode, and Codex.

---

## Step 5: Run Your First Workflow

Build the knowledge base once so rp1 can work against your project instead of
generic assumptions.

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

=== "Codex"

    ```bash
    $rp1-base-knowledge-build
    ```

This creates `.rp1/context/`, which the rest of the workflows use for
project-aware execution.

---

## Common Follow-Ups

After the KB is built, most users continue with one of these:

| Goal | Claude Code | OpenCode | Codex |
|------|-------------|----------|-------|
| Start a feature | `/build my-feature` | `/rp1-dev-build my-feature` | `$rp1-dev-build my-feature` |
| Quick task | `/build-fast "..."` | `/rp1-dev-build-fast "..."` | `$rp1-dev-build-fast "..."` |
| Review a PR | `/pr-review` | `/rp1-dev-pr-review` | `$rp1-dev-pr-review` |

---

## Troubleshooting

### `rp1` not found

Check your install location:

```bash
which rp1
```

### Skills do not appear in the host

1. Restart the host
2. Run the matching `rp1 verify ...` command
3. Confirm the host-specific install location exists

### Permission denied

Check directory ownership:

```bash
ls -la ~/.config/opencode/
ls -la ~/.codex/
```

### KB build takes a while

First-time builds can take 10-15 minutes on large repositories. Incremental
rebuilds are much faster.

---

## Next Steps

- [Your First Workflow](first-workflow.md)
- [The .rp1 Directory](rp1-directory.md)
- [CLI Reference](../reference/cli/index.md)
