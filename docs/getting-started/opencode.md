# OpenCode Installation Guide

Detailed guide for installing and configuring rp1 on OpenCode.

---

## Prerequisites

!!! info "System Requirements"
    - **OpenCode** installed and working ([GitHub](https://github.com/opencode-ai/opencode))
    - **uv** package manager (Python tooling)
    - **macOS or Linux** (Windows via WSL)
    - **A codebase** you want to enhance with rp1 workflows

---

## Installation

### Step 1: Install uv (if not already installed)

uv is a fast Python package manager required for rp1 on OpenCode.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Expected output:**
```
Downloading uv...
Installing to ~/.cargo/bin
```

After installation, restart your shell or run:
```bash
source ~/.bashrc  # or ~/.zshrc
```

Verify the installation:
```bash
uv --version
```

### Step 2: Run the rp1 installer

The installer automatically downloads and configures both rp1 plugins:

```bash
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

**What the installer does:**

1. Downloads the latest rp1 plugin wheels from GitHub Releases
2. Extracts them to `~/.opencode/plugins/`
3. Configures both `rp1-base` and `rp1-dev` plugins
4. Verifies the installation

**Expected output:**
```
Downloading rp1-base...
Downloading rp1-dev...
Installing to ~/.opencode/plugins/
Installation complete!
```

### Step 3: Restart OpenCode

Close and reopen OpenCode to load the new plugins.

---

## Manual Installation (Alternative)

If the automated installer doesn't work, you can install manually:

### Download the wheels

```bash
# Create plugins directory
mkdir -p ~/.opencode/plugins

# Download latest releases
curl -L -o /tmp/rp1-base.whl \
  https://github.com/rp1-run/rp1/releases/latest/download/rp1_base-*.whl

curl -L -o /tmp/rp1-dev.whl \
  https://github.com/rp1-run/rp1/releases/latest/download/rp1_dev-*.whl
```

### Extract to plugins directory

```bash
unzip /tmp/rp1-base.whl -d ~/.opencode/plugins/rp1-base
unzip /tmp/rp1-dev.whl -d ~/.opencode/plugins/rp1-dev
```

### Restart OpenCode

---

## Directory Structure

After installation, your plugins directory should look like:

```
~/.opencode/plugins/
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

After restarting OpenCode, verify the installation:

```bash
/help
```

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

## Configuration

### Updating Plugins

To update to the latest version, re-run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

### Uninstalling

To remove rp1:

```bash
rm -rf ~/.opencode/plugins/rp1-base
rm -rf ~/.opencode/plugins/rp1-dev
```

---

## Troubleshooting

??? question "uv command not found?"

    **Solution**: The uv installer adds uv to `~/.cargo/bin`. Make sure this is in your PATH:

    ```bash
    export PATH="$HOME/.cargo/bin:$PATH"
    ```

    Add this line to your `~/.bashrc` or `~/.zshrc` to make it permanent.

??? question "Installation script fails?"

    **Solution**: Check the error message. Common issues:

    - **Network error**: Check your internet connection
    - **Permission denied**: Don't run with `sudo`; the script installs to your home directory
    - **curl not found**: Install curl (`apt install curl` on Ubuntu, `brew install curl` on macOS)

    Try the manual installation method as an alternative.

??? question "Plugins not loading?"

    **Solution**: Verify the plugins are in the correct location:

    ```bash
    ls ~/.opencode/plugins/
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
