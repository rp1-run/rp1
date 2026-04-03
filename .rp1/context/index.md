# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, TSX, Markdown, Shell
**Version**: 0.6.5-dev
**Updated**: 2026-04-03

## Project Summary

rp1 is an AI agent orchestration platform that extends coding assistants (Claude Code, OpenCode, Codex) with structured workflows, event tracking, and a real-time dashboard. It provides a plugin-based CLI that compiles markdown skill/agent definitions into platform-specific artifacts, tracks workflow execution via event-sourced SQLite state, and serves the Arcade web UI for monitoring runs, artifacts, and annotations.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Plugin-based CLI with Map-Reduce Agent Orchestration |
| Tech Stack | Bun, TypeScript, React, fp-ts, LiquidJS, SQLite, WebSocket |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~131 | System design, component relationships, data flows |
| modules.md | ~183 | Component breakdown, module responsibilities |
| patterns.md | ~61 | Code conventions, implementation patterns |
| concept_map.md | ~160 | Domain terminology, business concepts |

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
cli/
├── src/                  # CLI source (commands, agent-tools, build, install, init)
├── shared/               # Cross-cutting library (errors, fp-ts, logger)
├── web-ui/               # Arcade dashboard (React SPA + Bun server)
├── scripts/              # Build scripts (per-platform compilation)
plugins/
├── base/                 # Knowledge, documentation, Mermaid, research, security
├── dev/                  # Build workflows, PR review, blueprint, feature lifecycle
├── utils/                # Prompt authoring, eval extraction, tersification
evals/                    # Prompt attestation with content-addressable hashing
packages/
├── catppuccin-mermaid/   # Catppuccin-themed Mermaid diagrams
docs/                     # MkDocs Material documentation site
scripts/                  # Repository-level build/release scripts
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, data flows, integrations
- **[modules.md](modules.md)**: 21 modules with dependencies and cross-module patterns
- **[patterns.md](patterns.md)**: Code conventions (naming, types, errors, testing, I/O)
- **[concept_map.md](concept_map.md)**: 20+ domain concepts, terminology glossary, bounded contexts
