#!/usr/bin/env bash
# Internal: remove production rp1 platform installs and build artifacts (no prompt).
# User-facing wrapper lives at scripts/install/rm-stable.sh.
set -e

rm -rf ~/.config/opencode/plugin/rp1*
rm -rf ~/.config/opencode/agents/rp1*
rm -rf ~/.config/opencode/skills/rp1-*/
claude plugin marketplace rm rp1-run 2>/dev/null || true
claude plugin marketplace rm rp1-local 2>/dev/null || true
rm -rf ~/.rp1/claude/plugins/
rm -rf ~/.agents/skills/rp1-*/
rm -rf ~/.codex/skills/rp1-*/
rm -rf ~/.codex/agents/rp1/
rm -rf ~/.config/github-copilot/skills/rp1-*/
rm -rf ~/.config/github-copilot/agents/rp1*
rm -rf ~/.gemini/antigravity-cli/rp1-*
rm -f bin/rp1
rm -f ~/.rp1/platform-versions.json
