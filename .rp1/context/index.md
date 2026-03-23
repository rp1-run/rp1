# rp1 - Knowledge Base

**Type**: Monorepo
**Languages**: TypeScript, TSX, Markdown, Shell
**Version**: 0.6.0
**Updated**: 2026-03-23
**Projects**: 7 (cli, cli/web-ui, plugins/base, plugins/dev, plugins/utils, evals, packages/catppuccin-mermaid)

## Project Summary

rp1 is an AI agent orchestration platform that provides a plugin ecosystem for coding agents. It delivers skills, agents, and workflows to host tools (Claude Code, OpenCode, Codex) via a build pipeline that transforms markdown-first prompt definitions into platform-specific artifacts, with a Web UI dashboard for live workflow monitoring.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `cli/src/main.ts` (CLI), `cli/web-ui/src/main.tsx` (dashboard) |
| Key Pattern | Plugin Architecture with Skill-Agent delegation |
| Tech Stack | Bun, TypeScript, fp-ts, React, Vite, SQLite, LiquidJS, GoReleaser |

## Projects Overview

| Project | Purpose | Language | Entry Point |
|---------|---------|----------|-------------|
| cli | CLI commands, build pipeline, agent tools, install | TypeScript | `src/main.ts` |
| cli/web-ui | Dashboard SPA + Bun server + daemon | TSX/TypeScript | `src/main.tsx` |
| plugins/base | KB generation, docs, mermaid, research, strategy | Markdown | `skills/knowledge-build/SKILL.md` |
| plugins/dev | Feature delivery, PR review, code quality | Markdown | `skills/build/SKILL.md` |
| plugins/utils | Prompt authoring, eval extraction, tersification | Markdown | `skills/prompt-writer/SKILL.md` |
| evals | Prompt attestation and eval suite verification | TypeScript | `src/index.ts` |
| packages/catppuccin-mermaid | Catppuccin-flavored Mermaid theme package | TypeScript | `src/index.ts` |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~150 | System design, component relationships, data flows |
| modules.md | ~144 | Component breakdown, module responsibilities |
| patterns.md | ~80 | Code conventions, implementation patterns |
| concept_map.md | ~195 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic or system-wide analysis | All files |
| Understanding domain concepts | `concept_map.md` |
