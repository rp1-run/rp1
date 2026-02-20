# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, Markdown, YAML, Shell
**Version**: 0.4.7
**Updated**: 2026-02-20

## Project Summary

rp1 is a multi-agentic plugin system that automates development workflows through constitutional prompting. It provides AI-assisted commands for knowledge management, feature development, code quality, and PR review, targeting Claude Code and OpenCode platforms with cross-platform distribution via Bun-compiled binaries.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` |
| Key Pattern | Command-Agent Delegation with Map-Reduce Orchestration |
| Tech Stack | TypeScript, Bun, fp-ts, React/Vite (web-ui), Promptfoo (evals) |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~172 | System design, component relationships, data flows |
| modules.md | ~129 | Component breakdown, module responsibilities |
| patterns.md | ~135 | Code conventions, implementation patterns |
| concept_map.md | ~142 | Domain terminology, business concepts |

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
│   ├── main.ts              # CLI entry point
│   ├── agent-tools/         # AI agent tool framework
│   ├── shared/              # Shared utilities (paths.ts)
│   ├── init/                # Project initialization
│   ├── install/             # Plugin installation
│   └── config/              # Tool registry
├── web-ui/                  # React status dashboard
plugins/
├── base/                    # Foundation: KB, docs, strategy, skills
├── dev/                     # Development: features, PRs, code quality
└── utils/                   # Prompt utilities
evals/                       # Promptfoo evaluation system
docs/                        # MkDocs documentation site
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, data flows, integrations
- **[modules.md](modules.md)**: Module breakdown, dependencies, metrics
- **[patterns.md](patterns.md)**: Code conventions, fp-ts patterns, agent patterns
- **[concept_map.md](concept_map.md)**: Domain terminology, bounded contexts
