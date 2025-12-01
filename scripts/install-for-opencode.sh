#!/usr/bin/env bash
# Install rp1-opencode from the latest GitHub release
#
# Usage (private repo - requires gh CLI):
#   gh release download --repo rp1-run/rp1 --pattern 'install-for-opencode.sh' --dir /tmp && bash /tmp/install-for-opencode.sh
#
# Or run directly if you have the repo cloned:
#   ./scripts/install-for-opencode.sh
#
set -euo pipefail

REPO="rp1-run/rp1"

echo "🔍 Fetching latest rp1-opencode release..."

# Requires gh CLI for private repo access
if ! command -v gh &> /dev/null; then
    echo "❌ gh CLI not found"
    echo "   Install with: brew install gh"
    echo "   Then authenticate: gh auth login"
    exit 1
fi

if ! gh auth status &> /dev/null 2>&1; then
    echo "❌ gh CLI not authenticated"
    echo "   Run: gh auth login"
    exit 1
fi

# Get releases from GitHub API
RELEASES_JSON=$(gh api "repos/$REPO/releases" --jq '.' 2>/dev/null || echo "")

if [ -z "$RELEASES_JSON" ]; then
    echo "❌ Failed to fetch releases from GitHub"
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

# Extract tag from URL path: .../download/{tag}/filename.whl
TAG=$(echo "$WHEEL_URL" | sed -E 's|.*/download/([^/]+)/.*|\1|')
WHEEL_NAME=$(basename "$WHEEL_URL")
VERSION=$(echo "$WHEEL_NAME" | grep -o 'rp1_opencode-[0-9][0-9.]*' | sed 's/rp1_opencode-//')

echo "📦 Found version: $VERSION"

# Create temp directory for wheel download
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "⬇️  Downloading wheel..."

# Use gh release download for authenticated access
gh release download "$TAG" --repo "$REPO" --pattern "$WHEEL_NAME" --dir "$TMPDIR" 2>/dev/null
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
echo "To run other rp1-opencode commands, download the wheel first:"
echo "  gh release download $TAG --repo $REPO --pattern '$WHEEL_NAME' --dir /tmp"
echo "  uvx --from /tmp/$WHEEL_NAME rp1-opencode verify"
