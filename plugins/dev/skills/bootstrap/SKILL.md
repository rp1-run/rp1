---
name: bootstrap
description: "Bootstrap a greenfield project with parent-owned interviews and bounded plan, revision, and apply actions."
allowed-tools: Bash(echo *), Bash(rp1 *), Bash(mkdir *)
metadata:
  category: development
  is_workflow: false
  version: 2.0.0
  tags:
    - greenfield
    - scaffolding
    - project
    - onboarding
    - core
  created: 2025-12-26
  updated: 2026-07-19
  author: cloud-on-prem/rp1
  arguments:
    - name: PROJECT_NAME
      type: string
      required: false
      description: "Project directory name (lowercase letters, numbers, and hyphens)"
  sub_agents:
    - "rp1-dev:bootstrap-scaffolder"
---

# Bootstrap

The top-level skill owns every user-facing question. The retained scaffolder is a bounded, non-interactive worker invoked only after the answer it needs is durable in the target knowledge base.

{% include_shared "parent-owned-interview.md" %}

## Invariants

- Keep `metadata.is_workflow: false`; bootstrap may start outside an initialized project.
- Known `_TBD_` sections in `charter.md` and `preferences.md` are the only resume state.
- Workflow events are telemetry only. Never use them to decide which question or action comes next.
- Do not create scratch pads, bootstrap markers, checkpoint comments, context sidecars, relay envelopes, continuation payloads, or generalized scaffold probes.
- Use the same parent-owned topology on every platform. Do not use platform-specific interaction tags.
- MUST NOT dispatch inside either interview loop. Across one invocation, dispatch at most one PLAN action, one optional REVISE action, and one APPLY action.

## Procedure

### 1. Validate Every Project Name Before Effects

Begin from a non-mutating directory inventory. Inspect only the current directory and safe-named direct children when looking for resumable work; do not recurse through arbitrary directories.

Validate every supplied, inferred, or recovered project name against `^[a-z0-9][a-z0-9-]*$` before using it as a path segment. Do not trim, sanitize, lowercase, or otherwise rewrite a candidate. Reject separators, `..`, whitespace, globs, punctuation other than `-`, an empty name, or a leading hyphen with actionable lowercase-kebab-case guidance.

Target discovery:

1. Enumerate the current directory name and direct-child names without entering them.
2. Discard a name unless it passes the project-name regex, then retain only candidates with their own `.rp1/project_id`. Never derive a candidate path from an unsafe name, and never treat an ancestor project as candidate initialization.
3. If one initialized candidate exists, offer to inspect and use it. If several exist, present only the validated names and ask the user to choose one or provide a new name. If none exists and no argument was supplied, infer the current directory basename only when the current directory is already its own rp1 project; otherwise ask for a name.
4. Do not call a selected initialized target resumable until Section 2 resolves its canonical directories and `{targetKbRoot}/preferences.md` exists. A resumable candidate exists only when its resolved `{targetKbRoot}/preferences.md` exists. Do not inspect run state, marker files, package manifests, or expected scaffold outputs to infer resume state.

The project-name acquisition question is the only permitted interaction before a new candidate can be validated. Validate its answer immediately. Allow one correction, then stop without writing, initializing, or dispatching.

Set `CANDIDATE_PROJECT_NAME` from the generated Resolve Arguments section's already-resolved `PROJECT_NAME`, the selected validated target candidate, the valid inferred basename, or the user's name answer. Do not reconstruct that argument value or parse raw user input again. Validate `CANDIDATE_PROJECT_NAME` before continuing. Only after validation may the parent set `PROJECT_NAME` and `TARGET_DIR`, ask a placement or confirmation question, create a directory, initialize rp1, write an artifact, or dispatch an agent.

### 2. Initialize Or Reuse The Selected Target

If an initialized target candidate was selected, use its directory as `TARGET_DIR`. Otherwise, after name validation:

- Current directory is empty: ask whether to use it or create the direct child `{PROJECT_NAME}`.
- Current directory is its own rp1 project with only rp1 setup files: ask whether to use it or create the direct child.
- Current directory contains unrelated files: propose the direct child and require confirmation; never write into the unrelated current content.
- Proposed target already contains unrelated content and is not the selected initialized target: stop with guidance instead of overwriting it.

Create a missing `TARGET_DIR` only after confirmation. If it lacks `.rp1/project_id`, run `rp1 init --yes --force-nested` with `TARGET_DIR` as the command working directory. On failure, stop before artifact creation. If it is already initialized, reuse it without reinitializing.

The generated Resolve Arguments section already parsed `PROJECT_NAME` and returned directories for the invocation context. Reuse that exact argument value. Its `projectRoot`, `kbRoot`, and `workRoot` values do not become directories for a different selected target.

After target selection and initialization, resolve the selected target's canonical directories exactly once. This directory-only lookup is the one explicit exception to the generated instruction not to re-derive project directories. It MUST NOT include `--args` or parse arguments again:

```bash
rp1 agent-tools resolve-args \
  --name rp1-dev':'bootstrap \
  --project-root "{TARGET_DIR}"
```

Consume only `data.directories`; ignore any returned argument values. Map `directories.projectRoot` to `targetProjectRoot` and `directories.kbRoot` to `targetKbRoot`; retain `directories.workRoot` as `targetWorkRoot`. Require `targetProjectRoot` to identify the selected target.

From this handoff onward, `targetProjectRoot`, `targetKbRoot`, and `targetWorkRoot` replace the invocation roots for every selected-target read, write, resume check, registration, PLAN, REVISE, and APPLY operation, including when `TARGET_DIR` differs from the invocation `projectRoot` or the KB is stored outside the checkout. Treat `targetProjectRoot` as the canonical `TARGET_DIR` for all subsequent target operations.

Set:

- `CHARTER_PATH = {targetKbRoot}/charter.md`
- `PREFS_PATH = {targetKbRoot}/preferences.md`

Obtain `BOOTSTRAP_RUN_ID` only for artifact registration:

```bash
rp1 agent-tools emit resume-run \
  --feature "{PROJECT_NAME}" \
  --flow bootstrap \
  --project "{targetProjectRoot}"
```

Use only the returned run ID. Ignore whether an older run was found and never read its events to infer progress.

### 3. Create Or Resume The Charter

If `CHARTER_PATH` is missing, read `plugins/base/skills/artifact-templates/SKILL.md`, locate the canonical charter document in its Template Index, then read that template. If `rp1-base` is unavailable, tell the user to install it and stop. Fill `{Project Name}` and `{Date}`, write the complete template with status `Draft`, re-read it, verify the write, then register it.

If the charter exists, preserve completed and unrelated content. Required regions:

- `Vision`
- `Problem & Context`
- `Target Users`
- `Business Rationale`
- `Scope Guardrails / Will` (hierarchy-bearing list)
- `Scope Guardrails / Won't` (hierarchy-bearing list)
- `Success Criteria`

Missing, empty, or section-placeholder-only content is a gap. Vision must be substantive. A list containing only `- _TBD_` is a gap. Derive `Complete` only when every required region is substantive; otherwise derive `Draft`. If stored status disagrees, write the complete charter with only status corrected, re-read, verify, and register it before another action.

For at most 10 current charter gaps:

1. Ask one focused charter question directly from this parent skill. Wait for the answer in the top-level conversation; no leaf participates.
2. Apply the accepted answer to every required region it resolves. Preserve completed content and the nested hierarchy of separate Will and Won't regions.
3. Write the complete reconstructed charter to `CHARTER_PATH` once with status derived from its required content.
4. Re-read the charter after the successful write, verify the accepted content, register the verified write, and recompute gaps before another question.

On a write, read, verification, or registration failure, stop before another question or dispatch. If the question budget expires, leave the charter Draft, list remaining gaps, and give rerun guidance. Do not dispatch a charter worker. Proceed only when a fresh read proves the charter Complete.

### 4. Create Or Resume Preferences

If `PREFS_PATH` is missing, write this ordinary document, then re-read, verify, and register it:

```markdown
# Project Preferences: {PROJECT_NAME}

**Generated**: {Date}
**Status**: Draft

## Project
- Name: {PROJECT_NAME}
- Charter: {CHARTER_PATH}
- Scaffold goals: _TBD_

## Tech Stack
- Language: _TBD_
- Runtime: _TBD_
- Framework: _TBD_
- Package Manager: _TBD_
- Testing: _TBD_
- Build: _TBD_
- Lint: _TBD_
- Format: _TBD_

## Research Notes
_TBD_

## Scaffold Plan
_TBD_

## Plan Review
_TBD_

## Revision Request
Not requested

## Revised Plan
Not requested

## Apply Result
_TBD_
```

The parent-owned preferences interview covers only `Project / Scaffold goals` and the fields under `Tech Stack`. Treat explicit choices such as `None`, `Not applicable`, or a charter-supported choice as substantive. Preserve all planning, review, revision, and result sections when updating interview answers.

For at most 10 current preference gaps:

1. Ask one focused preferences question directly from this parent skill. Wait for the answer in the top-level conversation; no leaf participates.
2. Apply the accepted answer to every Project or Tech Stack field it resolves.
3. Write the complete reconstructed preferences document to `PREFS_PATH` once. Preserve every unrelated section.
4. Re-read the preferences document after the successful write, verify the accepted content, register the verified write, and recompute the declared interview gaps before another question or any action dispatch.

On a write, read, verification, or registration failure, stop before another question or dispatch. If the question budget expires, retain the unresolved `_TBD_` values, list them, and give rerun guidance. Proceed only after a fresh read proves the Project and Tech Stack interview fields substantive.

### 5. Plan Once

Load the entire current preferences document. If `Scaffold Plan` is missing, empty, or `_TBD_`, dispatch PLAN exactly once in this invocation. Never dispatch it to discover a question.

{% dispatch_agent "rp1-dev:bootstrap-scaffolder" %}
ACTION=PLAN
PROJECT_NAME={PROJECT_NAME}
TARGET_DIR={TARGET_DIR}
CHARTER_PATH={CHARTER_PATH}
PREFS_PATH={PREFS_PATH}
KB_ROOT={targetKbRoot}
WORK_ROOT={targetWorkRoot}
RUN_ID={BOOTSTRAP_RUN_ID}
{% enddispatch_agent %}

Parse one raw JSON result. On success, re-read `PREFS_PATH`; require substantive `Research Notes` and `Scaffold Plan`, preserve all parent-authored fields, and register the verified artifact. On failure or invalid output, stop with retry guidance and do not dispatch PLAN again. If `Scaffold Plan` was already substantive at invocation start, skip PLAN.

### 6. Own Approval And At Most One Revision

Use `Revised Plan` when it is substantive and not `Not requested`; otherwise use `Scaffold Plan`. The parent presents that plan and asks the user to approve it or request changes.

If the user approves:

1. Persist the accepted plan as `Approved` in `Plan Review` by reconstructing the complete preferences document.
2. Re-read and verify the approval before any apply dispatch.
3. Register the verified preferences write.

If the user requests changes and `Revised Plan` is `Not requested`:

1. Persist the complete requested change in `Revision Request`, set `Plan Review` to `Changes requested`, and set `Revised Plan` to `_TBD_` in one complete-document write.
2. Re-read and verify the requested change before any revision dispatch.
3. Register the verified preferences write.
4. Dispatch REVISE exactly once in this invocation:

{% dispatch_agent "rp1-dev:bootstrap-scaffolder" %}
ACTION=REVISE
PROJECT_NAME={PROJECT_NAME}
TARGET_DIR={TARGET_DIR}
CHARTER_PATH={CHARTER_PATH}
PREFS_PATH={PREFS_PATH}
KB_ROOT={targetKbRoot}
WORK_ROOT={targetWorkRoot}
RUN_ID={BOOTSTRAP_RUN_ID}
{% enddispatch_agent %}

Parse one raw JSON result. On success, re-read `PREFS_PATH`, require a substantive `Revised Plan`, and register the verified artifact. On failure, stop without a second revision dispatch.

Present the revised plan once. If the user now approves, persist and verify `Approved` as above. If the user requests another change: Persist `Revision limit reached; rerun bootstrap to request another plan` in `Plan Review` together with the second request, re-read and register it. Stop without another dispatch and give rerun guidance.

Resume rules for this phase:

- Substantive `Revision Request` plus `_TBD_` `Revised Plan`: run the single REVISE dispatch without asking for the first request again.
- Substantive `Revised Plan` without `Approved` review: ask only for final approval.
- `Plan Review` containing the revision-limit outcome: stop with rerun guidance.
- `Plan Review` equal to `Approved`: ask no approval question and continue.

### 7. Apply Once

Proceed only when a fresh preferences read contains `Approved` in `Plan Review`. If `Apply Result` already records successful completion, skip APPLY and finish. If it is missing, `_TBD_`, or explicitly retryable, dispatch APPLY exactly once in this invocation:

{% dispatch_agent "rp1-dev:bootstrap-scaffolder" %}
ACTION=APPLY
PROJECT_NAME={PROJECT_NAME}
TARGET_DIR={TARGET_DIR}
CHARTER_PATH={CHARTER_PATH}
PREFS_PATH={PREFS_PATH}
KB_ROOT={targetKbRoot}
WORK_ROOT={targetWorkRoot}
RUN_ID={BOOTSTRAP_RUN_ID}
{% enddispatch_agent %}

Parse one raw JSON result. Re-read `PREFS_PATH` after the action. Require `Apply Result` to match the reported changed files, conflicts, warnings, and retry guidance. Register the verified artifact. Mark preferences `Complete` only when Apply Result reports success without unresolved conflicts; otherwise preserve the approved plan and report the retry guidance. Never dispatch APPLY twice in one invocation.

### 8. Artifact Registration

Run the matching command only after a complete-document write and successful re-read. An emit failure is a registration failure; report it before continuing.

Charter:

```bash
rp1 agent-tools emit \
  --workflow bootstrap \
  --type artifact_registered \
  --run-id "{BOOTSTRAP_RUN_ID}" \
  --project "{targetProjectRoot}" \
  --data '{"path": "{targetKbRoot}/charter.md", "feature": "{PROJECT_NAME}", "storageRoot": "absolute"}'
```

Preferences:

```bash
rp1 agent-tools emit \
  --workflow bootstrap \
  --type artifact_registered \
  --run-id "{BOOTSTRAP_RUN_ID}" \
  --project "{targetProjectRoot}" \
  --data '{"path": "{targetKbRoot}/preferences.md", "feature": "{PROJECT_NAME}", "storageRoot": "absolute"}'
```

### 9. Complete

Re-read both artifacts. Complete only when the charter is Complete, every Project and Tech Stack preference is substantive, `Plan Review` is `Approved`, and `Apply Result` reports success without unresolved conflicts.

```text
Bootstrap complete!
Project: {PROJECT_NAME}
Location: {TARGET_DIR}

Artifacts:
- {targetKbRoot}/charter.md
- {targetKbRoot}/preferences.md

Next: enter the project, review README.md, and run the documented checks.
```

## Boundaries

- Modify only the selected target and its resolved KB artifacts.
- Preserve unrelated existing content; report conflicts instead of overwriting.
- Parent questions -> durable full-document write -> re-read/verify/register -> next question or bounded action.
- Any action failure stops the current invocation. A rerun resumes from ordinary artifact sections and direct planned-output checks.
