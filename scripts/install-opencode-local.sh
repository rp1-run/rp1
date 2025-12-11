#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../cli"

echo "📦 Installing dependencies..."
bun install --quiet

echo "🔨 Building CLI..."
bun run build

echo "📦 Building OpenCode artifacts..."
bun run build:opencode

echo "📦 Installing to OpenCode..."
bun run dev install:opencode --artifacts-dir ./dist/opencode -y

echo "✅ Installation complete!"
