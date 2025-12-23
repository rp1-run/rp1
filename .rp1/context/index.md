# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, Markdown, Shell
**Version**: 0.2.3
**Updated**: 2025-12-23

## Project Summary

rp1 is a Claude Code plugin system that automates development workflows through constitutional prompting. It provides three plugins: rp1-base (foundation: knowledge management, documentation, strategy, security), rp1-dev (workflows: features, code quality, PR management), and rp1-utils (prompt utilities).

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `/knowledge-build`, `/feature-build` |
| Key Pattern | Constitutional Agents with Map-Reduce Orchestration |
| Tech Stack | TypeScript CLI, Markdown Prompts, fp-ts, Bun, GoReleaser |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~254 | System design, component relationships, data flows |
| modules.md | ~246 | Component breakdown, module responsibilities |
| patterns.md | ~123 | Code conventions, implementation patterns |
| concept_map.md | ~181 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |
| Security audit | `architecture.md` |

## How to Load

```
Read: .rp1/context/{filename}
```

## Repository Structure

```
rp1/
├── plugins/
│   ├── base/                  # Foundation plugin (9 commands, 13 agents, 5 skills)
│   │   ├── .claude-plugin/    # Plugin metadata
│   │   ├── agents/            # Constitutional agents
│   │   ├── commands/          # Slash commands (thin wrappers)
│   │   └── skills/            # Reusable capabilities
│   ├── dev/                   # Development plugin (19 commands, 18 agents)
│   │   ├── .claude-plugin/    # Plugin metadata (depends on base)
│   │   ├── agents/            # Constitutional agents
│   │   └── commands/          # Slash commands
│   └── utils/                 # Utility plugin (1 command, 1 agent)
│       └── ...
├── cli/                       # Cross-platform CLI
│   ├── src/                   # TypeScript source (fp-ts patterns)
│   └── web-ui/                # React documentation viewer
├── docs/                      # MkDocs Material site
├── .github/workflows/         # CI/CD (release-please, GoReleaser)
└── .rp1/context/              # Auto-generated knowledge base
```

## Key Commands

```bash
# KB generation
/knowledge-build        # Full: 10-15 min, Incremental: 2-5 min

# Feature workflow (6-step)
/blueprint my-prd
/feature-requirements my-feature
/feature-design my-feature
/feature-tasks my-feature
/feature-build my-feature
/feature-verify my-feature

# Code quality
/code-check             # Fast hygiene (lint, test)
/code-audit             # Pattern analysis

# PR review
/pr-review              # Map-reduce review with confidence gating
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **Documentation**: https://rp1.run
- **GitHub**: https://github.com/rp1-run/rp1
