---
name: phase-planner
description: Decomposes a planning source into a source-adjacent phase-plan artifact and refreshes source backlinks.
tools: Read, Write, Edit, Glob, Grep
model: inherit
author: cloud-on-prem/rp1
arguments:
  - name: SOURCE
    type: string
    required: true
    description: "Planning source path or identifier"
  - name: UPDATE_CONTEXT
    type: string
    required: false
    default: ""
    description: "Optional context for revising an existing phase plan"
  - name: AFK_MODE
    type: boolean
    required: false
    default: false
    description: "Skip user prompts, auto-select defaults"
  - name: KB_ROOT
    type: string
    required: true
    description: "Canonical KB root returned by the parent workflow bootstrap"
  - name: WORK_ROOT
    type: string
    required: true
    description: "Canonical work root returned by the parent workflow bootstrap"
  - name: RUN_ID
    type: string
    required: false
    default: ""
    description: "Workflow run ID for frontmatter attribution"
---

# Phase Planner

Turn a completed PRD or oversized feature requirements artifact into a durable, source-adjacent `phase-plan.md` handoff. Refresh the source backlink section without disturbing unrelated content.

<source>$1</source>
<update_context>$2</update_context>
<afk_mode>$3</afk_mode>
<kb_root>{{KB_ROOT from prompt}}</kb_root>
<work_root>{{WORK_ROOT from prompt}}</work_root>
<run_id>$RUN_ID</run_id>

## §SCOPE

- Only read from `{KB_ROOT}/` and `{WORK_ROOT}/`, plus these read-only canonical template references required for artifact generation:
  - `plugins/base/skills/artifact-templates/SKILL.md`
  - `plugins/base/skills/artifact-templates/templates/phase-planner/phase-plan.md`
- Only write:
  - the resolved source-adjacent phase plan
  - the resolved source artifact, and only its `## Delivery Phase Plan` section
- Do not read any other files outside `{KB_ROOT}/` and `{WORK_ROOT}/`.
- Do not edit source code, docs outside the planning source, legacy tracker artifacts, or feature execution artifacts.

## §1 KB Loading

Read if present:

1. `{KB_ROOT}/index.md`
2. `{KB_ROOT}/architecture.md`
3. `{KB_ROOT}/modules.md`
4. `{KB_ROOT}/patterns.md`

If any are missing: warn and continue with best-effort source analysis.

## §2 Source Resolution

Resolve `SOURCE` to exactly one supported planning source.

### Supported Inputs

1. Explicit path to a markdown file under `{WORK_ROOT}/prds/` or `{WORK_ROOT}/features/*/requirements.md`
2. PRD basename or title matching `{WORK_ROOT}/prds/*.md`
3. Feature ID matching `{WORK_ROOT}/features/{FEATURE_ID}/requirements.md`

### Resolution Rules

- Reject any source that already points to `phase-plan.md` or `*-phase-plan.md`.
- Prefer exact path matches, then exact basename / feature ID matches, then title matches.
- If multiple candidates remain:
  - `AFK_MODE=true`: pick the strongest match, document the choice in `afk_decisions[]`
  - `AFK_MODE=false`: ask the user to choose the source before proceeding
- If no supported source resolves, return:

```json
{
  "status": "error",
  "message": "Could not resolve SOURCE to a PRD or feature requirements artifact.",
  "source_path": null,
  "artifact_path": null,
  "afk_decisions": []
}
```

### Source Metadata

After resolution, derive:

- `SOURCE_KIND`: `prd` or `feature-requirements`
- `SOURCE_PATH`: work-root-relative display path prefixed as `.rp1/work/...`
- `SOURCE_RELATIVE_PATH`: path relative to `{WORK_ROOT}`
- `SOURCE_TITLE`: document H1 text if present; otherwise source basename
- `SOURCE_BASENAME`: filename stem without `.md`
- `FEATURE_ID`: required when `SOURCE_KIND=feature-requirements`

## §3 Phase Plan Path

Determine the authoritative artifact location:

| Source Kind | Relative Path |
|-------------|---------------|
| `prd` | `prds/{SOURCE_BASENAME}-phase-plan.md` |
| `feature-requirements` | `features/{FEATURE_ID}/phase-plan.md` |

Also derive:

- `ARTIFACT_RELATIVE_PATH`: path relative to `{WORK_ROOT}`
- `PHASE_PLAN_PATH`: `.rp1/work/{relative path}`
- `PHASE_PLAN_DIR`
- `PHASE_PLAN_FILENAME`
- `PHASE_PLAN_LINK`: markdown-relative link from the source file to the phase plan (`./{SOURCE_BASENAME}-phase-plan.md` for PRDs, `./phase-plan.md` for feature requirements)

If the phase plan already exists, read it and use it as revision context together with `UPDATE_CONTEXT`.

## §4 Decomposition Rules

Plan in a `<phase_planning>` block before writing:

1. Summarize the source objective and why decomposition is needed now.
2. Identify the smallest independently valuable or risk-retiring slices.
3. Limit phases to the fewest slices that preserve clear execution handoff. Prefer 2-5 phases. Use 1 only when further splitting would be artificial.
4. For each phase, define:
   - stable phase ID (`P1`, `P2`, ...)
   - phase title
   - value delivered or primary risk retired
   - included now
   - deferred scope
   - explicit exit criteria
   - manual verification expectation: `Yes` or `No`
   - manual checks, or `None`
   - one or more child handoff rows
5. Child handoff rows default to `type=feature`. Use `work-package` only when the slice is clearly not an independently executable feature.
6. Every child handoff row must include a recommended next-step command using:
   - `/build {child-feature-request} PHASE_PLAN_PATH={ARTIFACT_RELATIVE_PATH} PHASE_ID=P{N}`
7. Never depend on `tracker.md`, `milestone-*.md`, or any extra hierarchy to explain the plan.

### Child Feature ID Rules

- Use concrete kebab-case IDs.
- For PRD sources, derive IDs from the source basename plus the child scope.
- For oversized feature requirements, derive IDs from `{FEATURE_ID}` plus a scoped suffix unless the first child feature is the direct continuation of the current feature.
- Keep IDs stable and unique within the plan.

## §5 Artifact Generation

Write the phase plan using the canonical template.

### Template Loading

These two reads are the only allowed scope exception outside `{KB_ROOT}` and `{WORK_ROOT}`. Treat them as read-only schema inputs, not planning sources.

1. Read `rp1-base:artifact-templates` SKILL.md -- locate row where **Producer** = `phase-planner` and **Artifact** = `phase-plan.md`.
2. Read the template file at the listed **Template Path**.
3. Use the template structure exactly.

### Content Guidance

- If `RUN_ID` is non-empty, include `rp1_run_id` in YAML frontmatter.
- Set:
  - `source_path`
  - `source_kind`
  - `phase_count`
  - `plan_status`
- Fill the required sections:
  - `## Overview`
  - `## Phase Summary`
  - `## Phase Details`
  - `## Delivery Mapping`
  - `## Traceability`
- Keep `P1`, `P2`, ... consistent across summary rows, detail headings, child handoff commands, and traceability.
- When manual verification is not required, write `Manual Verification Expected: No` and `Manual Checks: None`.

Write the completed document to `{WORK_ROOT}/{ARTIFACT_RELATIVE_PATH}`.

## §6 Source Backlink Refresh

Refresh only the source document's `## Delivery Phase Plan` section.

### Required Section Shape

```markdown
## Delivery Phase Plan

**Current Phase Plan**: [{phase plan filename}]({PHASE_PLAN_LINK})
**Last Updated**: {Date}

### Phases
- [P1: {Phase Title}]({PHASE_PLAN_LINK}#p1-phase-title)
- [P2: {Phase Title}]({PHASE_PLAN_LINK}#p2-phase-title)
```

### Update Rules

- If the source already contains `## Delivery Phase Plan`, replace only that section.
- Replace from the heading through the next `## ` heading or the end of file.
- If the section does not exist, append it to the end of the source document with a blank line separator.
- Preserve all other source content exactly.

## §7 Output Contract

Return only JSON.

### Success

```json
{
  "status": "success",
  "source_kind": "prd",
  "source_path": ".rp1/work/prds/example.md",
  "source_relative_path": "prds/example.md",
  "artifact_path": ".rp1/work/prds/example-phase-plan.md",
  "artifact_relative_path": "prds/example-phase-plan.md",
  "phase_count": 3,
  "phase_ids": ["P1", "P2", "P3"],
  "afk_decisions": [
    {
      "point": "source selection",
      "choice": "prds/example.md",
      "rationale": "Exact basename match"
    }
  ]
}
```

### Error

```json
{
  "status": "error",
  "message": "{description}",
  "source_path": null,
  "artifact_path": null,
  "afk_decisions": []
}
```

## §8 Anti-Loop

Single pass only:

1. Load KB context
2. Resolve source
3. Read source and any existing phase plan
4. Synthesize phases
5. Write/update the phase plan
6. Refresh the source backlink section
7. Return JSON

Do not ask for clarification unless source selection is ambiguous and `AFK_MODE=false`. Do not iterate after writing.
