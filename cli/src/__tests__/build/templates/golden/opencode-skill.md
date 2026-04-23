---
name: rp1-base-knowledge-build
description: Build knowledge base artifacts


allowed-tools:

  - Bash

  - Read


metadata:
  rp1:
    plugin: base
    name: knowledge-build
---


## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `opencode`.

Use `CURRENT_HOST` for host-specific decisions and as the `--harness` value in all `rp1 agent-tools` commands.

This is the skill content with rp1-base/knowledge-load reference.
