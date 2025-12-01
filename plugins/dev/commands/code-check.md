---
name: code-check
version: 2.0.0
description: Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback
tags: [testing, code, quality, development]
created: 2025-11-08
author: cloud-on-prem/rp1
---

# Code Check - Fast Code Quality Validation

Performs fast code hygiene checks during development including linters, formatters, tests, and coverage measurement. Designed for quick feedback in the development loop.

Use the Task tool to invoke the agent:

```
subagent_type: rp1-dev:code-checker
```

The agent will:

- Auto-detect build tools (Rust, JS/TS, Python, Go, Java, Kotlin, Ruby)
- Run linters (clippy, eslint, ruff, golangci-lint, checkstyle, ktlint, rubocop)
- Run formatters check (rustfmt, prettier, black, gofmt, spotless, etc.)
- Execute test suite with coverage measurement
- Generate indexed report.
- Provide quick pass/fail status
