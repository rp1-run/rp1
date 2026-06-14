#!/usr/bin/env bash
# test-install.sh — Simulate rp1 installation in a clean container.
#
# Usage:
#   test-install.sh fresh                    # Download + install latest production release
#   test-install.sh fresh --from-source      # Build from /src/rp1 and install (raw copy)
#   test-install.sh fresh --local-install    # Build from /src/rp1 and install (through install script)
#   test-install.sh update                   # Download + upgrade to latest production release
#   test-install.sh update --from-source     # Build from /src/rp1 and upgrade (raw copy)
#   test-install.sh update --local-install   # Build from /src/rp1 and upgrade (through install script)
#   test-install.sh clean                    # Remove all rp1 artifacts (reset to clean room)
#
# --from-source    builds a binary from the mounted source and copies it directly.
# --local-install  builds a binary, stages it with checksums (goreleaser-style),
#                  then runs the real install script against local artifacts.
#                  This exercises checksum verification, file permissions, and PATH checks.

set -euo pipefail

INSTALL_DIR="$HOME/.local/bin"
BINARY_NAME="rp1"
SOURCE_DIR="/src/rp1"

# ── Helpers ────────────────────────────────────────────────────────────────

info()    { printf "\033[0;34m==>\033[0m \033[1m%s\033[0m\n" "$1"; }
success() { printf "\033[0;32m==>\033[0m \033[1m%s\033[0m\n" "$1"; }
warn()    { printf "\033[0;33mWarning:\033[0m %s\n" "$1" >&2; }
error()   { printf "\033[0;31mError:\033[0m %s\n" "$1" >&2; exit 1; }

# ── Clean ──────────────────────────────────────────────────────────────────

do_clean() {
    info "Removing all rp1 artifacts..."

    # Binary
    rm -f "$INSTALL_DIR/$BINARY_NAME"

    # rp1 data directory
    rm -rf "$HOME/.rp1"

    # Claude Code plugins (marketplace + installed plugins)
    if command -v claude &>/dev/null; then
        claude plugin uninstall rp1-base 2>/dev/null || true
        claude plugin uninstall rp1-dev 2>/dev/null || true
        claude plugin marketplace remove rp1-run 2>/dev/null || true
    fi

    # OpenCode config (rp1 sections)
    rm -rf "$HOME/.config/opencode/agents/rp1" 2>/dev/null || true
    rm -rf "$HOME/.config/opencode/skills/rp1-"* 2>/dev/null || true

    # Codex config (rp1 sections)
    rm -rf "$HOME/.codex/agents/rp1" 2>/dev/null || true
    rm -rf "$HOME/.codex/skills/rp1-"* 2>/dev/null || true

    # Marketplace cache
    rm -rf "$HOME/.cache/rp1" 2>/dev/null || true

    success "Clean complete — container is back to clean room state"
    echo ""
    echo "  Harness CLIs are still installed:"
    command -v claude &>/dev/null && echo "    claude:   $(claude --version 2>/dev/null || echo 'installed')"
    command -v opencode &>/dev/null && echo "    opencode: $(opencode --version 2>/dev/null || echo 'installed')"
    command -v codex &>/dev/null && echo "    codex:    $(codex --version 2>/dev/null || echo 'installed')"
    echo ""
}

# ── Build from source ─────────────────────────────────────────────────────

build_from_source() {
    if [ ! -d "$SOURCE_DIR" ]; then
        error "$SOURCE_DIR is not mounted. Start the container with: just start-docker-stable"
    fi
    if [ ! -f "$SOURCE_DIR/justfile" ]; then
        error "$SOURCE_DIR does not look like an rp1 source tree (no justfile found)."
    fi

    info "Building rp1 from source at $SOURCE_DIR..."

    # Install CLI dependencies
    info "Installing CLI dependencies..."
    cd "$SOURCE_DIR/cli" && bun install

    # Build plugins and generate assets
    info "Building plugins and generating assets..."
    cd "$SOURCE_DIR/cli" && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && \
        bun run generate:assets

    # Compile binary to a local tmp dir (virtiofs can't do atomic rename)
    local build_tmp
    build_tmp=$(mktemp -d)
    info "Compiling binary (linux/arm64)..."
    cd "$build_tmp" && \
        bun build "$SOURCE_DIR/cli/src/main.ts" --compile \
        --outfile "$build_tmp/rp1" \
        --define __RP1_DEV_BUILD__=true \
        --define __RP1_DEV_SHA__='"'$(git -C "$SOURCE_DIR" rev-parse --short=5 HEAD 2>/dev/null)'"'

    # Install the built binary
    mkdir -p "$INSTALL_DIR"
    cp "$build_tmp/rp1" "$INSTALL_DIR/$BINARY_NAME"
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    cd "$HOME"
    rm -rf "$build_tmp"

    success "Built and installed: $($BINARY_NAME --version 2>/dev/null || echo 'unknown')"
}

# ── Build local artifacts (binary + checksums, goreleaser-style) ──────────

build_local_artifacts() {
    if [ ! -d "$SOURCE_DIR" ]; then
        error "$SOURCE_DIR is not mounted. Start the container with: just start-docker-stable"
    fi
    if [ ! -f "$SOURCE_DIR/justfile" ]; then
        error "$SOURCE_DIR does not look like an rp1 source tree (no justfile found)."
    fi

    local artifacts_dir="/tmp/rp1-local-artifacts"
    rm -rf "$artifacts_dir"
    mkdir -p "$artifacts_dir"

    local os arch binary_filename
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)
    case "$arch" in
        aarch64) arch="arm64" ;;
        x86_64)  arch="amd64" ;;
    esac
    binary_filename="rp1-${os}-${arch}"

    info "Building rp1 from source at $SOURCE_DIR..."

    # Install CLI dependencies
    info "Installing CLI dependencies..."
    cd "$SOURCE_DIR/cli" && bun install

    # Build plugins and generate assets
    info "Building plugins and generating assets..."
    cd "$SOURCE_DIR/cli" && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && \
        RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && \
        bun run generate:assets

    # Compile binary (virtiofs can't do atomic rename, use local tmp)
    local build_tmp
    build_tmp=$(mktemp -d)
    info "Compiling binary (${os}/${arch})..."
    cd "$build_tmp" && \
        bun build "$SOURCE_DIR/cli/src/main.ts" --compile \
        --outfile "$build_tmp/rp1" \
        --define __RP1_DEV_BUILD__=true \
        --define __RP1_DEV_SHA__='"'$(git -C "$SOURCE_DIR" rev-parse --short=5 HEAD 2>/dev/null)'"'

    # Stage artifacts with goreleaser naming
    cp "$build_tmp/rp1" "$artifacts_dir/$binary_filename"
    chmod +x "$artifacts_dir/$binary_filename"
    cd "$artifacts_dir" && sha256sum "$binary_filename" > checksums.txt
    cd "$HOME"
    rm -rf "$build_tmp"

    # Extract version from package.json
    local version
    version=$(grep '"version"' "$SOURCE_DIR/cli/package.json" | sed 's/.*"\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/')
    if [ -z "$version" ]; then
        error "Could not extract version from $SOURCE_DIR/cli/package.json"
    fi

    success "Local artifacts staged in $artifacts_dir"
    echo "  Binary:    $artifacts_dir/$binary_filename"
    echo "  Checksums: $artifacts_dir/checksums.txt"
    echo "  Version:   $version"

    # Export for caller
    STAGED_VERSION="$version"
    STAGED_ARTIFACTS_DIR="$artifacts_dir"
}

# ── Install binary ─────────────────────────────────────────────────────────

install_binary() {
    local mode="${1:-production}"

    case "$mode" in
        from-source)
            build_from_source
            ;;
        local-install)
            build_local_artifacts
            info "Running install script with local artifacts..."
            echo ""
            VERSION="$STAGED_VERSION" \
            LOCAL_ARTIFACTS_DIR="$STAGED_ARTIFACTS_DIR" \
            INSTALL_DIR="$INSTALL_DIR" \
            SKIP_PLUGINS=1 \
                sh "$SOURCE_DIR/scripts/install.sh"
            echo ""
            ;;
        *)
            # Run the real install script (same as a user would)
            info "Running production install script (same as a real user)..."
            echo ""
            curl -fsSL https://rp1.run/install.sh | INSTALL_DIR="$INSTALL_DIR" SKIP_PLUGINS=1 sh
            echo ""
            ;;
    esac

    # Verify
    if ! command -v "$BINARY_NAME" &>/dev/null; then
        error "Binary not found on PATH after install. Check that $INSTALL_DIR is in PATH."
    fi
}

# ── Install plugins ────────────────────────────────────────────────────────

install_plugins() {
    echo ""
    info "Installing rp1 plugins to all detected platforms..."
    echo ""
    "$INSTALL_DIR/$BINARY_NAME" install -y
}

# ── Fresh install ──────────────────────────────────────────────────────────

do_fresh() {
    local mode="${1:-production}"

    echo ""
    echo "━━━ Simulating fresh rp1 installation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    case "$mode" in
        from-source)    echo "    (from local source at $SOURCE_DIR)" ;;
        local-install)  echo "    (local artifacts through install script)" ;;
        *)              echo "    (from production install script)" ;;
    esac
    echo ""

    # Ensure clean state first
    do_clean

    echo ""
    info "Starting fresh installation..."
    echo ""

    install_binary "$mode"
    install_plugins

    echo ""
    echo "━━━ Fresh install simulation complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  rp1:      $($BINARY_NAME --version 2>/dev/null || echo 'unknown')"
    echo "  claude:   $(claude --version 2>/dev/null || echo 'not found')"
    echo "  opencode: $(opencode --version 2>/dev/null || echo 'not found')"
    echo "  codex:    $(codex --version 2>/dev/null || echo 'not found')"
    echo ""
}

# ── Update install ─────────────────────────────────────────────────────────

do_update() {
    local mode="${1:-production}"

    echo ""
    echo "━━━ Simulating rp1 update ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    case "$mode" in
        from-source)    echo "    (from local source at $SOURCE_DIR)" ;;
        local-install)  echo "    (local artifacts through install script)" ;;
        *)              echo "    (from production install script)" ;;
    esac
    echo ""

    # Check that rp1 is currently installed
    if ! command -v "$BINARY_NAME" &>/dev/null; then
        error "rp1 is not installed. Run 'test-install.sh fresh' first to simulate an initial install."
    fi

    local old_version
    old_version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")
    info "Current version: $old_version"

    install_binary "$mode"
    install_plugins

    local new_version
    new_version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")

    echo ""
    echo "━━━ Update simulation complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Before: $old_version"
    echo "  After:  $new_version"
    echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────

usage() {
    echo "Usage: test-install.sh <command> [--from-source | --local-install]"
    echo ""
    echo "Commands:"
    echo "  fresh                    Simulate first-time install (production release)"
    echo "  fresh --from-source      Simulate first-time install (build from /src/rp1, raw copy)"
    echo "  fresh --local-install    Simulate first-time install (build from /src/rp1, through install script)"
    echo "  update                   Simulate upgrade (production release)"
    echo "  update --from-source     Simulate upgrade (build from /src/rp1, raw copy)"
    echo "  update --local-install   Simulate upgrade (build from /src/rp1, through install script)"
    echo "  clean                    Remove all rp1 artifacts (reset to clean room)"
    echo ""
    echo "Modes:"
    echo "  (default)          Runs the real install script (curl | sh)."
    echo "  --from-source      Builds a binary from the mounted source and copies it directly."
    echo "  --local-install    Builds a binary from the mounted source, stages it with checksums,"
    echo "                     then runs the real install script against local artifacts."
}

mode="production"
case "${2:-}" in
    --from-source)   mode="from-source" ;;
    --local-install) mode="local-install" ;;
esac

case "${1:-}" in
    fresh)  do_fresh "$mode" ;;
    update) do_update "$mode" ;;
    clean)  do_clean ;;
    *)      usage; exit 1 ;;
esac
