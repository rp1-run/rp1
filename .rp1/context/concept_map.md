# Concept Map

**Repository**: rp1
**Type**: Monorepo
**Last Updated**: 2026-03-15

## Domain Summary

rp1 is a plugin-driven AI development workflow system built around a Bun and TypeScript CLI, markdown-authored skills and agents, local runtime state tracking, a live Web UI dashboard, and eval tooling for prompt attestation. The repository exists to make agent workflows inspectable, reproducible, and easier to ship across multiple host tools.

## Core Concepts

| Concept | Kind | Definition | Related |
|---------|------|------------|---------|
| Plugin | Core | Capability package such as `rp1-base`, `rp1-dev`, or `rp1-utils` that groups skills and agents. | Skill, Agent |
| Skill | Core | User-facing workflow entry point defined by `SKILL.md`; handles parameters, sequencing, and delegation. | Agent, SKILL.md Format |
| Agent | Core | Focused autonomous worker that executes the main body of a workflow in a single pass. | Skill, Knowledge Base |
| Knowledge Base | Core | Generated context in `.rp1/context/` used by agents for project understanding. | Progressive Loading, Knowledge Build |
| Progressive Loading | Workflow | Rule that agents read `index.md` first, then load only the KB files needed for the task. | Knowledge Base |
| Knowledge Build | Workflow | Map-reduce KB generation flow that scans files, runs specialist analysis, and writes durable docs. | Spatial Analysis, Map-Reduce Workflow |
| Spatial Analysis | Technical | Ranking and categorization step that decides which files matter for each KB section. | Knowledge Build |
| Map-Reduce Workflow | Workflow | Pattern where rp1 splits work into parallel specialist passes and merges structured outputs. | Knowledge Build, PR Review |
| Skill-Agent Pattern | Core | Architecture where thin skills orchestrate and agents do the substantive work. | Skill, Agent |
| SKILL.md Format | Technical | Canonical markdown contract for invocable skills, metadata, and tool permissions. | Skill, Plugin |
| State Machine | Technical | Mermaid `stateDiagram-v2` embedded in prompts that defines valid workflow steps and transitions. | Run, Agent Tools |
| Run | Core | A tracked workflow execution with status, steps, events, and artifacts. | Artifact, Web UI Dashboard |
| Artifact | Core | Typed output file registered against a run, such as docs, code, diagrams, or reports. | Run, Agent Tools |
| Agent Tools | Technical | CLI-backed runtime utilities for root resolution, run updates, artifact registration, and validation. | Run, State Machine |
| Web UI Dashboard | Technical | Local dashboard that visualizes projects, runs, workflow state, and artifacts. | Run, Artifact |
| Attestation | Workflow | Eval mechanism that hashes prompt content and dependencies to prove tested prompt versions. | Eval System |
| Eval System | Technical | Tooling that extracts assertions, runs suites, and verifies prompt dependencies through attestations. | Attestation |

## Terminology

| Term | Meaning |
|------|---------|
| `SKILL.md` | Canonical file format for an invocable rp1 skill. |
| `RP1_ROOT` | Resolved `.rp1/` workspace root used by skills and agent tools. |
| `stateDiagram-v2` | Mermaid syntax used for workflow state-machine definitions. |
| `run-id` | Identifier for an individual workflow execution. |
| `emit` | Agent-tools operation that records workflow events (status changes, artifacts, annotations). |
| `work artifact` | Agent-tools operation that registers an output file for a run. |
| `state.json` | Shareable KB generation metadata such as strategy, commit, languages, and metrics. |
| `meta.json` | Local-only KB metadata such as repo root and project path. |
| `metadata.sub_agents` | Skill metadata field listing delegated agent references. |
| Event envelope | Notification payload format used by the Web UI daemon. |

## Relationships

- Plugins contain skills and agents.
- Skills delegate execution to agents.
- Knowledge build starts with spatial analysis, then uses map-reduce passes.
- Agent tools track runs and register artifacts.
- State machines govern valid workflow transitions.
- The Web UI dashboard reads stored run state and artifacts instead of defining workflow rules.
- The eval system uses attestations to verify prompt changes through dependency chains.

## Boundaries

- Markdown prompt assets define workflow behavior; the TypeScript CLI provides the runtime and enforcement layer.
- `.rp1/context/` stores durable project knowledge, while run/event databases store transient execution state.
- State-machine tracking is opt-in and only applies to workflows that declare a `## STATE-MACHINE` section.
- The Web UI consumes workflow data; it is not the source of truth for transitions or prompt contracts.
- Eval attestation is release-confidence tooling, separate from run-time workflow tracking.
