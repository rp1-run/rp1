# Project Charter: sprite
**Version**: 1.0.0 | **Status**: Complete | **Created**: 2026-04-30 17:23:25 AEST | **Last Updated**: 2026-04-30 18:08:20 AEST

## Vision
sprite is a terminal-based ACP client and orchestration boundary for agentic coding harnesses. It helps rp1 users launch supported harnesses, run real rp1 workflows end to end, and receive reliable lifecycle and progress state without manual hook wiring.

## Problem & Context
rp1 users need a reliable way to run rp1 workflows across coding harnesses without host-specific hooks and setup. Today lifecycle orchestration and progress tracking are clunky and inconsistent across Claude Code, Codex, OpenCode, GitHub Copilot, and similar tools, making adoption harder for individuals and teams.

Solving this now gives rp1 a harness-agnostic execution boundary that can track agent progress cleanly while reducing setup friction.

## Target Users
Primary users are individual developers, development teams, and tech leads or architects already aligned with rp1's core user segments. They want consistent, high-quality agentic coding workflows that understand project context, reduce prompt crafting and context switching, and produce repeatable results across supported harnesses.

Today they rely on host-specific setup, hooks, and conventions, which makes workflow execution harder to standardize.

## Business Rationale
sprite makes rp1 workflows easier to adopt, easier to standardize across teams, and more reusable across coding harnesses. Compared with today's host-specific setup, it provides a cleaner execution boundary for lifecycle orchestration and progress tracking while preserving the terminal-first workflow users already expect from coding agents.

## Scope Guardrails
### Will Do
- Implement a basic ACP client that can launch at least one supported coding harness.
- Run supported rp1 workflows end to end through the terminal client.
- Provide the orchestration boundary rp1 needs for lifecycle and progress tracking across harnesses.
- Surface clear agent status transitions and useful diagnostics for recoverable failures.

### Won't Do
- Build status lines or extra terminal widget features for v1.
- Recreate every ordinary terminal frontend capability.
- Depend on the same hook-heavy setup path the project is intended to replace.
- Optimize for a narrow demo-only path instead of a reusable harness boundary.

## Success Criteria
V1 succeeds when a user can launch at least one supported coding harness through sprite, run a real rp1 workflow end to end, and receive reliable lifecycle and progress state without manual hook setup.

Observable outcomes include successful workflow completion, clear agent status transitions, recoverable failures with useful diagnostics, and a simpler setup path than today's host-specific wiring.

V1 fails if it cannot run real workflows end to end, requires hook-heavy setup, loses or misreports progress state, or only works for a narrow demo path rather than a reusable harness boundary.
