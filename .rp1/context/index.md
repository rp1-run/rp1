# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, TSX, Markdown
**Version**: 0.5.1
**Updated**: 2026-03-09

## Project Summary

rp1 is a multi-agentic plugin system that automates development workflows through constitutional prompting. It provides skills and agents for Claude Code, OpenCode, and Codex CLI platforms, covering knowledge management, feature development, code quality, PR review, and more. The CLI includes a real-time Web UI dashboard, SQLite-backed work tracking, and cross-platform binary distribution.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` (Commander CLI) |
| Key Pattern | Skill-Agent Delegation (SKILL.md -> constitutional agents) |
| Tech Stack | Bun, TypeScript, fp-ts, React, Vite, Tailwind, SQLite |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~165 | System design, component relationships, data flows |
| modules.md | ~153 | Component breakdown, module responsibilities |
| patterns.md | ~65 | Code conventions, implementation patterns |
| concept_map.md | ~172 | Domain terminology, business concepts |

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
├── src/
│   ├── main.ts              # CLI entry point (Commander)
│   ├── commands/             # CLI commands (install, init, build, uninstall)
│   ├── agent-tools/          # Agent runtime tools (work, worktree, state-machine, github-pr)
│   ├── install/              # Multi-platform installers (claudecode, codex, opencode)
│   ├── init/                 # Project initialization wizard
│   ├── build/                # Artifact build pipeline (codex, opencode)
│   └── __tests__/            # Test suite (1062+ tests)
├── shared/                   # CLIError, fp-ts re-exports, logger
├── web-ui/                   # React/Vite status dashboard
│   ├── src/server/           # Bun HTTP + WebSocket server
│   └── src/pages/            # Dashboard pages
├── scripts/                  # Build scripts (build-codex.ts, build-opencode.ts)
plugins/
├── base/                     # KB management, docs, strategy, security (17 skills, 13 agents)
├── dev/                      # Feature workflows, code quality, PRs (21 skills, 32 agents)
└── utils/                    # Prompt utilities (5 skills, 4 agents)
evals/                        # Promptfoo evals with attestation
packages/
└── catppuccin-mermaid/       # Mermaid theme library
docs/                         # User documentation (MkDocs Material)
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, data flows, integrations
- **[modules.md](modules.md)**: Component breakdown, dependencies, metrics
- **[patterns.md](patterns.md)**: Code conventions, error handling, testing idioms
- **[concept_map.md](concept_map.md)**: Domain terminology, concept relationships
