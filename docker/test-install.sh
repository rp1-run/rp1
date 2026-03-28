#!/usr/bin/env bash
# test-install.sh — Simulate rp1 installation in a clean container.
#
# Usage:
#   test-install.sh fresh                  # Download + install latest production release
#   test-install.sh fresh --from-source    # Build from /src/rp1 and install
#   test-install.sh update                 # Download + upgrade to latest production release
#   test-install.sh update --from-source   # Build from /src/rp1 and upgrade
#   test-install.sh clean                  # Remove all rp1 artifacts (reset to clean room)
#
# The --from-source flag builds a linux/arm64 binary from the mounted rp1 source
# tree at /src/rp1 (requires the mount). Without it, the real production install
# script runs — exactly what a user would experience.

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
        --define __RP1_DEV_BUILD__=true

    # Install the built binary
    mkdir -p "$INSTALL_DIR"
    cp "$build_tmp/rp1" "$INSTALL_DIR/$BINARY_NAME"
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    rm -rf "$build_tmp"

    success "Built and installed: $($BINARY_NAME --version 2>/dev/null || echo 'unknown')"
}

# ── Install binary ─────────────────────────────────────────────────────────

install_binary() {
    local from_source="${1:-false}"

    if [ "$from_source" = "true" ]; then
        build_from_source
    else
        # Run the real install script (same as a user would)
        info "Running production install script (same as a real user)..."
        echo ""
        curl -fsSL https://rp1.run/install.sh | INSTALL_DIR="$INSTALL_DIR" SKIP_PLUGINS=1 sh
        echo ""
    fi

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
    local from_source="${1:-false}"

    echo ""
    echo "━━━ Simulating fresh rp1 installation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ "$from_source" = "true" ]; then
        echo "    (from local source at $SOURCE_DIR)"
    else
        echo "    (from production install script)"
    fi
    echo ""

    # Ensure clean state first
    do_clean

    echo ""
    info "Starting fresh installation..."
    echo ""

    install_binary "$from_source"
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
    local from_source="${1:-false}"

    echo ""
    echo "━━━ Simulating rp1 update ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ "$from_source" = "true" ]; then
        echo "    (from local source at $SOURCE_DIR)"
    else
        echo "    (from production install script)"
    fi
    echo ""

    # Check that rp1 is currently installed
    if ! command -v "$BINARY_NAME" &>/dev/null; then
        error "rp1 is not installed. Run 'test-install.sh fresh' first to simulate an initial install."
    fi

    local old_version
    old_version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")
    info "Current version: $old_version"

    install_binary "$from_source"
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
    echo "Usage: test-install.sh <command> [--from-source]"
    echo ""
    echo "Commands:"
    echo "  fresh                  Simulate first-time install (production release)"
    echo "  fresh --from-source    Simulate first-time install (build from /src/rp1)"
    echo "  update                 Simulate upgrade (production release)"
    echo "  update --from-source   Simulate upgrade (build from /src/rp1)"
    echo "  clean                  Remove all rp1 artifacts (reset to clean room)"
    echo ""
    echo "Without --from-source, runs the real install script (curl | sh)."
    echo "With --from-source, builds a linux/arm64 binary from the mounted source."
}

from_source=false
if [ "${2:-}" = "--from-source" ]; then
    from_source=true
fi

case "${1:-}" in
    fresh)  do_fresh "$from_source" ;;
    update) do_update "$from_source" ;;
    clean)  do_clean ;;
    *)      usage; exit 1 ;;
esac
