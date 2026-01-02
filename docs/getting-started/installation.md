# Installation

Get rp1 installed in under 5 minutes. This guide covers all platforms and AI assistants.

---

## Prerequisites

Before installing rp1, ensure you have:

- **Git 2.15+**: Required for worktree isolation in `build-fast`. Check with `git --version`.

??? note "Upgrading Git"

    === "macOS"

        ```bash
        brew install git
        ```

    === "Ubuntu/Debian"

        ```bash
        sudo add-apt-repository ppa:git-core/ppa
        sudo apt update
        sudo apt install git
        ```

    === "Windows"

        Download from [git-scm.com](https://git-scm.com/download/win) or use:

        ```bash
        winget install Git.Git
        ```

---

## Step 1: Install the rp1 CLI

The rp1 CLI provides tools for installing plugins and managing your setup. Install it first, then add plugins for your AI assistant.

=== "macOS"

    **Homebrew (Recommended)**

    ```bash
    brew install rp1-run/tap/rp1
    ```

    **Alternative: Install Script**

    ```bash
    curl -fsSL https://rp1.run/install.sh | sh
    ```

=== "Linux"

    **Homebrew (Recommended)**

    ```bash
    brew install rp1-run/tap/rp1
    ```

    **Alternative: Install Script**

    ```bash
    curl -fsSL https://rp1.run/install.sh | sh
    ```

=== "Windows"

    **Scoop (Recommended)**

    ```bash
    scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
    scoop install rp1
    ```

---

## Step 2: Verify CLI Installation

```bash
rp1 --version
```

You should see the version number (e.g., `0.2.1`). If you get "command not found", see Troubleshooting below.

---

## Step 3: Initialize Your Project

Navigate to your project directory and run init:

```bash
cd your-project
rp1 init
```

This interactive command will:

- Create the `.rp1/` directory structure
- Detect your AI assistant (Claude Code or OpenCode)
- Inject rp1 instructions into `CLAUDE.md` or `AGENTS.md`
- Configure `.gitignore` for rp1 artifacts
- **Install plugins automatically** (for Claude Code)
- Verify the installation
- Display next steps

**Expected output:**

The init command displays a step-by-step wizard with real-time progress:

```
rp1 init                                              Step 6 of 8

  ✓ Loading tools registry
    └─ Registry loaded successfully

  ✓ Checking git repository
    └─ At repository root

  ✓ Setting up directories
    └─ Created .rp1/context/
    └─ Created .rp1/work/

  ✓ Detecting AI tools
    └─ Found: Claude Code v2.0.75

  ✓ Configuring instruction file
    └─ Updated CLAUDE.md

  ◐ Installing plugins...
    └─ Installing rp1-base...

  ○ Verifying installation
  ○ Health check
```

When complete, you'll see a summary with next steps:

```
✨ rp1 initialized successfully!

Detected Tools:
  ✓ Claude Code v2.0.75

Setup Status:
  ✓ .rp1/ directory
  ✓ CLAUDE.md configured
  ✓ .gitignore configured
  ✓ Plugins installed

Next Steps:
  → 1. Restart Claude Code to load plugins  [required]

  ○ 2. Build knowledge base
       Run: /knowledge-build
       Analyzes your codebase for AI context awareness

  ○ 3. Create project charter
       Run: /blueprint
       Captures project vision to guide feature development

Documentation: https://rp1.run
```

!!! note "Multi-Tool Detection"
    If you have both Claude Code and OpenCode installed, rp1 will detect and configure plugins for **both tools** automatically. The summary will show all detected tools and their configuration status.

??? tip "CI/Automation"
    For non-interactive environments (CI pipelines, Docker builds, scripts), use `rp1 init --yes` to accept all defaults and install plugins automatically.

    **Non-TTY mode features:**

    - No ANSI color codes (clean, parseable output)
    - No animated spinners (static progress lines)
    - Sensible defaults for all prompts
    - Standard exit codes (0=success, 1=failure)

    **Example CI output:**

    ```
    [1/8] Loading tools registry... done
    [2/8] Checking git repository... done
    [3/8] Setting up directories... done
    [4/8] Detecting AI tools... Claude Code v2.0.75
    [5/8] Configuring instruction file... done
    [6/8] Configuring .gitignore... done (recommended preset)
    [7/8] Installing plugins... done
    [8/8] Health check... done

    rp1 initialized successfully!
    ```

    See [Non-Interactive Mode](../reference/cli/init.md#non-interactive-mode) for CI/CD integration examples.

[:octicons-arrow-right-24: Full init reference](../reference/cli/init.md)

---

## Step 4: Restart Your AI Tool

!!! warning "Required: Restart Your AI Assistant"
    You **must restart** your AI assistant (Claude Code or OpenCode) to load the newly installed plugins. Without restarting, rp1 commands will not be available.

??? note "Manual Plugin Installation"
    If init couldn't install plugins (e.g., OpenCode, or if you skipped installation), you can install them manually:

    === "Claude Code"

        ```bash
        rp1 install:claudecode
        ```

    === "OpenCode"

        ```bash
        rp1 install:opencode
        ```

---

## Step 5: Verify Plugins

=== "Claude Code"

    Type `/` to see available commands. You should see rp1 commands listed (look for `knowledge-build`, `build`, `build-fast`, etc.).

    **Quick test:**

    ```
    /knowledge-build
    ```

=== "OpenCode"

    Type `/` to see available commands. You should see rp1 commands listed (look for `/rp1-base/` and `/rp1-dev/`).

    **Quick test:**

    ```
    /rp1-base/knowledge-build
    ```

If successful, you'll see output like `READY [single-project]` or `READY [monorepo: N projects]`.

---

## Next Steps

You're ready to go! Continue to [Your First Workflow](first-workflow.md) to run your first rp1 command.

---

??? question "Troubleshooting"

    **Command not found after CLI installation?**

    Ensure the install directory is in your PATH:

    ```bash
    which rp1
    ```

    If not found, add to your shell config:

    ```bash
    export PATH="/usr/local/bin:$PATH"
    ```

    ---

    **Commands not appearing after plugin installation?**

    - **Claude Code**: Make sure you completely restarted Claude Code
    - **OpenCode**: Verify plugins exist at `~/.opencode/prompts/rp1-base/`

    ---

    **Permission denied during installation?**

    Install to a user directory instead:

    ```bash
    curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=$HOME/.local/bin sh
    ```

    ---

    **Knowledge build takes a long time?**

    First-time builds analyze your entire codebase and can take 10-15 minutes for large projects. Subsequent builds are incremental (2-5 minutes).

    ---

    **Still having issues?**

    Check [GitHub Issues](https://github.com/rp1-run/rp1/issues) or open a new issue.

??? note "Advanced Options"

    **Pin to specific version:**

    ```bash
    curl -fsSL https://rp1.run/install.sh | VERSION=0.2.1 sh
    ```

    **Custom install directory:**

    ```bash
    curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=$HOME/.local/bin sh
    ```

    **Manual checksum verification:**

    ```bash
    # Download binary and checksums
    curl -LO https://github.com/rp1-run/rp1/releases/download/v0.2.1/rp1-darwin-arm64
    curl -LO https://github.com/rp1-run/rp1/releases/download/v0.2.1/checksums.txt

    # Verify (macOS)
    shasum -a 256 -c checksums.txt --ignore-missing

    # Verify (Linux)
    sha256sum -c checksums.txt --ignore-missing
    ```

    **Direct download links:**

    - [GitHub Releases](https://github.com/rp1-run/rp1/releases)
    - macOS: `rp1-darwin-arm64` (Apple Silicon) or `rp1-darwin-x64` (Intel)
    - Linux: `rp1-linux-arm64` or `rp1-linux-x64`
    - Windows: `rp1-windows-x64.exe`

    **Updating:**

    === "Homebrew"

        ```bash
        brew upgrade rp1
        ```

    === "Scoop"

        ```bash
        scoop update rp1
        ```

    **Uninstalling:**

    === "Homebrew"

        ```bash
        brew uninstall rp1
        ```

    === "Scoop"

        ```bash
        scoop uninstall rp1
        ```

    === "Manual"

        ```bash
        rm /usr/local/bin/rp1
        ```

??? warning "Security Notes"

    rp1 binaries are not code-signed. Your operating system may warn you about running them.

    **macOS Gatekeeper**

    If macOS shows "cannot be opened because the developer cannot be verified":

    1. Open **System Settings** > **Privacy & Security**
    2. Scroll down to find the rp1 warning
    3. Click **Allow Anyway**
    4. Run `rp1` again and click **Open**

    Or use the terminal:

    ```bash
    xattr -d com.apple.quarantine /usr/local/bin/rp1
    ```

    **Windows SmartScreen**

    If Windows shows "Windows protected your PC":

    1. Click **More info**
    2. Click **Run anyway**
