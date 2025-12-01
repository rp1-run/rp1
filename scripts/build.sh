#!/bin/bash
set -e

echo "🔨 Building OpenCode artifacts for install tool..."

# Navigate to build tool
cd "$(dirname "$0")/../tools/build"

# Build artifacts targeting install tool
echo "Generating artifacts..."
uv run rp1-opencode-builder build --target-install-tool

# Verify artifacts
ARTIFACT_DIR="../install/dist/opencode"
if [ -d "$ARTIFACT_DIR" ]; then
    CMD_COUNT=$(find "$ARTIFACT_DIR" -name "*.md" -path "*/command/*" | wc -l)
    AGENT_COUNT=$(find "$ARTIFACT_DIR" -name "*.md" -path "*/agent/*" | wc -l)
    echo "✅ Generated $CMD_COUNT commands, $AGENT_COUNT agents"
else
    echo "❌ Artifact generation failed"
    exit 1
fi

echo "✅ Artifacts ready for packaging"
echo "📦 Install tool can now be built with bundled artifacts"
