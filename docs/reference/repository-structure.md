# Repository Structure

This page provides an overview of the rp1 repository structure to help new contributors navigate the codebase.

## Directory Overview

```
rp1/
├── cli/                    # Cross-platform CLI application
├── docs/                   # Documentation site (MkDocs)
├── packages/               # Shared NPM packages
├── plugins/                # Claude Code plugin definitions
├── scripts/                # Build and maintenance scripts
├── .rp1/                   # Project's own knowledge base
└── assets/                 # Static assets (logos, etc.)
```

## Core Directories

### `cli/` - Command Line Interface

The TypeScript CLI application built with Bun.

```
cli/
├── src/                    # Source code
│   ├── commands/           # CLI commands (init, install, view)
│   ├── init/               # Project initialization logic
│   ├── install/            # Plugin installation
│   ├── agent-tools/        # AI agent helper tools
│   └── lib/                # Shared utilities
├── web-ui/                 # React-based documentation viewer
│   ├── src/
│   │   ├── app/            # Main application routes
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── providers/      # Context providers
│   │   └── server/         # Bun server for web-ui
│   └── package.json
├── shared/                 # Code shared between CLI and web-ui
├── scripts/                # Build scripts
├── package.json
└── tsconfig.json
```

**Key files:**

- `src/main.ts` - CLI entry point
- `src/lib/config.ts` - Configuration management
- `web-ui/src/main.tsx` - Web UI entry point

### `plugins/` - Claude Code Plugins

Plugin definitions that provide slash commands and agents.

```
plugins/
├── base/                   # Foundation plugin
│   ├── .claude-plugin/     # Plugin metadata
│   │   └── package.json    # Plugin configuration
│   ├── agents/             # Constitutional agent prompts
│   ├── commands/           # Slash command definitions
│   └── skills/             # Reusable capability prompts
├── dev/                    # Development workflow plugin
│   ├── .claude-plugin/
│   ├── agents/
│   └── commands/
└── utils/                  # Utility plugin
    ├── .claude-plugin/
    ├── agents/
    └── commands/
```

**Plugin structure:**

| Plugin | Purpose | Dependencies |
|--------|---------|--------------|
| `base` | Knowledge management, documentation, strategy | None |
| `dev` | Feature workflows, code quality, PR management | Depends on `base` |
| `utils` | Prompt utilities | None |

### `docs/` - Documentation Site

MkDocs Material documentation source.

```
docs/
├── assets/                 # Images, logos, SVGs
├── concepts/               # Conceptual documentation
├── getting-started/        # Onboarding guides
├── guides/                 # How-to guides
├── reference/              # Command reference docs
├── troubleshooting/        # Common issues
├── stylesheets/            # Custom CSS
├── overrides/              # Theme overrides
├── index.md                # Home page
└── hooks.py                # Custom MkDocs hooks
```

### `.rp1/` - Knowledge Base

Auto-generated project knowledge used by agents.

```
.rp1/
├── context/                # Generated KB files
│   ├── index.md            # KB entry point
│   ├── architecture.md     # System design
│   ├── modules.md          # Component breakdown
│   ├── patterns.md         # Code conventions
│   └── concept_map.md      # Domain terminology
└── work/                   # Feature work artifacts
    ├── features/           # Active feature documents
    ├── archives/           # Completed feature archives
    └── quick-builds/       # One-off task records
```

## Configuration Files

| File | Purpose |
|------|---------|
| `mkdocs.yml` | Documentation site configuration |
| `Justfile` | Task runner commands (like Make) |
| `.goreleaser.yml` | Binary release configuration |
| `lefthook.yml` | Git hooks configuration |
| `release-please-config.json` | Automated release management |
| `CLAUDE.md` | AI assistant context (loads AGENTS.md) |
| `AGENTS.md` | Detailed AI development guide |

## Build Outputs

After running `just build`, the following directories are created:

```
cli/
├── dist/                   # Compiled CLI
│   ├── opencode/           # OpenCode plugin format
│   └── claude-code/        # Claude Code plugin format
└── web-ui/
    └── dist/               # Compiled web UI
        ├── client/         # Static frontend assets
        └── server.js       # Bun server bundle
```

## Development Workflow

1. **Making CLI changes**: Edit files in `cli/src/`, run `just build`
2. **Making plugin changes**: Edit files in `plugins/`, run `just build`
3. **Making docs changes**: Edit files in `docs/`, run `mkdocs serve`
4. **Testing**: Run `just test` for all tests, `just lint` for linting

## Quick Navigation

| Task | Location |
|------|----------|
| Add a new CLI command | `cli/src/commands/` |
| Add a new plugin command | `plugins/{plugin}/commands/` |
| Add a new agent | `plugins/{plugin}/agents/` |
| Add documentation | `docs/` + update `mkdocs.yml` nav |
| Modify build process | `cli/scripts/` or `Justfile` |
