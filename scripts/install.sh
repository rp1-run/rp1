#!/bin/sh
set -eu

# rp1 Binary Installer
# Usage: curl -fsSL https://rp1.run/install.sh | sh
#        curl -fsSL https://rp1.run/install.sh | VERSION=5.5.0 sh
#        curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=/opt/bin sh
#        curl -fsSL https://rp1.run/install.sh | SKIP_PLUGINS=1 sh
#
# Internal (not in site/install.sh):
#        LOCAL_ARTIFACTS_DIR=/path/to/dir VERSION=0.6.5 sh install.sh
#        Skips download; copies binary + checksums.txt from local dir.

GITHUB_REPO="rp1-run/rp1"
BINARY_NAME="rp1"
DEFAULT_INSTALL_DIR="/usr/local/bin"

# Colors (only if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    NC=''
fi

info() {
    printf "${BLUE}==>${NC} ${BOLD}%s${NC}\n" "$1"
}

success() {
    printf "${GREEN}==>${NC} ${BOLD}%s${NC}\n" "$1"
}

warn() {
    printf "${YELLOW}Warning:${NC} %s\n" "$1" >&2
}

error() {
    printf "${RED}Error:${NC} %s\n" "$1" >&2
    exit 1
}

# Run a command, elevating with sudo only if needed and available.
# Usage: maybe_sudo command [args...]
maybe_sudo() {
    if "$@" 2>/dev/null; then
        return 0
    fi

    # Command failed -- try sudo if we are not already root
    if [ "$(id -u)" -eq 0 ]; then
        # Already root and still failed; nothing more to try
        return 1
    fi

    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        # No sudo available -- report clearly
        return 1
    fi
}

detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "darwin"
            ;;
        Linux)
            echo "linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            error "Windows detected. Please install rp1 using Scoop:
  scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
  scoop install rp1

Or download the binary directly from:
  https://github.com/${GITHUB_REPO}/releases"
            ;;
        *)
            error "Unsupported operating system: $(uname -s)
Supported: macOS (Darwin), Linux
Windows users: Install via Scoop - see https://rp1.run/docs/installation"
            ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            echo "amd64"
            ;;
        arm64|aarch64)
            echo "arm64"
            ;;
        *)
            error "Unsupported architecture: $(uname -m)
Supported: x86_64 (x64), arm64 (aarch64)"
            ;;
    esac
}

get_latest_version() {
    local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    local response

    if command -v curl >/dev/null 2>&1; then
        response=$(curl -fsSL "$api_url" 2>/dev/null) || {
            error "Failed to fetch latest version from GitHub API.
This could be due to:
  - Network connectivity issues
  - GitHub API rate limiting (try again in a few minutes)
  - GitHub is temporarily unavailable

You can also specify a version manually:
  curl -fsSL https://rp1.run/install.sh | VERSION=5.5.0 sh"
        }
    elif command -v wget >/dev/null 2>&1; then
        response=$(wget -qO- "$api_url" 2>/dev/null) || {
            error "Failed to fetch latest version from GitHub API."
        }
    else
        error "Neither curl nor wget found. Please install one of them."
    fi

    # Extract tag_name from JSON response (portable, no jq dependency)
    # Note: Use [[:space:]]* instead of \s* for POSIX compatibility
    echo "$response" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | sed 's/^v//'
}

validate_version() {
    local version="$1"
    if ! echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
        error "Invalid version format: $version
Expected format: X.Y.Z (e.g., 5.5.0)"
    fi
}

download() {
    local url="$1"
    local output="$2"

    info "Downloading from $url"

    if command -v curl >/dev/null 2>&1; then
        curl -fSL --progress-bar -o "$output" "$url" || {
            local http_code
            http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
            error "Download failed: $url

Possible causes:
  - Network connectivity issues (HTTP status: $http_code)
  - GitHub rate limiting (try again in a few minutes)
  - Release artifacts not yet available for this version
  - Firewall or proxy blocking the connection

Troubleshooting:
  1. Verify the URL is accessible: curl -I \"$url\"
  2. Try a specific version: VERSION=0.2.9 sh install.sh
  3. Check releases: https://github.com/${GITHUB_REPO}/releases

Alternative installation methods:
  - Homebrew (macOS/Linux): brew install rp1-run/tap/rp1
  - Scoop (Windows): scoop install rp1
  - Manual download: https://github.com/${GITHUB_REPO}/releases"
        }
    elif command -v wget >/dev/null 2>&1; then
        wget -q --show-progress -O "$output" "$url" || {
            local http_code
            http_code=$(wget --spider -S "$url" 2>&1 | grep "HTTP/" | tail -1 | awk '{print $2}' || echo "000")
            error "Download failed: $url

Possible causes:
  - Network connectivity issues (HTTP status: $http_code)
  - GitHub rate limiting (try again in a few minutes)
  - Release artifacts not yet available for this version
  - Firewall or proxy blocking the connection

Troubleshooting:
  1. Verify the URL is accessible: wget --spider \"$url\"
  2. Try a specific version: VERSION=0.2.9 sh install.sh
  3. Check releases: https://github.com/${GITHUB_REPO}/releases

Alternative installation methods:
  - Homebrew (macOS/Linux): brew install rp1-run/tap/rp1
  - Scoop (Windows): scoop install rp1
  - Manual download: https://github.com/${GITHUB_REPO}/releases"
        }
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

calculate_sha256() {
    local file="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        error "Neither sha256sum nor shasum found. Cannot verify checksum."
    fi
}

verify_checksum() {
    local file="$1"
    local checksums_file="$2"
    local expected_filename="$3"

    info "Verifying checksum..."

    local expected_checksum
    expected_checksum=$(grep "$expected_filename" "$checksums_file" | cut -d' ' -f1)

    if [ -z "$expected_checksum" ]; then
        error "Could not find checksum for $expected_filename in checksums.txt"
    fi

    local actual_checksum
    actual_checksum=$(calculate_sha256 "$file")

    if [ "$expected_checksum" != "$actual_checksum" ]; then
        error "Checksum verification failed!
Expected: $expected_checksum
Got:      $actual_checksum

The downloaded binary may have been tampered with.
Please report this issue at: https://github.com/${GITHUB_REPO}/issues"
    fi

    success "Checksum verified"
}

install_plugins() {
    local install_dir="$1"

    echo ""
    printf "${BOLD}Plugin Installation${NC}\n"
    echo "=============================="
    echo ""

    info "Installing rp1 plugins..."
    if "$install_dir/$BINARY_NAME" install 2>/dev/null; then
        success "Plugins installed successfully"
    else
        warn "Plugin installation failed. Run 'rp1 install' manually after installation."
    fi
}

main() {
    echo ""
    printf "${BOLD}rp1 Binary Installer${NC}\n"
    echo "=============================="
    echo ""

    local os arch
    os=$(detect_os)
    arch=$(detect_arch)

    info "Detected platform: ${os}-${arch}"

    local version
    if [ -n "${VERSION:-}" ]; then
        version="$VERSION"
        validate_version "$version"
        info "Using specified version: $version"
    else
        if [ -n "${LOCAL_ARTIFACTS_DIR:-}" ]; then
            error "VERSION must be set when using LOCAL_ARTIFACTS_DIR"
        fi
        info "Fetching latest version..."
        version=$(get_latest_version)
        if [ -z "$version" ]; then
            error "Could not determine latest version"
        fi
        info "Latest version: $version"
    fi

    local install_dir="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
    info "Install directory: $install_dir"

    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT

    local binary_filename="${BINARY_NAME}-${os}-${arch}"
    local binary_path="$tmp_dir/$binary_filename"
    local checksums_path="$tmp_dir/checksums.txt"

    if [ -n "${LOCAL_ARTIFACTS_DIR:-}" ]; then
        info "Using local artifacts from $LOCAL_ARTIFACTS_DIR"
        local local_binary="$LOCAL_ARTIFACTS_DIR/$binary_filename"
        local local_checksums="$LOCAL_ARTIFACTS_DIR/checksums.txt"
        if [ ! -f "$local_binary" ]; then
            error "Binary not found: $local_binary"
        fi
        if [ ! -f "$local_checksums" ]; then
            error "Checksums not found: $local_checksums"
        fi
        cp "$local_binary" "$binary_path"
        cp "$local_checksums" "$checksums_path"
    else
        local download_url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/${binary_filename}"
        local checksums_url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/checksums.txt"
        download "$download_url" "$binary_path"
        download "$checksums_url" "$checksums_path"
    fi

    verify_checksum "$binary_path" "$checksums_path" "$binary_filename"

    info "Installing to $install_dir..."

    if [ ! -d "$install_dir" ]; then
        if ! maybe_sudo mkdir -p "$install_dir"; then
            error "Cannot create directory: $install_dir
Try running with sudo:
  curl -fsSL https://rp1.run/install.sh | sudo sh
Or install to a user-writable directory:
  curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=\$HOME/.local/bin sh"
        fi
    fi

    local final_path="$install_dir/$BINARY_NAME"
    if ! maybe_sudo mv "$binary_path" "$final_path"; then
        error "Cannot install to $install_dir
Try running with sudo:
  curl -fsSL https://rp1.run/install.sh | sudo sh
Or install to a user-writable directory:
  curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=\$HOME/.local/bin sh"
    fi

    chmod +x "$final_path"

    echo ""
    info "Verifying installation..."

    if [ -x "$final_path" ]; then
        local installed_version
        installed_version=$("$final_path" --version 2>/dev/null || echo "unknown")

        echo ""
        success "rp1 installed successfully!"
        echo ""
        printf "  ${BOLD}Version:${NC}  %s\n" "$installed_version"
        printf "  ${BOLD}Location:${NC} %s\n" "$final_path"
        echo ""

        case ":$PATH:" in
            *":$install_dir:"*)
                printf "Run '${BOLD}rp1 --help${NC}' to get started.\n"
                ;;
            *)
                warn "$install_dir is not in your PATH"
                echo ""
                echo "Add it to your shell configuration:"
                echo ""
                echo "  # For bash (~/.bashrc):"
                echo "  export PATH=\"$install_dir:\$PATH\""
                echo ""
                echo "  # For zsh (~/.zshrc):"
                echo "  export PATH=\"$install_dir:\$PATH\""
                echo ""
                echo "Then restart your terminal or run: source ~/.bashrc (or ~/.zshrc)"
                ;;
        esac
    else
        error "Installation verification failed. Binary is not executable."
    fi

    # Plugin installation
    if [ "${SKIP_PLUGINS:-0}" != "1" ]; then
        install_plugins "$install_dir"
    fi

    # macOS Gatekeeper note
    if [ "$os" = "darwin" ]; then
        echo ""
        printf "${YELLOW}Note for macOS users:${NC}\n"
        echo "If you see a security warning when first running rp1, you may need to:"
        echo "  1. Open System Settings > Privacy & Security"
        echo "  2. Click 'Allow Anyway' next to the rp1 warning"
        echo "  3. Or run: xattr -d com.apple.quarantine $final_path"
        echo ""
    fi
}

main "$@"
