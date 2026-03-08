# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, TSX, Markdown
**Version**: 0.5.1
**Updated**: 2026-03-08

## Project Summary

rp1 is a multi-agentic plugin system that automates development workflows through constitutional prompting. It provides skills (slash commands) and autonomous agents for knowledge management, feature development, PR review, and code quality — distributed as plugins for Claude Code and OpenCode platforms, with a real-time status dashboard.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` (CLI), `cli/web-ui/src/main.tsx` (Dashboard) |
| Key Pattern | Skill-Agent Delegation (SKILL.md -> constitutional agents via Task tool) |
| Tech Stack | Bun, TypeScript, fp-ts, React, Vite, Tailwind, SQLite, Commander |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~189 | System design, component relationships, data flows |
| modules.md | ~144 | Component breakdown, module responsibilities |
| patterns.md | ~65 | Code conventions, implementation patterns |
| concept_map.md | ~156 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: {{$RP1_ROOT}}/context/{filename}
```

## Project Structure

```
cli/
├── src/                  # CLI core (main.ts, commands/, agent-tools/)
│   ├── agent-tools/      # Runtime tools for AI agents (work, worktree, state-machine, github-pr, mmd-validate)
│   ├── commands/          # Commander.js CLI commands
│   ├── install/           # Plugin installation with backup/restore
│   ├── init/              # 12-step project initialization wizard
│   ├── build/             # OpenCode artifact build pipeline
│   └── assets/            # Embedded asset bundling
├── shared/               # Cross-cutting: errors (CLIError), fp-ts re-exports, logger
├── web-ui/               # React/Vite status dashboard (server + frontend)
│   ├── src/server/       # Bun HTTP + WebSocket server (port 7710)
│   └── src/components/v2/ # Dashboard UI components
├── scripts/              # Build and development scripts
plugins/
├── base/                 # Foundation: KB, docs, strategy, security (17 skills, 13 agents)
├── dev/                  # Development: features, code quality, PRs (21 skills, 32 agents)
└── utils/                # Meta: prompt engineering, evals (5 skills, 4 agents)
evals/                    # Promptfoo evals with content-addressable attestation
packages/
└── catppuccin-mermaid/   # Mermaid theme library
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layer architecture, data flows, integration points
- **[modules.md](modules.md)**: 19 modules with components, dependencies, metrics
- **[patterns.md](patterns.md)**: Naming, types, error handling, validation, testing idioms
- **[concept_map.md](concept_map.md)**: 17 core concepts, terminology glossary, concept relationships
