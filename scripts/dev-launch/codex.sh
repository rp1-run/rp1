#!/usr/bin/env bash
# Launch Codex with local dev plugins (auto-builds if stale).
set -e

if [ ! -d "dist/codex/base" ] || \
   [ "$(find plugins/ -newer dist/codex/base -name '*.md' 2>/dev/null | head -1)" ]; then
    echo "Building Codex artifacts..."
    cd cli && bun run scripts/build-codex.ts && cd ..
fi
./bin/rp1 install codex --yes --artifacts-dir dist/codex
codex
