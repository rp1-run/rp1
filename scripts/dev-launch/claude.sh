#!/usr/bin/env bash
# Launch Claude Code with local dev plugins (auto-builds if stale).
set -e

if [ ! -d "dist/claude-code/base" ] || \
   [ "$(find plugins/ -newer dist/claude-code/base -name '*.md' 2>/dev/null | head -1)" ]; then
    echo "Building Claude Code artifacts..."
    cd cli && bun run scripts/build-claude-code.ts && cd ..
fi
claude --plugin-dir dist/claude-code/base \
       --plugin-dir dist/claude-code/dev \
       ${PLUGIN_UTILS:+--plugin-dir dist/claude-code/utils}
