#!/bin/bash
set -e

echo "🔨 Building OpenCode artifacts..."

# Navigate to CLI directory
cd "$(dirname "$0")/../cli"

# Build CLI if needed
if [ ! -f "dist/main.js" ]; then
    echo "Building CLI..."
    bun install
    bun run build
fi

# Build artifacts
echo "Generating OpenCode artifacts..."
bun run dev build:opencode

# Verify artifacts
ARTIFACT_DIR="dist/opencode"
if [ -d "$ARTIFACT_DIR" ]; then
    CMD_COUNT=$(find "$ARTIFACT_DIR" -name "*.md" -path "*/commands/*" | wc -l)
    AGENT_COUNT=$(find "$ARTIFACT_DIR" -name "*.md" -path "*/agents/*" | wc -l)
    echo "✅ Generated $CMD_COUNT commands, $AGENT_COUNT agents"
else
    echo "❌ Artifact generation failed"
    exit 1
fi

echo "✅ OpenCode artifacts ready in cli/dist/opencode/"
