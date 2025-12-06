#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Building CLI and artifacts..."
cd "$(dirname "$0")/../cli"
bun install --quiet
bun run build

echo "📦 Building OpenCode artifacts..."
bun run dev build:opencode

echo "📦 Installing to OpenCode..."
bun run dev install:opencode

echo "✅ Installation complete!"
