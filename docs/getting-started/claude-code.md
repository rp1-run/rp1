# Claude Code Installation Guide

Detailed guide for installing and configuring rp1 on Claude Code.

---

## Prerequisites

!!! info "System Requirements"
    - **Claude Code** installed and working ([download](https://claude.ai/code))
    - **macOS, Linux, or Windows** with WSL
    - **A codebase** you want to enhance with rp1 workflows

Before proceeding, verify Claude Code is working:

```bash
claude --version
```

You should see version information. If not, install Claude Code first from [claude.ai/code](https://claude.ai/code).

---

## Installation

!!! tip "CLI vs Slash Commands"
    Claude Code provides two ways to manage plugins:

    - **CLI commands** (`claude plugin ...`) - Run from any terminal, even outside Claude Code
    - **Slash commands** (`/plugin ...`) - Run inside an active Claude Code session

    Both methods work identically. CLI commands are convenient for scripting and when you don't have a Claude Code session open.

### Step 1: Add the rp1 marketplace

=== "CLI (Terminal)"

    Run from any terminal:

    ```bash
    claude plugin marketplace add rp1-run/rp1
    ```

=== "Slash Command"

    Inside a Claude Code session:

    ```bash
    /plugin marketplace add rp1-run/rp1
    ```

**Expected output:**
```
Marketplace 'rp1-run/rp1' added successfully.
```

### Step 2: Install the base plugin

=== "CLI (Terminal)"

    ```bash
    claude plugin install rp1-base
    ```

=== "Slash Command"

    ```bash
    /plugin install rp1-base
    ```

**Expected output:**
```
Plugin 'rp1-base' installed successfully.
```

### Step 3: Install the dev plugin

=== "CLI (Terminal)"

    ```bash
    claude plugin install rp1-dev
    ```

=== "Slash Command"

    ```bash
    /plugin install rp1-dev
    ```

**Expected output:**
```
Plugin 'rp1-dev' installed successfully.
```

### Step 4: Restart Claude Code

Close and reopen Claude Code to load the new plugins.

!!! warning "Restart Required"
    The plugins won't be available until you restart Claude Code. Make sure to close all Claude Code sessions before reopening.

---

## Verification

After restarting, verify the installation:

```bash
/help
```

You should see rp1 commands listed. Look for commands like `knowledge-build`, `feature-requirements`, `pr-review`, etc.

### Quick Test

Run your first rp1 command to build a knowledge base:

```bash
/knowledge-build
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

If you have the rp1 CLI installed, you can inject rp1 context directly into your project's CLAUDE.md or AGENTS.md:

```bash
rp1 init
```

Auto-detects CLAUDE.md or AGENTS.md and adds KB loading patterns. Running again updates existing content.

---

## Configuration

### Plugin Updates

To update rp1 to the latest version:

=== "CLI (Terminal)"

    Run from any terminal:

    ```bash
    claude plugin update rp1-base
    claude plugin update rp1-dev
    ```

    Or update all plugins at once:

    ```bash
    claude plugin update --all
    ```

=== "Slash Command"

    Inside a Claude Code session:

    ```bash
    /plugin update rp1-base
    /plugin update rp1-dev
    ```

!!! warning "Restart After Update"
    After updating plugins, restart Claude Code to load the new versions.

### Uninstalling

If you need to remove rp1:

=== "CLI (Terminal)"

    ```bash
    claude plugin uninstall rp1-dev
    claude plugin uninstall rp1-base
    ```

=== "Slash Command"

    ```bash
    /plugin uninstall rp1-dev
    /plugin uninstall rp1-base
    ```

---

## Troubleshooting

??? question "Commands not appearing after installation?"

    **Solution**: Make sure you completely restarted Claude Code. Close all terminal windows running Claude Code, then start a fresh session.

    If commands still don't appear, verify the plugins are installed:

    === "CLI (Terminal)"

        ```bash
        claude plugin list
        ```

    === "Slash Command"

        ```bash
        /plugin list
        ```

    You should see `rp1-base` and `rp1-dev` in the list.

??? question "Marketplace not found error?"

    **Solution**: The marketplace command may need GitHub authentication. Ensure you're logged into GitHub:
    ```bash
    gh auth status
    ```

    If not authenticated:
    ```bash
    gh auth login
    ```

??? question "Plugin install fails?"

    **Solution**: Check your internet connection and try again. If the issue persists, try removing and re-adding the marketplace:

    === "CLI (Terminal)"

        ```bash
        claude plugin marketplace remove rp1-run/rp1
        claude plugin marketplace add rp1-run/rp1
        claude plugin install rp1-base
        ```

    === "Slash Command"

        ```bash
        /plugin marketplace remove rp1-run/rp1
        /plugin marketplace add rp1-run/rp1
        /plugin install rp1-base
        ```

??? question "Knowledge build takes a long time?"

    First-time builds analyze your entire codebase and can take **10-15 minutes** for large projects. Subsequent builds are incremental and typically take **2-5 minutes**.

    If a build seems stuck, check:

    - Your codebase size (very large repos take longer)
    - Available memory (close other applications if needed)

??? question "Getting 'Plugin not found' errors?"

    Make sure you installed both plugins in the correct order:

    1. `rp1-base` must be installed first (it has no dependencies)
    2. `rp1-dev` depends on `rp1-base`

??? question "How do I check plugin versions?"

    View installed plugin versions:

    === "CLI (Terminal)"

        ```bash
        claude plugin list
        ```

    === "Slash Command"

        ```bash
        /plugin list
        ```

    To check for available updates:

    === "CLI (Terminal)"

        ```bash
        claude plugin outdated
        ```

---

## CLI Command Reference

For convenience, here's a summary of all plugin management CLI commands:

| Command | Description |
|---------|-------------|
| `claude plugin marketplace add <repo>` | Add a plugin marketplace |
| `claude plugin marketplace remove <repo>` | Remove a plugin marketplace |
| `claude plugin install <plugin>` | Install a plugin |
| `claude plugin uninstall <plugin>` | Uninstall a plugin |
| `claude plugin update <plugin>` | Update a specific plugin |
| `claude plugin update --all` | Update all plugins |
| `claude plugin list` | List installed plugins |
| `claude plugin enable <plugin>` | Enable a disabled plugin |
| `claude plugin disable <plugin>` | Disable a plugin |

!!! tip "CLI Advantage"
    CLI commands can be run from any terminal without an active Claude Code session. This is useful for:

    - Scripting plugin installations
    - Managing plugins from your IDE's integrated terminal
    - Updating plugins while Claude Code is closed

---

## Next Steps

Now that rp1 is installed:

- [:octicons-arrow-right-24: Quick Start](quickstart.md) - Run your first commands
- [:octicons-arrow-right-24: The .rp1 Directory](rp1-directory.md) - Understand project storage and configuration
- [:octicons-arrow-right-24: Feature Development Guide](../guides/feature-development.md) - Build your first feature with rp1
- [:octicons-arrow-right-24: Command Reference](../reference/index.md) - Explore all 21 commands
