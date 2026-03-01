# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, Markdown, Shell, Python
**Version**: 0.4.8
**Updated**: 2026-03-01

## Project Summary

rp1 is a multi-agentic tool plugin system that automates development workflows through constitutional prompting. It provides 39 skills and 49 agents across three plugins (base, dev, utils) that run on Claude Code and OpenCode platforms, compiled into a single cross-platform CLI binary with embedded assets.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` (Commander.js CLI) |
| Key Pattern | Skill-Agent Delegation (SKILL.md → constitutional agents) |
| Tech Stack | Bun, TypeScript, fp-ts, React/Vite (web-ui), SQLite |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~131 | System design, component relationships, deployment |
| modules.md | ~120 | Component breakdown, module responsibilities, dependencies |
| patterns.md | ~98 | Code conventions, error handling, implementation patterns |
| concept_map.md | ~100 | Domain terminology, business concepts, relationships |

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
plugins/
├── base/           # Foundation: KB, docs, strategy, security (15 skills, 13 agents)
├── dev/            # Development: features, code quality, PR review (19 skills, 32 agents)
└── utils/          # Prompt utilities: eval gen, optimization (5 skills, 4 agents)
cli/
├── src/
│   ├── main.ts           # CLI entry point (Commander.js)
│   ├── commands/         # CLI commands (init, install, verify, build, settings)
│   ├── install/          # OpenCode + Claude Code plugin installation
│   ├── build/            # OpenCode artifact build pipeline
│   ├── assets/           # Embedded asset bundling/extraction
│   ├── agent-tools/      # Runtime tools for AI agents (worktree, github-pr, work)
│   ├── init/             # Project initialization wizard
│   └── shared/           # Errors, logger, prompts, spinner (fp-ts)
├── web-ui/               # React/Vite status dashboard
└── scripts/              # Build scripts (generate-asset-imports, postinstall)
evals/
├── src/attestation/      # Content-addressable prompt tracking
├── providers/            # Custom promptfoo provider (claude-with-tools)
└── suites/               # Eval suite configs (rp1-dev/build, build-fast)
```

## Navigation

- **[architecture.md](architecture.md)**: System design, layers, interaction flows, deployment
- **[modules.md](modules.md)**: 17 modules with dependencies, metrics, cross-module patterns
- **[patterns.md](patterns.md)**: fp-ts error handling, constitutional agents, build pipeline, atomic install
- **[concept_map.md](concept_map.md)**: Core concepts (Plugin, Skill, Agent, KB, Worktree), terminology glossary
