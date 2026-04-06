# Technology Stack Matrix

**Repository**: rp1
**Last Updated**: 2026-04-06
**Total Projects**: 6 logical areas

## Project Technologies

| Project | Language | Framework | Storage | Build Tool | Deployment |
|---------|----------|-----------|---------|------------|------------|
| `cli` | TypeScript | Bun + Commander + fp-ts | SQLite via agent tools | Bun | Standalone binaries |
| `cli/web-ui` | TSX | React + Vite + Tailwind | Reads workflow state via Bun APIs | Bun/Vite | Local Bun server |
| `plugins/base` | Markdown + TS ecosystem | rp1 skill/agent prompts | KB files under `.rp1/context` | CLI plugin build pipeline | Installed into host tools |
| `plugins/dev` | Markdown + TS ecosystem | rp1 workflow prompts | Work-state and KB contracts | CLI plugin build pipeline | Installed into host tools |
| `plugins/utils` | Markdown + TS ecosystem | Prompt utility workflows | N/A | CLI plugin build pipeline | Installed into host tools |
| `evals` | TypeScript | Prompt/eval tooling | JSON artifacts | Bun | CI and local runs |

## Shared Technologies

### Runtime
- **Bun**: Primary runtime and packaging tool.
- **TypeScript**: Dominant implementation language.
- **fp-ts**: Functional error and control-flow style in the CLI/runtime.
- **SQLite**: Embedded local state for workflow tracking.

### Frontend
- **React**: Dashboard application model.
- **Vite**: Development and bundling workflow for the Web UI.
- **Tailwind CSS**: Styling layer for the dashboard.
- **Commit Mono**: Sole typeface (variable font, weights 400-500).
- **Design System**: Warm stone gray palette with HSL tokens, amber accent, muted red failure color.

### Documentation and Content
- **MkDocs Material**: Published product documentation.
- **Mermaid**: Diagrams in KB and docs.
- **Markdown-first prompts**: Skills and agents are authored as markdown assets.

### Delivery and Integration
- **Commander**: CLI command registration.
- **GitHub API**: PR workflow integration.
- **GoReleaser**: Binary release distribution.
- **Cloudflare Pages**: Docs hosting target.

## Technology Standards

- Prefer **Bun** over Node.js for new work unless compatibility requires otherwise.
- Keep the **single-executable CLI** constraint in mind when adding assets or runtime files.
- Use **fp-ts pragmatically**, favoring clear `match`, `map`, and `flatMap` flows over abstraction-heavy code.
- Preserve **Markdown-based workflow authoring** for skills and agents.

## Architecture Decisions

### Why Bun + TypeScript
**Decision**: Use Bun and TypeScript for the CLI, web UI, and most tooling.
**Rationale**:
- Fast local iteration and packaging.
- Shared language across CLI, UI, and support packages.
- Works well with the repo’s typed runtime and functional patterns.

### Why Markdown-Authored Workflows
**Decision**: Keep skills and agents in markdown rather than code-only orchestration.
**Rationale**:
- Prompt behavior, constraints, and output contracts stay inspectable.
- Cross-platform plugin builds can transform the same source assets for multiple hosts.

### Why Local SQLite State
**Decision**: Use embedded SQLite for workflow tracking.
**Rationale**:
- Keeps the system local-first and deterministic.
- Supports the dashboard without introducing a remote control plane.

### Why Warm Stone Design System
**Decision**: Replace Catppuccin palette with a custom warm stone gray design system using HSL tokens.
**Rationale**:
- Typographically-driven minimal aesthetic reduces visual noise for developer workflow monitoring.
- Single typeface (Commit Mono) with 16px max size creates visual calm.
- Three semantic colors (primary, amber attention, red failure) eliminate ambiguity.
- Removed @xyflow/react and @dagrejs/dagre — vertical CSS step list handles rp1's small workflows without graph rendering overhead.

## Toolchain Compatibility

| Tool | Role | Notes |
|------|------|-------|
| Bun | Runtime/build/test | Default package manager and runtime |
| Git | Source control | Required for diff-aware and worktree-aware workflows |
| MkDocs | Docs site | Used for published documentation |
| Supported host tools | Execution surfaces | Claude Code, OpenCode, Codex CLI |

## Current Technology Debt

- Prompt-heavy workflow assets require careful docs and eval coverage to avoid behavioral drift.
- Shared contracts between agent tools and the Web UI create fast-moving integration points.
- Plugin content is logically first-class even when not represented as standalone packages, so dependency knowledge must stay documented explicitly.
