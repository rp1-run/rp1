# OpenCode Installation Guide

Detailed guide for installing and configuring rp1 on OpenCode.

---

## Prerequisites

!!! info "System Requirements"
    - **OpenCode** installed and working ([GitHub](https://github.com/opencode-ai/opencode))
    - **macOS or Linux** (Windows via WSL)
    - **A codebase** you want to enhance with rp1 workflows

---

## Installation

### Step 1: Install rp1 CLI globally (recommended)

```bash
bun install -g @rp1-run/rp1
rp1 install:opencode
```

Or run without installing:

```bash
bunx @rp1-run/rp1 install:opencode
```

!!! tip "Using npm instead"
    If you prefer npm, use `npx @rp1-run/rp1 install:opencode`

**What this does:**

1. Downloads the latest rp1 plugins from npm
2. Installs them to `~/.opencode/prompts/`
3. Configures both `rp1-base` and `rp1-dev` plugins
4. Verifies the installation

### Step 2: Restart OpenCode

Close and reopen OpenCode to load the new plugins.

---

## Manual Installation (Alternative)

If the automated installer doesn't work, you can install manually:

### Download the tarball

```bash
# Create prompts directory
mkdir -p ~/.opencode/prompts

# Download latest release tarball (replace X.Y.Z with actual version)
curl -L -o /tmp/rp1-opencode.tar.gz \
  https://github.com/rp1-run/rp1/releases/latest/download/rp1-opencode-X.Y.Z.tar.gz
```

### Extract to prompts directory

```bash
tar -xzf /tmp/rp1-opencode.tar.gz -C /tmp
cp -r /tmp/opencode/rp1-base ~/.opencode/prompts/
cp -r /tmp/opencode/rp1-dev ~/.opencode/prompts/
```

### Restart OpenCode

---

## Directory Structure

After installation, your prompts directory should look like:

```
~/.opencode/prompts/
├── rp1-base/
│   ├── agents/
│   ├── commands/
│   └── skills/
└── rp1-dev/
    ├── agents/
    └── commands/
```

---

## Verification

After restarting OpenCode, verify the installation by typing `/` to see available commands.

You should see rp1 commands listed. Look for commands starting with:

- `/rp1-base/` - Base plugin commands (6 commands)
- `/rp1-dev/` - Dev plugin commands (15 commands)

!!! note "Syntax Difference"
    OpenCode uses `/` as the separator (e.g., `/rp1-base/knowledge-build`) while Claude Code uses `:` (e.g., `/rp1-base:knowledge-build`).

### Quick Test

Run your first rp1 command to build a knowledge base:

```bash
/rp1-base/knowledge-build
```

If successful, you'll see:
```
READY [single-project]
```
or for a monorepo:
```
READY [monorepo: N projects]
```

---

## Inject rp1 Knowledge (Optional)

You can inject rp1 context directly into your project's AGENTS.md or CLAUDE.md:

```bash
rp1 init
```

Auto-detects AGENTS.md or CLAUDE.md and adds KB loading patterns. Running again updates existing content.

---

## Configuration

### Updating Plugins

To update to the latest version:

```bash
# If installed globally
bun update -g @rp1-run/rp1
rp1 install:opencode

# Or run directly without updating global install
bunx @rp1-run/rp1@latest install:opencode
```

### Uninstalling

To remove rp1:

```bash
rm -rf ~/.opencode/plugins/rp1-base
rm -rf ~/.opencode/plugins/rp1-dev
```

---

## Troubleshooting

??? question "Installation fails?"

    **Solution**: Check the error message. Common issues:

    - **bunx/npx not found**: Make sure Bun or Node.js is installed and in your PATH
    - **Network error**: Check your internet connection
    - **Permission denied**: Don't run with `sudo`; the CLI installs to your home directory

    Try the manual installation method as an alternative.

??? question "Plugins not loading?"

    **Solution**: Verify the plugins are in the correct location:

    ```bash
    ls ~/.opencode/prompts/
    ```

    You should see both `rp1-base` and `rp1-dev` directories.

    If present but not loading, check OpenCode logs for errors.

??? question "Commands show wrong syntax?"

    OpenCode uses `/` as the separator, not `:`. Use:

    - `/rp1-base/knowledge-build` (correct for OpenCode)
    - Not `/rp1-base:knowledge-build` (Claude Code syntax)

??? question "Knowledge build takes a long time?"

    First-time builds analyze your entire codebase and can take **10-15 minutes** for large projects. Subsequent builds are incremental and typically take **2-5 minutes**.

---

## Next Steps

Now that rp1 is installed:

- [:octicons-arrow-right-24: Quick Start](quickstart.md) - Run your first commands
- [:octicons-arrow-right-24: Feature Development Guide](../guides/feature-development.md) - Build your first feature with rp1
- [:octicons-arrow-right-24: Command Reference](../reference/index.md) - Explore all 21 commands
