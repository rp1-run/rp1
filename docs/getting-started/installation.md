# Installation

Get rp1 installed in under 5 minutes. This guide covers all platforms and AI assistants.

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

```
◐ Loading tools registry...
✔ Loading tools registry...
◐ Setting up directory structure...
✔ Setting up directory structure...
◐ Detecting agentic tools...
✔ Claude Code v2.0.75
✔ Detecting agentic tools...
◐ Installing plugins...
✔ Installing plugins...
◐ Verifying plugin installation...
✔ Verifying plugin installation...

✔ rp1 initialized successfully!

Actions: 3 created, 0 updated
Detected tool: Claude Code v2.0.75

Next Steps:
  1. → Restart Claude Code to load plugins (required)
  2. ○ Run /knowledge-build to analyze your codebase (optional)
```

!!! tip "CI/Automation"
    For non-interactive environments, use `rp1 init --yes` to accept all defaults and install plugins automatically.

[:octicons-arrow-right-24: Full init reference](../reference/cli/init.md)

---

## Step 4: Restart Your AI Tool

**Restart your AI assistant** to load the newly installed plugins.

!!! note "Manual Plugin Installation"
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

    Type `/` to see available commands. You should see rp1 commands listed (look for `knowledge-build`, `feature-requirements`, etc.).

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
