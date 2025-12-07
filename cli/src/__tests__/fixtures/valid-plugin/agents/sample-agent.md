---
name: sample-agent
description: A sample agent for testing purposes
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
---

You are a sample agent.

Use /rp1-base:knowledge-load to load context.

```bash
# This is in a code block and should NOT be transformed
/rp1-dev:example should stay as is here
```

But outside code blocks, /rp1-dev:feature-build should be transformed.
