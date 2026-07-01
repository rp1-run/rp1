---
name: rp1-base-deep-agent
description: Agent with deep tier for Antigravity
kind: local
tools:
  - read_file
  - run_shell_command
model: opus
max_turns: 30
metadata:
  rp1:
    runtime_delegation: dynamic_define_subagent
    static_agents_discovery: non_contract
---

## Host Context

Identify the active AI coding harness as `antigravity`. Antigravity generated workflows export `CURRENT_HOST=antigravity` before bootstrap and keep that value for later emitted workflow events.

Pass `--harness` only to `rp1 agent-tools emit`, the generated workflow bootstrap command, or another `rp1 agent-tools` command whose help explicitly documents `--harness`. Do not add it to `resolve-args`, `rp1-root-dir`, or other commands.

Agent content for Antigravity tier test.
