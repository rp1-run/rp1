---
name: rp1-base-simple-skill
description: A simple skill without tools

metadata:
  rp1:
    plugin: base
    name: simple-skill
---


## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `opencode`.

Use `CURRENT_HOST` for host-specific decisions and as the `--harness` value in all `rp1 agent-tools` commands.

Simple skill content.
