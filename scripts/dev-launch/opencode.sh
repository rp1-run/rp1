#!/usr/bin/env bash
# Launch OpenCode with local dev plugins (auto-builds if stale).
set -e

if [ ! -d "dist/opencode/base" ] || \
   [ "$(find plugins/ -newer dist/opencode/base -name '*.md' 2>/dev/null | head -1)" ]; then
    echo "Building OpenCode artifacts..."
    cd cli && bun run scripts/build-opencode.ts && cd ..
fi
./bin/rp1 install opencode --yes --artifacts-dir dist/opencode
opencode
