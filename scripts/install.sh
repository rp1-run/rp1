#!/bin/sh
set -eu

# rp1 Binary Installer
# Usage: curl -fsSL https://rp1.run/install.sh | sh
#        curl -fsSL https://rp1.run/install.sh | VERSION=5.5.0 sh
#        curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=/opt/bin sh

# Configuration
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

# Output helpers
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

# Detect OS
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

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            echo "x64"
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

# Get latest version from GitHub API
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

# Validate version format
validate_version() {
    local version="$1"
    if ! echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
        error "Invalid version format: $version
Expected format: X.Y.Z (e.g., 5.5.0)"
    fi
}

# Download file with progress
download() {
    local url="$1"
    local output="$2"

    info "Downloading from $url"

    if command -v curl >/dev/null 2>&1; then
        curl -fSL --progress-bar -o "$output" "$url" || {
            error "Download failed: $url
Check your internet connection and try again."
        }
    elif command -v wget >/dev/null 2>&1; then
        wget -q --show-progress -O "$output" "$url" || {
            error "Download failed: $url
Check your internet connection and try again."
        }
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Calculate SHA256 checksum
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

# Verify checksum
verify_checksum() {
    local file="$1"
    local checksums_file="$2"
    local expected_filename="$3"

    info "Verifying checksum..."

    # Extract expected checksum for our binary
    local expected_checksum
    expected_checksum=$(grep "$expected_filename" "$checksums_file" | cut -d' ' -f1)

    if [ -z "$expected_checksum" ]; then
        error "Could not find checksum for $expected_filename in checksums.txt"
    fi

    # Calculate actual checksum
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

# Main installation function
main() {
    echo ""
    printf "${BOLD}rp1 Binary Installer${NC}\n"
    echo "=============================="
    echo ""

    # Detect platform
    local os arch
    os=$(detect_os)
    arch=$(detect_arch)

    info "Detected platform: ${os}-${arch}"

    # Determine version
    local version
    if [ -n "${VERSION:-}" ]; then
        version="$VERSION"
        validate_version "$version"
        info "Using specified version: $version"
    else
        info "Fetching latest version..."
        version=$(get_latest_version)
        if [ -z "$version" ]; then
            error "Could not determine latest version"
        fi
        info "Latest version: $version"
    fi

    # Determine install directory
    local install_dir="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
    info "Install directory: $install_dir"

    # Create temp directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT

    # Construct download URLs
    local binary_filename="${BINARY_NAME}-${os}-${arch}"
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/${binary_filename}"
    local checksums_url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/checksums.txt"

    # Download binary and checksums
    local binary_path="$tmp_dir/$binary_filename"
    local checksums_path="$tmp_dir/checksums.txt"

    download "$download_url" "$binary_path"
    download "$checksums_url" "$checksums_path"

    # Verify checksum
    verify_checksum "$binary_path" "$checksums_path" "$binary_filename"

    # Install binary
    info "Installing to $install_dir..."

    # Create install directory if it doesn't exist
    if [ ! -d "$install_dir" ]; then
        if ! mkdir -p "$install_dir" 2>/dev/null; then
            error "Cannot create directory: $install_dir
Try running with sudo:
  curl -fsSL https://rp1.run/install.sh | sudo sh
Or install to a user-writable directory:
  curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=\$HOME/.local/bin sh"
        fi
    fi

    # Move binary to install location
    local final_path="$install_dir/$BINARY_NAME"
    if ! mv "$binary_path" "$final_path" 2>/dev/null; then
        if ! sudo mv "$binary_path" "$final_path" 2>/dev/null; then
            error "Cannot install to $install_dir
Try running with sudo:
  curl -fsSL https://rp1.run/install.sh | sudo sh
Or install to a user-writable directory:
  curl -fsSL https://rp1.run/install.sh | INSTALL_DIR=\$HOME/.local/bin sh"
        fi
    fi

    # Set executable permissions
    chmod +x "$final_path"

    # Verify installation
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

        # Check if install_dir is in PATH
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

# Run main
main "$@"
