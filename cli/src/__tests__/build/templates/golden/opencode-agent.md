---
description: A test agent for building
mode: subagent

model: claude-sonnet-4-20250514

tools:
  bash: true
  write: true
  edit: true
---

## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `opencode`.

Use `CURRENT_HOST` for host-specific decisions and as the `--harness` value in all `rp1 agent-tools` commands.

Agent content with /rp1-dev/build reference.
