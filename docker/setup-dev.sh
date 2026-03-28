#!/usr/bin/env bash
# setup-dev.sh — Bootstrap the Active Developer container from mounted rp1 source.
# Runs automatically when the dev container starts. Builds the local rp1
# binary, installs plugins to all harness platforms, then drops into zsh.

set -euo pipefail

# ── Verify mount ────────────────────────────────────────────────────────────

if [ ! -d "/src/rp1" ]; then
    echo ""
    echo "ERROR: /src/rp1 is not mounted."
    echo ""
    echo "Start the container with a bind mount, e.g.:"
    echo "  docker run -it -v \$(pwd):/src/rp1 <image>"
    echo ""
    echo "Or use the just recipe:"
    echo "  just start-docker-dev"
    echo ""
    exit 1
fi

if [ ! -f "/src/rp1/justfile" ]; then
    echo ""
    echo "ERROR: /src/rp1 does not look like an rp1 source tree (no justfile found)."
    echo "Make sure you are mounting the rp1 repository root."
    echo ""
    exit 1
fi

echo ""
echo "━━━ rp1 dev container setup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Install CLI dependencies ────────────────────────────────────────────────

echo "[1/3] Installing CLI dependencies..."
cd /src/rp1/cli && bun install
echo ""

# ── Build local rp1 binary ──────────────────────────────────────────────────

echo "[2/3] Building rp1 from local source..."
cd /src/rp1 && just build-local-dev
echo ""

# ── Ensure binary is on PATH ────────────────────────────────────────────────

export PATH="/src/rp1/bin:$PATH"

if ! command -v rp1 &>/dev/null; then
    echo ""
    echo "ERROR: rp1 binary not found at /src/rp1/bin/rp1 after build."
    echo "Check the build output above for errors."
    echo ""
    exit 1
fi

echo "rp1 binary: $(rp1 --version)"
echo ""

# ── Install plugins using the local build ───────────────────────────────────

echo "[3/3] Installing plugins to all platforms..."
cd /src/rp1 && just install
echo ""

# ── Done ────────────────────────────────────────────────────────────────────

echo "━━━ Setup complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  rp1:    $(rp1 --version)"
echo "  mount:  /src/rp1"
echo "  target: ~/target/zod-to-json-schema"
echo ""

# ── Drop into zsh ───────────────────────────────────────────────────────────

exec zsh
