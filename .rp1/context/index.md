# rp1 - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, Markdown, Shell, Python
**Version**: 0.3.0
**Updated**: 2026-01-19

## Project Summary

rp1 is a Claude Code plugin system that automates development workflows through constitutional prompting. It provides three plugins: rp1-base (foundation: knowledge management, documentation, strategy, security), rp1-dev (workflows: features, code quality, PR management), and rp1-utils (prompt utilities).

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `/build`, `/knowledge-build` |
| Key Pattern | Constitutional Agents with Map-Reduce Orchestration |
| Tech Stack | TypeScript CLI, Markdown Prompts, fp-ts, Bun, GoReleaser |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~371 | System design, component relationships, data flows |
| modules.md | ~340 | Component breakdown, module responsibilities |
| patterns.md | ~169 | Code conventions, implementation patterns |
| concept_map.md | ~275 | Domain terminology, business concepts |

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
│   ├── base/                  # Foundation plugin (9 commands, 12 agents, 5 skills)
│   │   ├── .claude-plugin/    # Plugin metadata
│   │   ├── agents/            # Constitutional agents
│   │   ├── commands/          # Slash commands (thin wrappers)
│   │   └── skills/            # Reusable capabilities
│   ├── dev/                   # Development plugin (15 commands, 24 agents, 1 skill)
│   │   ├── .claude-plugin/    # Plugin metadata (depends on base)
│   │   ├── agents/            # Constitutional agents
│   │   ├── commands/          # Slash commands
│   │   └── skills/            # worktree-workflow skill
│   └── utils/                 # Utility plugin (1 command, 1 agent, 1 skill)
│       └── ...
├── cli/                       # Cross-platform CLI
│   ├── src/                   # TypeScript source (fp-ts patterns)
│   │   ├── commands/          # CLI commands (init, install, view, update, verify)
│   │   ├── init/              # Project initialization
│   │   ├── install/           # Plugin installation
│   │   └── agent-tools/       # AI agent tools (mmd-validate, worktree, rp1-root-dir, comment-extract)
│   └── web-ui/                # React documentation viewer
├── packages/                  # NPM packages
│   └── catppuccin-mermaid/    # Mermaid theme library
├── docs/                      # MkDocs Material site
├── evals/                     # Promptfoo evaluation suites
│   ├── src/attestation/       # Content-addressable prompt tracking
│   ├── providers/             # Custom promptfoo providers (claude-with-tools)
│   └── suites/                # Test suites (mirrors plugins structure)
│       ├── shared/            # Shared assertions and hooks
│       └── rp1-dev/           # Dev plugin evals
├── .github/workflows/         # CI/CD (release-please, GoReleaser)
└── .rp1/context/              # Auto-generated knowledge base
```

## Key Commands

```bash
# End-to-end feature workflow (6-step)
/build my-feature             # Full workflow: requirements -> design -> tasks -> build -> verify -> archive
/build-fast "task"            # Quick iteration development with scope gating

# Individual feature steps
/blueprint my-prd
/feature-edit my-feature
/feature-archive my-feature

# KB generation
/knowledge-build              # Full: 10-15 min, Incremental: 2-5 min

# Code quality
/code-check                   # Fast hygiene (lint, test)
/code-audit                   # Pattern analysis
/code-investigate             # Bug investigation

# PR review
/pr-review                    # Map-reduce review with confidence gating
/address-pr-feedback          # Collect, triage, fix PR comments

# Evaluations (two-phase workflow)
just run-evals rp1-dev/build verbose=true   # Run evals (overwrites output file)
just attest-evals rp1-dev-build.json        # Generate attestation from output
just verify-evals                           # Check all attestations current
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams
- **[modules.md](modules.md)**: Component breakdown
- **[patterns.md](patterns.md)**: Code conventions
- **[concept_map.md](concept_map.md)**: Domain terminology
- **Documentation**: https://rp1.run
- **GitHub**: https://github.com/rp1-run/rp1
