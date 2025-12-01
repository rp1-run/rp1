#!/usr/bin/env bash
set -euo pipefail

echo "🧹 Cleaning uv cache..."
uv cache clean

echo "🔨 Building fresh wheel..."
cd tools/install
uv build --quiet
cd ../..

echo "📦 Installing from local wheel..."
uvx --from ./tools/install rp1-opencode install
