#!/usr/bin/env bash
# Install rp1-opencode from the latest GitHub release
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
#
# Or run directly if you have the repo cloned:
#   ./scripts/install-for-opencode.sh
#
set -euo pipefail

REPO="rp1-run/rp1"

echo "🔍 Fetching latest rp1-opencode release..."

# Fetch releases from GitHub API (no authentication needed for public repo)
RELEASES_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases" 2>/dev/null || echo "")

if [ -z "$RELEASES_JSON" ]; then
    echo "❌ Failed to fetch releases from GitHub"
    echo "   Check your internet connection"
    exit 1
fi

# Find the versioned wheel URL (not the "latest" one)
WHEEL_URL=$(echo "$RELEASES_JSON" | \
    grep -o 'https://[^"]*rp1_opencode-[0-9][0-9.]*-py3-none-any\.whl' | \
    head -1)

if [ -z "$WHEEL_URL" ]; then
    echo "❌ Failed to find rp1-opencode wheel in releases"
    echo "   Check releases at: https://github.com/$REPO/releases"
    exit 1
fi

# Extract version from wheel filename
WHEEL_NAME=$(basename "$WHEEL_URL")
VERSION=$(echo "$WHEEL_NAME" | grep -o 'rp1_opencode-[0-9][0-9.]*' | sed 's/rp1_opencode-//')

echo "📦 Found version: $VERSION"

# Create temp directory for wheel download
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "⬇️  Downloading wheel..."

# Download wheel directly via curl
curl -fsSL "$WHEEL_URL" -o "$TMPDIR/$WHEEL_NAME"
WHEEL_PATH="$TMPDIR/$WHEEL_NAME"

if [ ! -f "$WHEEL_PATH" ]; then
    echo "❌ Failed to download wheel"
    exit 1
fi

echo "📦 Installing rp1-opencode..."
uvx --from "$WHEEL_PATH" rp1-opencode install "$@"

echo ""
echo "✅ Installation complete!"
echo ""
echo "To run other rp1-opencode commands:"
echo "  export RP1_WHL=\"$WHEEL_URL\""
echo "  uvx --from \"\$RP1_WHL\" rp1-opencode verify"
