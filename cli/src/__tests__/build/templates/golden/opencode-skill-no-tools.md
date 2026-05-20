---
name: rp1-base-simple-skill
description: A simple skill without tools

metadata:
  rp1:
    plugin: base
    name: simple-skill
---


## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `antigravity`, `gemini-cli`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `opencode`.

Use `CURRENT_HOST` for host-specific decisions. Pass `--harness $CURRENT_HOST` only to `rp1 agent-tools emit`, the generated workflow bootstrap command, or another `rp1 agent-tools` command whose help explicitly documents `--harness`; do not add it to `resolve-args`, `rp1-root-dir`, or other commands.

Simple skill content.
