# OpenCode Installation Guide

Detailed guide for installing and configuring rp1 on OpenCode.

---

## Prerequisites

!!! info "System Requirements"
    - **OpenCode** installed and working ([GitHub](https://github.com/opencode-ai/opencode))
    - **macOS, Linux, or Windows**
    - **A codebase** you want to enhance with rp1 workflows

---

## Installation

### Step 1: Install rp1 CLI

=== "macOS / Linux (Homebrew)"

    ```bash
    brew install rp1-run/tap/rp1
    ```

=== "macOS / Linux (curl)"

    ```bash
    curl -fsSL https://rp1.run/install.sh | sh
    ```

=== "Windows (Scoop)"

    ```bash
    scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
    scoop install rp1
    ```

!!! tip "First-time macOS/Windows users"
    You may see a security warning because the binary isn't code-signed. See [Security Bypass](installation.md#security-bypass) for instructions.

### Step 2: Install OpenCode plugins

```bash
rp1 install:opencode
```

**What this does:**

1. Downloads the latest rp1 plugins
2. Installs them to `~/.opencode/prompts/`
3. Configures both `rp1-base` and `rp1-dev` plugins
4. Verifies the installation

### Step 3: Restart OpenCode

Close and reopen OpenCode to load the new plugins.

---

## What Gets Installed

When you run `rp1 install:opencode`, the following changes are made to your system:

### Files Created

| Location | Contents |
|----------|----------|
| `~/.opencode/prompts/rp1-base/commands/` | 6 command files (.md) |
| `~/.opencode/prompts/rp1-base/agents/` | 9 agent files (.md) |
| `~/.opencode/prompts/rp1-base/skills/` | 4 skill directories |
| `~/.opencode/prompts/rp1-dev/commands/` | 15 command files (.md) |
| `~/.opencode/prompts/rp1-dev/agents/` | 9 agent files (.md) |

### Backups

Before installation, the installer creates a timestamped backup of any existing rp1 files. Backups are stored in the same directory with a `.backup-TIMESTAMP` suffix.

### Verification

After installation, verify the files exist:

```bash
ls ~/.opencode/prompts/rp1-base/
ls ~/.opencode/prompts/rp1-dev/
```

You should see `agents/`, `commands/`, and (for rp1-base) `skills/` directories.

### Removal

To completely remove rp1 from OpenCode:

```bash
rm -rf ~/.opencode/prompts/rp1-base
rm -rf ~/.opencode/prompts/rp1-dev
```

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

=== "Homebrew"

    ```bash
    brew upgrade rp1
    rp1 install:opencode
    ```

=== "Scoop"

    ```bash
    scoop update rp1
    rp1 install:opencode
    ```

### Uninstalling

See [What Gets Installed > Removal](#removal) for complete uninstallation instructions.

---

## Troubleshooting

??? question "Installation fails?"

    **Solution**: Check the error message. Common issues:

    - **Network error**: Check your internet connection
    - **Permission denied**: The install script may need elevated permissions for `/usr/local/bin`. Either run with `sudo` or install to a user directory with `INSTALL_DIR=$HOME/.local/bin`
    - **Checksum verification failed**: Try downloading again. If it persists, [report an issue](https://github.com/rp1-run/rp1/issues)

    Try the manual installation method as an alternative.

??? question "macOS security warning?"

    macOS Gatekeeper blocks unsigned binaries. See [Security Bypass](installation.md#macos-gatekeeper) for solutions.

??? question "Windows SmartScreen warning?"

    Windows blocks unsigned executables. See [Security Bypass](installation.md#windows-smartscreen) for solutions.

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
- [:octicons-arrow-right-24: The .rp1 Directory](rp1-directory.md) - Understand project storage and configuration
- [:octicons-arrow-right-24: Feature Development Guide](../guides/feature-development.md) - Build your first feature with rp1
- [:octicons-arrow-right-24: Command Reference](../reference/index.md) - Explore all 21 commands
