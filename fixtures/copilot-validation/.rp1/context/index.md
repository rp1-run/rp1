# Copilot Validation Fixture - Knowledge Base

**Type**: Validation Fixture
**Purpose**: Verify that Copilot CLI can load and follow KB instructions from AGENTS.md

## Project Summary

This is a minimal rp1 project fixture used to validate GitHub Copilot CLI's compatibility with rp1's harness primitives. It is not a real project -- it exists solely for testing.

## Validation Marker

If you are reading this file, it means AGENTS.md-based KB bootstrapping is working. Report this as **PASS** for Primitive 1 (AGENTS.md loading).

## KB File Manifest

| File | Purpose |
|------|---------|
| index.md | This file -- project overview and KB entry point |

## Conventions

- Echo responses with `[FIXTURE]` prefix to distinguish from regular output
- Use `.rp1/work/` for any artifact output
- Agent output files go to `.rp1/work/agent-output/`
