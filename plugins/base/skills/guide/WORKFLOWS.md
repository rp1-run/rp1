# Workflow Composition Reference

Common multi-skill sequences in rp1. Each workflow describes when to use it, the skill chain, and how outputs connect.

## Feature Development Lifecycle

**When**: Building a new feature end-to-end -- from idea through implementation to merge.

**Sequence**: `/blueprint` -> `/phase-plan` (when needed) -> `/build` -> `/pr-review` -> `/address-pr-feedback`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | `/blueprint` | Project vision, feature idea | Charter + PRD in `.rp1/work/blueprints/` |
| 2 | `/phase-plan <source>` | Completed PRD or oversized requirements artifact | Durable delivery phases with child-feature handoffs |
| 3 | `/build {feature-id}` | Single feature requirements or exact child handoff command from `/phase-plan` | Requirements, design, tasks, implemented code, verified feature |
| 4 | `/pr-review` | Branch with changes | Review comments posted to PR |
| 5 | `/address-pr-feedback` | PR with review comments | Resolved comments, updated code |

**How they chain**:

- `/blueprint` produces a PRD that defines scope. If the PRD already maps cleanly to one delivery slice, continue directly to `/build`.
- Use `/phase-plan` when the PRD or requirements artifact spans multiple independently valuable features, rollout slices, or delivery phases. It creates the durable handoff between planning and feature execution. Pass an explicit PRD path or oversized `requirements.md` path as the source; if a basename or title is ambiguous, rerun with one explicit source path.
- After `/phase-plan`, invoke child delivery with the exact emitted handoff command, for example `/build auth-session-hardening PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2`. The `PHASE_PLAN_PATH` and `PHASE_ID` arguments preserve planning traceability for the child feature.
- `/build` runs six internal phases (requirements -> design -> tasks -> build -> verify -> archive). It spawns sub-agents for each phase and manages checkpoints between them. The output is a working implementation on a feature branch, and oversized scope is redirected to `/phase-plan` instead of reviving legacy tracker or milestone planning.
- After pushing the branch and opening a PR, `/pr-review` performs map-reduce analysis: splits the diff into review units, analyzes each in parallel, synthesizes findings, deduplicates comments, and posts them.
- `/address-pr-feedback` collects the posted review comments, triages them by priority, and fixes them in sequence.

**Flags**: `/build` supports `--afk` for unattended mode, `--commit` to auto-commit, `--push` to push the branch, and `--pr` to create the PR automatically.

## Quick Iteration

**When**: Making small-to-medium changes that do not need full feature ceremony.

**Options**:

### `/build-fast`

**Best for**: Focused changes with a clear scope (bug fixes, small features, refactors). Produces a persistent plan artifact for traceability.

**Sequence**: plan -> build -> [review]

| Phase | What happens |
|-------|-------------|
| Plan | Planner agent analyzes the request, determines scope and delivery fit, and writes a plan artifact. Initiative-sized scope redirects to `/phase-plan`; single-feature large scope redirects to `/build`. |
| Build | Task-builder agent implements the plan. |
| Review | Optional (`--review` flag). Task-reviewer validates the implementation against the plan. |

**Flags**: `--confirm` for plan review checkpoint, `--review` for post-build validation, `--commit`, `--push`, `--afk`.

### `/speedrun`

**Best for**: Rapid, small, low-risk changes in an interactive loop. No persistent artifacts. Fire-and-forget tasks.

**Sequence**: Interactive loop of request -> implement -> next request.

Each iteration delegates to a general sub-agent. If the request is too large, it redirects to `/build-fast`, `/build`, or `/phase-plan` based on whether the work is medium, a single large feature, or an initiative that needs phased planning. The session stays open for multiple tasks.

### Choosing between them

| Signal | Use |
|--------|-----|
| Need traceability or plan review | `/build-fast` |
| Multiple small changes in one session | `/speedrun` |
| Change spans multiple files with dependencies | `/build-fast --review` |
| Request spans multiple features or phased rollout slices | `/phase-plan` |
| Single-line fix or config tweak | `/speedrun` |

## Code Quality Pipeline

**When**: Validating code hygiene after implementation or before a PR.

**Sequence**: `/code-check` -> `/code-audit`

| Step | Skill | Purpose |
|------|-------|---------|
| 1 | `/code-check` | Fast pass: linters, formatters, tests, coverage. Catches mechanical issues. |
| 2 | `/code-audit` | Deep pass: pattern consistency, code duplication, comment quality, documentation drift. |

**How they chain**:

- `/code-check` runs first because it is fast and catches issues that would noise up the audit. Fix any failures before proceeding.
- `/code-audit` performs a deeper structural analysis. It discovers project patterns, detects violations, scans for leaked information in comments, identifies duplication, and checks documentation drift. Run it after `/code-check` passes clean.

**Tip**: `/build` already runs `/code-check` internally during its verify phase. Use this standalone pipeline when iterating outside of `/build` or when you want the deeper `/code-audit` analysis.

## PR Workflow

**When**: Reviewing a pull request and resolving feedback.

**Sequence**: optional `/pr-walkthrough` -> `/pr-review` -> `/address-pr-feedback`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 0 | `/pr-walkthrough [target]` | PR number, URL, or branch | Slide-ready markdown walkthrough with plain markdown fallback under `.rp1/work/pr-walkthroughs/` |
| 1 | `/pr-review [target]` | PR number, URL, or branch | Review comments posted to the PR |
| 2 | `/address-pr-feedback [pr]` | PR with review comments | Resolved comments, updated code |

**How they chain**:

- `/pr-walkthrough` is an optional orientation step. It gathers direct PR metadata, changed files, diffs, and commits, then registers a slide-ready markdown walkthrough with contract metadata, reserved slide markers, speaker notes, vertical detail, and evidence IDs. The artifact remains readable as plain markdown; it does not use existing `pr-review` artifacts, post comments, or provide slide rendering.
- `/pr-review` splits the diff into logical review units, analyzes each in parallel with specialized sub-reviewers, synthesizes findings, deduplicates overlapping comments, and posts them to the PR. Includes optional visual diagram generation (`/pr-visual`).
- `/address-pr-feedback` reads all unresolved review comments from the PR, triages them (must-fix vs. nice-to-have vs. dismiss), and fixes them in priority order. Supports `--afk` for unattended resolution.
- After fixing, re-run `/pr-review` to verify the fixes if needed.

**Standalone use**: `/pr-walkthrough` works independently when you need a readable PR explanation before reviewing raw diffs. `/pr-review` works independently for reviewing others' PRs. `/address-pr-feedback` works independently when you receive review comments from human reviewers.

## Documentation Sync

**When**: Updating user-facing documentation after codebase changes, or after a knowledge base rebuild.

**Sequence**: `/knowledge-build` -> `/generate-user-docs`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | `/knowledge-build` | Codebase (auto-detected) | Updated KB files in `.rp1/context/` |
| 2 | `/generate-user-docs` | KB + existing docs in `docs/reference/` | Synchronized documentation |

**How they chain**:

- `/knowledge-build` runs map-reduce analysis across the codebase: spatial analysis, concept extraction, architecture mapping, module analysis, and pattern extraction. Each runs in parallel. Results are merged into the KB files (`index.md`, `architecture.md`, `modules.md`, `patterns.md`, `concept_map.md`, `interaction-model.md`).
- `/generate-user-docs` compares the updated KB against `docs/reference/` through a multi-phase pipeline: validate KB freshness -> discover doc files -> scan for drift -> approval gate -> process updates. It spawns `scribe` agents in parallel batches to handle file-level rewrites.
- The KB freshness gate in `/generate-user-docs` will warn if the KB is stale and offer to rebuild first, so running `/knowledge-build` beforehand avoids that interruption.

**Feature learning**: `/knowledge-build {feature-id}` can incorporate learnings from a specific archived or active feature into the KB before doc sync.

## Project Planning

**When**: Starting a new project or defining a new feature area before implementation.

**Sequence**: `/blueprint` -> [`/phase-plan`] -> `/build`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | `/blueprint` | Project vision or feature idea | Charter + PRD |
| 2 | `/phase-plan <source>` | Large PRD or oversized requirements artifact | Phase plan with child-feature handoffs |
| 3 | `/build {feature-id}` | PRD content or exact child handoff command from `/phase-plan` | Implemented feature |

**How they chain**:

- `/blueprint` runs a guided interview to produce planning documents. It detects whether a project charter exists; if not, it creates one first via `charter-interviewer`, then moves to PRD creation via `blueprint-wizard`. The PRD defines scope, requirements, and success criteria.
- If the PRD represents a single feature, pass the PRD content (or its key requirements) to `/build` as the `REQUIREMENTS` argument.
- If the PRD is initiative-sized, run `/phase-plan` against that PRD first, then run the exact emitted child-feature handoff command from the phase plan. Do not drop the `PHASE_PLAN_PATH=... PHASE_ID=...` arguments when continuing into `/build`.

**Related skills**:

- `/blueprint-audit {prd-name}` -- Audit an existing PRD against implementation status. Identifies stale, completed, or drifted blueprints and guides disposition (archive, modify scope, defer).
- `/blueprint-archive` -- Archive a completed PRD with its associated features and closure summary.
- `/bootstrap` -- For greenfield projects that need scaffolding (directory structure, tooling, initial config) before `/blueprint`. Runs charter interview then scaffolds the project.

## Investigation Workflow

**When**: Debugging a bug or investigating an issue before deciding on a fix.

**Sequence**: `/code-investigate` -> `/build-fast` or `/build`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | `/code-investigate` | Bug description or issue ID | Root cause analysis, evidence, fix recommendations |
| 2 | `/build-fast` or `/build` | Fix based on investigation findings | Implemented fix |

**How they chain**:

- `/code-investigate` performs systematic analysis without making permanent code changes. It forms hypotheses, tests them through code reading and experiments, and documents the root cause with evidence.
- Use the investigation findings to drive a fix through `/build-fast` (for targeted fixes) or `/build` (if the fix requires broader changes). Pass the root cause and recommended fix as the development request.

**Related**: `/validate-hypothesis` can independently test design assumptions flagged during `/build`'s design phase.

## Prompt Authoring

**When**: Writing or improving agent prompts and skill definitions.

**Sequence**: `/build-prompt` -> (optional) `/tersify-prompt`

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | `/build-prompt` | `PROMPT_NAME`, `DESCRIPTION`, optional `TYPE`, `EXISTING`, `AGENT_TYPE` | Governed prompt or SKILL.md with budgeted governance content plus confidence report in `{work_root}/prompts/{YYYY-MM-DD}-{slug}/` |
| 2 | `/tersify-prompt` | Verbose prompt text | Maximally compressed prompt preserving full intent |

**How they chain**:

- `/build-prompt` is the primary entry point. It runs the six-stage prompt-writer pipeline (constitutional-checklist, fallibilist-overlay, epistemic-stance, popper-patterns, confidence-schema, prompt-validation) with a 15% governance budget cap and writes two artifacts to `{work_root}/prompts/{YYYY-MM-DD}-{slug}/`: a ready-to-run prompt (`{slug}.md` when TYPE=prompt, `SKILL.md` when TYPE=skill) and a confidence report. Pass `EXISTING=path/to/prompt.md` to improve an existing prompt instead of starting from scratch. Constitutional filtering is driven by `AGENT_TYPE` (`leaf-worker`, `orchestrator`, `interactive-skill`, `kb-investigator`).
- `/tersify-prompt` is an optional post-step that compresses any prompt (including `/build-prompt` output) by applying token-efficient rewrites. Useful when the prompt needs to fit within tight context budgets.
- The `prompt-writer` skill is a progressive-disclosure reference library consumed by `/build-prompt`; invoke it directly only if you need to read a specific reference (`references/constitution.md`, `references/epistemology.md`, `references/tersify.md`, `references/budget.md`) or pipeline stage file.
