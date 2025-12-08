# Installation Guide

This guide covers all installation methods for rp1 across different platforms and use cases.

---

## Choose Your Platform

<div class="grid cards" markdown>

-   :material-apple: **macOS**

    ---

    Install via Homebrew (recommended) or direct download.

    [:octicons-arrow-right-24: macOS Installation](#macos)

-   :material-linux: **Linux**

    ---

    Install via Homebrew, install script, or direct download.

    [:octicons-arrow-right-24: Linux Installation](#linux)

-   :material-microsoft-windows: **Windows**

    ---

    Install via Scoop (recommended) or direct download.

    [:octicons-arrow-right-24: Windows Installation](#windows)

-   :material-cloud: **CI/CD**

    ---

    Curl-based install script for automated environments.

    [:octicons-arrow-right-24: CI/CD Installation](#cicd)

</div>

---

## macOS

### Homebrew (Recommended)

```bash
brew install rp1-run/tap/rp1
```

To upgrade to the latest version:
```bash
brew upgrade rp1
```

### Direct Download

Download the binary for your architecture from [GitHub Releases](https://github.com/rp1-run/rp1/releases):

- **Apple Silicon (M1/M2/M3)**: `rp1-darwin-arm64`
- **Intel**: `rp1-darwin-x64`

Then make it executable and move to your PATH:
```bash
chmod +x rp1-darwin-*
sudo mv rp1-darwin-* /usr/local/bin/rp1
```

!!! warning "Gatekeeper Warning"
    macOS may block the binary on first run because it's not code-signed. See [Security Bypass](#macos-gatekeeper) below.

---

## Linux

### Homebrew (Recommended)

```bash
brew install rp1-run/tap/rp1
```

### Install Script

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

The script:

- Detects your architecture (x64 or arm64)
- Downloads the appropriate binary
- Verifies the SHA256 checksum
- Installs to `/usr/local/bin` (or custom location)

**Options:**
```bash
# Install specific version
curl -fsSL https://rp1.run/install.sh | VERSION=5.5.0 sh

# Install to custom directory
curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=$HOME/.local/bin sh
```

### Direct Download

Download from [GitHub Releases](https://github.com/rp1-run/rp1/releases):

- **x86_64**: `rp1-linux-x64`
- **ARM64**: `rp1-linux-arm64`

```bash
chmod +x rp1-linux-*
sudo mv rp1-linux-* /usr/local/bin/rp1
```

---

## Windows

### Scoop (Recommended)

```bash
scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
scoop install rp1
```

To upgrade:
```bash
scoop update rp1
```

### Direct Download

Download `rp1-windows-x64.exe` from [GitHub Releases](https://github.com/rp1-run/rp1/releases) and add it to your PATH.

!!! warning "SmartScreen Warning"
    Windows may show a SmartScreen warning because the binary is not code-signed. See [Security Bypass](#windows-smartscreen) below.

---

## CI/CD

### GitHub Actions

```yaml
- name: Install rp1
  run: curl -fsSL https://rp1.run/install.sh | sh

# Or pin to specific version
- name: Install rp1
  run: curl -fsSL https://rp1.run/install.sh | VERSION=5.5.0 sh
```

### Other CI Systems

The install script works on any Unix-like CI environment:

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `VERSION` | Pin to specific version | Latest |
| `INSTALL_DIR` | Custom install directory | `/usr/local/bin` |

### Install Script Details

The install script (`https://rp1.run/install.sh`) performs the following steps:

1. **Detects your platform** (macOS, Linux, or Windows/WSL)
2. **Detects your architecture** (x64 or arm64)
3. **Downloads the appropriate binary** from GitHub Releases
4. **Verifies SHA256 checksum** against published checksums.txt
5. **Installs to `/usr/local/bin`** (or custom `INSTALL_DIR`)
6. **Sets executable permissions**

**Security Notes:**

- All downloads use HTTPS
- Binary checksums are verified before installation
- No credentials or tokens are collected
- Script source is auditable at the URL above

**What Gets Modified:**

| Item | Change |
|------|--------|
| `/usr/local/bin/rp1` | Binary installed (or `INSTALL_DIR`) |
| Nothing else | No config files, no environment changes |

---

## Verification

After installation, verify rp1 is working:

```bash
rp1 --version
```

You should see the version number, e.g., `5.5.0`.

To verify all commands are available:
```bash
rp1 --help
```

---

## OpenCode Plugin Installation

After installing the rp1 binary, install the plugins for OpenCode:

```bash
rp1 install:opencode
```

This downloads and installs both `rp1-base` and `rp1-dev` plugins to `~/.opencode/prompts/`.

Restart OpenCode to load the new plugins.

---

## Security Bypass {#security-bypass}

rp1 binaries are not code-signed (yet). This means your operating system may warn you about running them.

### macOS Gatekeeper {#macos-gatekeeper}

When you first run rp1, macOS may show:

> "rp1" cannot be opened because the developer cannot be verified.

**Solution 1: System Settings**

1. Open **System Settings** → **Privacy & Security**
2. Scroll down to find the rp1 warning
3. Click **Allow Anyway**
4. Run `rp1` again and click **Open**

**Solution 2: Terminal Command**

```bash
xattr -d com.apple.quarantine /usr/local/bin/rp1
```

### Windows SmartScreen {#windows-smartscreen}

Windows may show a SmartScreen warning:

> Windows protected your PC

**Solution:**

1. Click **More info**
2. Click **Run anyway**

---

## Checksum Verification

For security-conscious users, verify the binary checksum before installation:

```bash
# Download binary and checksums
curl -LO https://github.com/rp1-run/rp1/releases/download/vX.Y.Z/rp1-darwin-arm64
curl -LO https://github.com/rp1-run/rp1/releases/download/vX.Y.Z/checksums.txt

# Verify (macOS)
shasum -a 256 -c checksums.txt --ignore-missing

# Verify (Linux)
sha256sum -c checksums.txt --ignore-missing
```

---

## Troubleshooting

??? question "Command not found after installation?"

    Ensure the install directory is in your PATH:

    ```bash
    # Check if rp1 is in PATH
    which rp1

    # If not found, add to PATH (for default install location)
    export PATH="/usr/local/bin:$PATH"
    ```

    Add this line to your `~/.bashrc`, `~/.zshrc`, or equivalent.

??? question "Permission denied during installation?"

    The install script installs to `/usr/local/bin` by default, which may require elevated permissions.

    **Option 1:** Run with sudo
    ```bash
    curl -fsSL https://rp1.run/install.sh | sudo sh
    ```

    **Option 2:** Install to user directory
    ```bash
    curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=$HOME/.local/bin sh
    ```

??? question "Checksum verification failed?"

    This could indicate:

    - Corrupted download (try again)
    - Network issue (check connection)
    - Tampered binary (report to [GitHub Issues](https://github.com/rp1-run/rp1/issues))

    Never run a binary that fails checksum verification.

??? question "Homebrew formula not found?"

    Ensure you've added the rp1 tap:
    ```bash
    brew tap rp1-run/tap
    brew install rp1
    ```

---

## Uninstalling

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
    sudo rm /usr/local/bin/rp1
    ```

---

## Next Steps

- [:octicons-arrow-right-24: Quick Start](quickstart.md) - Run your first rp1 command
- [:octicons-arrow-right-24: The .rp1 Directory](rp1-directory.md) - Understand project storage and configuration
- [:octicons-arrow-right-24: Claude Code Setup](claude-code.md) - Use rp1 with Claude Code
- [:octicons-arrow-right-24: OpenCode Setup](opencode.md) - Use rp1 with OpenCode
