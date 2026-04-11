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

`CURRENT_HOST` is `codex` for this prompt. Use it directly for host-specific decisions. Do not infer the host from the runtime environment.

Codex skill content with $rp1-base-knowledge-build reference.
