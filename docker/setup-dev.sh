#!/usr/bin/env bash
# setup-dev.sh — Bootstrap the Active Developer container from mounted rp1 source.
# Runs automatically when the dev container starts. Builds the local rp1
# binary, installs plugins to all harness platforms, then runs the requested
# command or drops into zsh.

set -euo pipefail

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

echo "[1/3] Installing CLI dependencies..."
cd /src/rp1/cli && bun install
echo ""

echo "[2/3] Building rp1 from local source..."
# Bun's --compile uses atomic rename which fails on virtiofs mounts.
# Build to a local tmp dir first, then copy the binary to the mount.
BUILD_TMP=$(mktemp -d)
cd /src/rp1/cli && \
    RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && \
    RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && \
    RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && \
    bun run generate:assets
# Bun's --compile creates a temp .bun-build file in CWD then renames it.
# virtiofs doesn't support atomic rename, so cd to a local dir for the compile.
cd "$BUILD_TMP" && \
    bun build /src/rp1/cli/src/main.ts --compile --outfile "$BUILD_TMP/rp1" --define __RP1_DEV_BUILD__=true
mkdir -p /src/rp1/bin
cp "$BUILD_TMP/rp1" /src/rp1/bin/rp1
cd /src/rp1
rm -rf "$BUILD_TMP"
echo ""

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

echo "[3/3] Installing plugins to detected platforms..."
rp1 install -y || echo "Warning: plugin install failed (no harness CLIs detected). Install Claude Code or OpenCode, then run 'rp1 install -y'."
echo ""

echo "━━━ Setup complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  rp1:    $(rp1 --version)"
echo "  mount:  /src/rp1"
echo "  target: ~/target/zod-to-json-schema"
echo ""

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

exec zsh
