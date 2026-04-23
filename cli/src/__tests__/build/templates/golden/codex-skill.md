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

Identify which AI coding harness is executing this prompt and assign `CURRENT_HOST` from: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, `unknown`. Default: `codex`.

Use `CURRENT_HOST` for host-specific decisions and as the `--harness` value in all `rp1 agent-tools` commands.

Codex skill content with $rp1-base-knowledge-build reference.
