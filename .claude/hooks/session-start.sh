#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Skip Puppeteer browser download (not needed in remote environments)
export PUPPETEER_SKIP_DOWNLOAD=true

# Install CLI dependencies (postinstall script also handles web-ui)
cd "$CLAUDE_PROJECT_DIR/cli" && bun install

# Install evals dependencies
cd "$CLAUDE_PROJECT_DIR/evals" && bun install
