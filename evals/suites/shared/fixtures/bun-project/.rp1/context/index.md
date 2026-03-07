# rp1-eval-project - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript
**Version**: 1.0.0
**Updated**: 2026-01-01

## Project Summary

A minimal Bun/TypeScript project used for evaluating rp1 agent workflows. Contains a simple entry point and utility module with tests.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `src/index.ts` |
| Test Runner | `bun test` |
| Tech Stack | Bun, TypeScript |

## KB File Manifest

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~20 | System design |
| modules.md | ~20 | Component breakdown |
| patterns.md | ~20 | Code conventions |
| concept_map.md | ~15 | Domain terminology |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: .rp1/context/{filename}
```

## Project Structure

```
src/
  index.ts       - Main entry point
  utils.ts       - Utility functions
  utils.test.ts  - Tests for utilities
```
