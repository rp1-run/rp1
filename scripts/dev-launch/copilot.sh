#!/usr/bin/env bash
# Launch Copilot CLI with local --plugin-dir plugin roots for maintainer iteration.
# This is the fast loop and intentionally does not mutate rp1-local native install state.
set -e

if [ ! -d "dist/copilot/base" ] || \
   [ ! -d "dist/copilot/dev" ] || \
   [ ! -f "dist/copilot/base/plugin.json" ] || \
   [ ! -f "dist/copilot/dev/plugin.json" ] || \
   { [ -n "${PLUGIN_UTILS:-}" ] && [ ! -d "dist/copilot/utils" ]; } || \
   { [ -n "${PLUGIN_UTILS:-}" ] && [ ! -f "dist/copilot/utils/plugin.json" ]; } || \
   [ "$(find plugins/ cli/src/build cli/scripts -newer dist/copilot/base/plugin.json \( -name '*.md' -o -name '*.liquid' -o -name '*.ts' -o -name '*.json' \) 2>/dev/null | head -1)" ]; then
    echo "Building Copilot CLI artifacts for the --plugin-dir dev loop..."
    cd cli
    if [ -n "${PLUGIN_UTILS:-}" ]; then
        RP1_BUILD_INTERNAL=1 bun run scripts/build-copilot.ts
    else
        bun run scripts/build-copilot.ts
    fi
    cd ..
fi
plugin_dirs=(--plugin-dir dist/copilot/base --plugin-dir dist/copilot/dev)
if [ -n "${PLUGIN_UTILS:-}" ]; then
    plugin_dirs+=(--plugin-dir dist/copilot/utils)
fi
gh copilot -- "${plugin_dirs[@]}"
