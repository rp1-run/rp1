#!/usr/bin/env bash
# Launch Antigravity CLI with local Antigravity package assets (auto-builds if stale).
set -e

if [ ! -d "dist/antigravity/base" ] || \
   [ ! -f "dist/antigravity/base/plugin.json" ] || \
   [ "$(find plugins/ cli/src/build cli/scripts -newer dist/antigravity/base/plugin.json \( -name '*.md' -o -name '*.liquid' -o -name '*.ts' -o -name '*.json' \) 2>/dev/null | head -1)" ]; then
    echo "Building Antigravity artifacts..."
    cd cli && RP1_BUILD_INTERNAL=1 bun run scripts/build-antigravity.ts && cd ..
fi
RP1_ANTIGRAVITY_BUNDLE_DIR=dist/antigravity ./bin/rp1 install antigravity
agy
