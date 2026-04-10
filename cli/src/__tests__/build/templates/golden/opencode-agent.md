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

`CURRENT_HOST` is `opencode` for this prompt. Use it directly for host-specific decisions. Do not infer the host from the runtime environment.

Agent content with /rp1-dev/build reference.
