---
description: Agent with inherited model
mode: subagent

tools:
  bash: false
  write: false
  edit: false
---

## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `opencode`.

Use `CURRENT_HOST` for host-specific decisions and as the `--harness` value in all `rp1 agent-tools` commands.

Agent content with no tools.
