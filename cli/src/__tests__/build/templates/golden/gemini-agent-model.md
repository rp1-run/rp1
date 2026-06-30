---
name: rp1-base-deep-agent
description: Agent with deep tier for Gemini
kind: local
tools:
  - read_file
  - run_shell_command
model: gemini-2.5-pro
max_turns: 30
---

## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `antigravity`, `gemini-cli`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `gemini-cli`.

Use `CURRENT_HOST` for host-specific decisions. Pass `--harness $CURRENT_HOST` only to `rp1 agent-tools emit`, the generated workflow bootstrap command, or another `rp1 agent-tools` command whose help explicitly documents `--harness`; do not add it to `resolve-args`, `rp1-root-dir`, or other commands.

Agent content for Gemini tier test.
