---
name: code-check
description: "Fast code hygiene validation (lints, formatters, tests, coverage) for quick development loop feedback."
metadata:
  category: quality
  is_workflow: false
  version: 2.0.0
  tags:
    - testing
    - code
    - quality
    - development
  created: 2025-11-08
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      default: ""
      description: "Optional feature identifier for work-root-scoped reports"
    - name: TEST_SCOPE
      type: string
      required: false
      default: "all"
      description: "Optional test scope override"
    - name: COVERAGE_TARGET
      type: string
      required: false
      default: "80"
      description: "Optional coverage target percentage"
  sub_agents:
    - "rp1-dev:code-checker"
---

# Code Check - Fast Code Quality Validation

Performs fast code hygiene checks during development including linters, formatters, tests, and coverage measurement. Designed for quick feedback in the development loop.

Invoke the code-checker agent:

{% dispatch_agent "rp1-dev:code-checker" %}
FEATURE_ID: {FEATURE_ID}
TEST_SCOPE: {TEST_SCOPE}
COVERAGE_TARGET: {COVERAGE_TARGET}
KB_ROOT: {kbRoot}
WORK_ROOT: {workRoot}
{% enddispatch_agent %}
The agent will:

- Auto-detect build tools (Rust, JS/TS, Python, Go, Java, Kotlin, Ruby)
- Run linters (clippy, eslint, ruff, golangci-lint, checkstyle, ktlint, rubocop)
- Run formatters check (rustfmt, prettier, black, gofmt, spotless, etc.)
- Execute test suite with coverage measurement
- Generate indexed report.
- Provide quick pass/fail status
