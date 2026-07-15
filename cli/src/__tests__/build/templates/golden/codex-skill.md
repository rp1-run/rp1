---
name: rp1-dev-build
description: Build plugin artifacts
allowed-tools: "functions.exec_command(echo *)"
metadata:
  rp1:
    plugin: dev
    name: build
  version: 1.0.0

  tags:
    - workflow

  created: 2026-01-01

  author: cloud-on-prem/rp1

  argument-hint: "<feature-id>"

---


## Host Context

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `antigravity`, `gemini-cli`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `codex`.

Use `CURRENT_HOST` for host-specific decisions. Pass `--harness $CURRENT_HOST` only to `rp1 agent-tools emit`, the generated workflow bootstrap command, or another `rp1 agent-tools` command whose help explicitly documents `--harness`; do not add it to `resolve-args`, `rp1-root-dir`, or other commands.

Codex skill content with $rp1-base-knowledge-build reference.
