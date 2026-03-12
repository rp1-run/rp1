---
name: code-check
description: "Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback."
metadata:
  version: 2.0.0
  tags:
    - testing
    - code
    - quality
    - development
  created: 2025-11-08
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  sub_agents:
    - "rp1-dev:code-checker"
---

# Code Check - Fast Code Quality Validation

Performs fast code hygiene checks during development including linters, formatters, tests, and coverage measurement. Designed for quick feedback in the development loop.

Invoke the code-checker agent:

{% dispatch_agent "rp1-dev:code-checker" %}

The agent will:

- Auto-detect build tools (Rust, JS/TS, Python, Go, Java, Kotlin, Ruby)
- Run linters (clippy, eslint, ruff, golangci-lint, checkstyle, ktlint, rubocop)
- Run formatters check (rustfmt, prettier, black, gofmt, spotless, etc.)
- Execute test suite with coverage measurement
- Generate indexed report.
- Provide quick pass/fail status
