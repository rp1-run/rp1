# System Architecture

**Project**: rp1-eval-project
**Architecture Pattern**: Simple script-based utility

## Overview

Single-layer TypeScript project with Bun runtime. No external dependencies beyond Bun built-ins. Entry point runs directly, utilities are pure functions.

## Layers

| Layer | Purpose | Files |
|-------|---------|-------|
| Entry | Application startup | `src/index.ts` |
| Utils | Reusable logic | `src/utils.ts` |
| Tests | Validation | `src/utils.test.ts` |

## Scripts

- `bun run dev` - Run entry point
- `bun test` - Run test suite
- `bun run lint` - Lint check
- `bun run format` - Format check
