# Gemini CLI Platform Guide

Gemini CLI is an opt-in experimental validation surface for rp1. It is not a
first-class rp1 host, and it is not part of the stable Claude Code, OpenCode,
Codex CLI, or GitHub Copilot CLI setup path.

Use Gemini only for the workflow classes listed in the support matrix below.
When a row is `degraded` or `unsupported`, use one of the stable hosts for that
workflow until new validation evidence upgrades the row.

## Current Status

- Gemini support is experimental and validation-backed.
- Existing rp1 users do not need Gemini installed or configured.
- Gemini does not change install, verify, update, or workflow expectations for
  Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI.
- Heavyweight workflows, PR review, and unattended headless automation are not
  first-class Gemini paths.
- Missing evidence keeps a workflow `degraded` or `unsupported`; it never
  implies support by default.

## Prerequisites

- Gemini CLI available on `PATH`.
- rp1 CLI available from the project checkout that owns the generated bundle assets.
- A trusted workspace or worktree when running Gemini interactively.
- Current generated Gemini bundle assets from the active feature or release branch.
- Access to the work-root evidence artifacts referenced by the matrix.

Verify the local Gemini binary first:

```bash
gemini --version
```

For validation branches that include the Gemini verifier, run:

```bash
rp1 verify gemini --feature-id <feature-id>
```

If that verifier is unavailable or reports stale assets, keep lifecycle rows
`degraded`, refresh the generated bundle assets, and attach manual evidence before
upgrading any support claim.

## Experimental Setup

1. Install Gemini CLI using the upstream Gemini CLI instructions for your
   environment.
2. Confirm `gemini --version` works in the same shell where you run rp1.
3. Install or refresh the current generated rp1 Gemini bundle assets for the
   feature being tested.
4. Run `rp1 verify gemini --feature-id <feature-id>` when the branch provides
   the verifier.
5. Start Gemini from the repository or worktree you intend to validate.
6. Accept required trust, tool approval, or agent acknowledgement prompts
   interactively before expecting Gemini workflows to run.

This setup is optional. Non-Gemini users should continue using the host-specific
setup for Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI.

## Invocation

Gemini installs generated extension bundle commands from the normal rp1 catalog.
Legacy validation-only smoke, subagent, and boundary commands are removed from
the product bundle and should not appear as normal user workflows. Use
`rp1 verify gemini --workflow <workflow-id>` to inspect support-matrix
attribution before trying a catalog workflow on Gemini.

Do not run general rp1 build, PR-review, or heavyweight map-reduce workflows on
Gemini unless a support-matrix row explicitly upgrades that workflow.

## Support Matrix

| Workflow class | Gemini status | Reason | Limitation | User action | Evidence source |
|----------------|---------------|--------|------------|-------------|-----------------|
| Historical smoke workflow, root resolution, and artifact registration | `experimental` | The P1 smoke artifact records Gemini `0.42.0`, worktree-aware `code_root`, command path, work-root artifact path, and successful artifact registration. | Evidence covers the recorded validation-only scenario only; it does not prove general workflow parity and the validation command is not installed as a product workflow. | Use the generated bundle verifier and support matrix for current workflow attempts. | `features/gemini-cli-rp1-harness-smoke/gemini-smoke.md` |
| Custom subagent invocation | `unsupported` | No current P2 subagent artifact is present in the work root for public support claims. | Prior or local manual experiments must be attached before this row can claim working behavior; project agents may also require acknowledgement. | Use a stable host for subagent workflows, or attach accepted P2 evidence before reclassifying. | `manual gap` |
| Fanout, delegated failure, and reducer collection | `unsupported` | No current P2 fanout artifact is present with attribution, result collection, and delegated-failure behavior. | Heavyweight multi-agent claims depend on this evidence and remain blocked without it. | Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI for fanout workflows. | `manual gap` |
| Trust prompts, tool approval, and user-gated flows | `degraded` | Gemini may require interactive trust, approval, or user acknowledgement before a workflow can continue. | Unattended recovery and resume behavior are not proven by current P3 evidence. | Run interactively, trust the workspace, approve required tool use, then rerun the validation command. | `manual gap` |
| Headless automation | `unsupported` | Current evidence does not prove unattended recovery from trust, approval, user-input, or acknowledgement gates. | Headless runs can stop waiting for user action and should not be treated as automation parity. | Use a stable host for unattended workflows, or rerun Gemini interactively for validation only. | `manual gap` |
| Install, verify, update, stale-asset recovery, and removal lifecycle | `degraded` | Lifecycle verification is expected to come from `rp1 verify gemini` plus install, update, and uninstall notes. | Current lifecycle evidence is incomplete in the work root. | Run the verifier when available; refresh stale generated bundle assets before relying on results. | `manual gap` |
| Heavyweight tracked workflows | `unsupported` | Current evidence does not prove full tracked-workflow execution, subagent fanout, result reduction, or delegated failure handling. | Smoke success cannot be expanded into build, research, review, or release workflow parity. | Use a stable host for heavyweight rp1 workflows. | `manual gap` |
| PR review | `unsupported` | PR-review support has a narrower harness contract and Gemini is not validated for that workflow. | No current PR-review Gemini evidence exists, and general PR-review parity would require separate validation. | Use a stable host for `/rp1-dev-pr-review`. | `cli/src/__tests__/pr-review/config.test.ts` |

## Maintainer Validation Checklist

Use this checklist before publishing Gemini guidance or changing a support
matrix status. A claim may only move to a stronger status when the named
artifact, command output, or manual verification note exists and directly
proves that row. If evidence is missing, stale, or narrower than the claim, keep
the affected row `degraded` or `unsupported` and name the limitation.

| Claim to validate | Support-matrix row | Evidence or command to inspect | Maintainer pass condition | If evidence is missing or stale |
|-------------------|--------------------|--------------------------------|---------------------------|---------------------------------|
| Historical smoke workflow | Historical smoke workflow, root resolution, and artifact registration | `features/gemini-cli-rp1-harness-smoke/gemini-smoke.md` | Artifact records the expected `feature_id`, `run_id`, Gemini version, command path, and recorded validation scenario. | Treat this as historical release evidence only; do not infer general workflow support or reinstall the legacy validation command. |
| Root resolution | Smoke workflow, root resolution, and artifact registration | `features/gemini-cli-rp1-harness-smoke/gemini-smoke.md` | `project_root`, `kb_root`, `work_root`, `code_root`, and `is_worktree` match the intended project and worktree boundary. | Keep root-resolution claims scoped to the recorded smoke scenario. |
| Artifact registration | Smoke workflow, root resolution, and artifact registration | `features/gemini-cli-rp1-harness-smoke/gemini-smoke.md` and its registration output | `artifact_relative_path` points under the work root and `registration_status` is `registered`. | Keep artifact-registration claims `degraded` until a current registered artifact is attached. |
| Custom subagents | Custom subagent invocation | `features/gemini-cli-rp1-harness-subagents/gemini-subagents.json` or accepted manual runtime note | Evidence shows the packaged rp1 subagent invoked successfully and states whether acknowledgement was required. | Keep the row `unsupported`; use `degraded` only when evidence works after a documented manual acknowledgement step. |
| Fanout | Fanout, delegated failure, and reducer collection | `features/gemini-cli-rp1-harness-subagents/gemini-subagents.json` or accepted manual runtime note | Evidence shows multiple delegated outputs are present, attributable, and collected by the parent workflow. | Keep fanout and heavyweight workflow rows `unsupported`. |
| Delegated failure | Fanout, delegated failure, and reducer collection | `features/gemini-cli-rp1-harness-subagents/gemini-subagents.json` or accepted manual runtime note | Evidence shows a delegated failure is surfaced as a Gemini limitation or failed subtask, not silent success. | Keep delegated-failure and heavyweight workflow rows `unsupported`. |
| Trust prompt | Trust prompts, tool approval, and user-gated flows | `features/gemini-cli-rp1-harness-lifecycle/gemini-boundaries.json` or accepted manual trust note | Evidence records the trust gate, the required user action, and the result after the workspace is trusted. | Keep the row `degraded`; do not claim unattended recovery. |
| Tool approval | Trust prompts, tool approval, and user-gated flows | `features/gemini-cli-rp1-harness-lifecycle/gemini-boundaries.json` or accepted manual approval note | Evidence records the approval prompt, approved action, and rerun or continuation result. | Keep approval language `degraded` and require interactive approval guidance. |
| Headless automation | Headless automation | `features/gemini-cli-rp1-harness-lifecycle/gemini-boundaries.json` or accepted headless command output | Evidence proves the workflow can complete without trust, approval, user-input, or acknowledgement gates. | Keep the row `unsupported`; a stopped headless run is a limitation, not support evidence. |
| Install lifecycle | Install, verify, update, stale-asset recovery, and removal lifecycle | Current Gemini install note or verifier output for the release branch | Evidence shows generated Gemini bundle assets install from the expected branch or extension source and remain optional for non-Gemini users. | Keep the lifecycle row `degraded`; do not ask stable-host users to install Gemini. |
| Verify lifecycle | Install, verify, update, stale-asset recovery, and removal lifecycle | `rp1 verify gemini --feature-id <feature-id>` output when the branch provides it | Verification reports current assets or an actionable prerequisite/stale-asset message. | Keep the lifecycle row `degraded` and tell maintainers to refresh or attach manual evidence. |
| Update or stale-asset recovery | Install, verify, update, stale-asset recovery, and removal lifecycle | Current update/stale-asset verification note or verifier output | Evidence shows stale assets are detected and the refresh action is clear. | Keep stale-asset recovery `degraded`; do not imply automatic update parity. |
| Removal lifecycle | Install, verify, update, stale-asset recovery, and removal lifecycle | Current removal or uninstall verification note | Evidence shows generated Gemini bundle assets can be removed without affecting Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI setup. | Keep removal lifecycle `degraded`; treat missing removal proof as a non-blocking limitation, not stable-host risk. |
| PR review boundary | PR review | `cli/src/__tests__/pr-review/config.test.ts` and `cli/src/pr-review/models.ts` | PR-review harness validation remains limited to its current stable-host contract and rejects Gemini unless a later PR-review-specific validation changes it. | Keep PR review `unsupported`. |

When the checklist changes a row, update the support matrix and Evidence
Inventory in the same edit. Do not use P1 smoke evidence to upgrade subagent,
fanout, headless, lifecycle, heavyweight workflow, or PR-review claims.

## Limitations And User Actions

| Situation | What it means | What to do |
|-----------|---------------|------------|
| Gemini CLI is missing | The experimental surface cannot run. | Install Gemini CLI only if you intend to validate Gemini; otherwise use a stable host. |
| Generated bundle assets are missing or stale | The installed Gemini commands do not match the current feature or release branch. | Refresh the generated bundle assets and rerun verification before collecting evidence. |
| Gemini asks to trust the workspace | The workflow is blocked on an interactive trust decision. | Trust the intended repository or rerun on a stable host. |
| Gemini asks for tool approval | The workflow is blocked on Gemini approval policy. | Approve the action interactively when appropriate; do not assume unattended resume. |
| Gemini reports new agents | Agent acknowledgement is required before the agent can be invoked. | Acknowledge and enable the agent, then rerun the validation command. |
| Headless validation stops | A trust, approval, or user gate likely interrupted automation. | Rerun interactively or record the limitation as `degraded` or `unsupported`. |
| A workflow is not in the matrix | There is no accepted Gemini evidence for that class. | Use a stable host and keep the Gemini claim `unsupported`. |

## Opt-In Boundary

Gemini prerequisites apply only to users who choose to validate Gemini. Do not
ask non-Gemini users to install Gemini, acknowledge Gemini agents, refresh
Gemini extensions, or run Gemini lifecycle commands.

Stable hosts keep their existing setup paths:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

Those checks are independent from Gemini validation. Stable-host evidence does
not upgrade Gemini, and Gemini limitations do not downgrade stable-host support.

## Classification Policy

The sections below define the classification rules used by the matrix. The
maintainer checklist and navigation links build on this policy.

### Public Status Vocabulary

| Status | Meaning | Minimum evidence |
|--------|---------|------------------|
| `supported` | The workflow class has current end-to-end evidence for the user path, no known Gemini-specific caveat that changes the expected rp1 behavior, and a repeatable verification path. | Current work-root artifact or verification output proving the workflow class, plus no unresolved trust, approval, acknowledgement, headless, fanout, or lifecycle gap for that claim. |
| `experimental` | The workflow class has positive runtime evidence, but the support boundary is intentionally narrow, opt-in, or still subject to manual validation. | Current work-root artifact or accepted manual verification showing the class works for a named scenario, with limitations stated in the row. |
| `degraded` | The workflow class has partial evidence or a recoverable limitation that changes the normal rp1 experience. | Evidence of the partial path or limitation, plus a user action such as acknowledge agents, trust the workspace, rerun interactively, refresh assets, or inspect a work-root artifact. |
| `unsupported` | The workflow class has no accepted evidence, has an explicit failing result, or depends on behavior not implemented for Gemini. | A missing evidence source, a failing validation artifact, or source/verification output showing the surface is unavailable. |

### Mapping Rules

Use the strongest current evidence that directly matches the workflow class.
Runtime artifacts and `rp1 verify gemini --feature-id <feature-id>` output are
stronger than source-code intent or planning notes. If evidence is missing,
stale, or only proves a narrower scenario, classify the row as `degraded` or
`unsupported` instead of inferring parity.

Gemini matrix rows must include:

| Field | Rule |
|-------|------|
| Workflow class | Name the user-visible class, such as smoke workflow, custom subagent, fanout, user-gated flow, headless automation, lifecycle, heavyweight workflow, or PR review. |
| Status | Use only `supported`, `experimental`, `degraded`, or `unsupported`. |
| Reason | State the evidence-backed reason for the status. |
| Limitation | State the missing evidence, known caveat, or recovery boundary. |
| User action | Tell the user what to do next, such as run verification, acknowledge agents, trust the workspace, use interactive mode, or avoid the workflow on Gemini. |
| Evidence source | Cite a work-root artifact, current verification output, manual verification note, or `manual gap` when the evidence is not present. |

Apply these rules consistently:

- A missing evidence source never maps to `supported`.
- A workflow class with some positive evidence but an unresolved user action maps
  to `experimental` or `degraded`.
- A workflow class with no accepted runtime evidence maps to `unsupported`.
- Trust, approval, user-input, acknowledgement, or headless caveats disqualify a
  `supported` status unless current evidence proves the complete recovery path.
- Heavyweight workflows and PR review stay `unsupported` unless current fanout,
  result collection, delegated failure, and workflow-specific evidence all pass.
- Existing Claude Code, OpenCode, Codex, and Copilot support remains independent
  of Gemini. Gemini evidence does not downgrade stable host expectations, and
  stable-host evidence does not upgrade Gemini.

### Evidence Inventory

| Evidence area | Accepted source | Current inventory | Claims it can support | Default if absent |
|---------------|-----------------|-------------------|-----------------------|-------------------|
| P1 smoke workflow | `features/gemini-cli-rp1-harness-smoke/gemini-smoke.md` | Present. Records Gemini `0.42.0`, worktree root resolution, `code_root`, command path, artifact path, and successful artifact registration. | Experimental smoke workflow, root-resolution, and artifact-registration claims for the recorded scenario. | `degraded` if the artifact is stale or incomplete; `unsupported` if no smoke artifact exists. |
| P2 custom subagent invocation | `features/gemini-cli-rp1-harness-subagents/gemini-subagents.json` or accepted manual verification note | Manual gap in the current work root. Prior validation must be attached before public rows claim this as working. | Custom subagent rows only for the exact validated packaging path and acknowledgement state. | `unsupported` without accepted runtime evidence; `degraded` when evidence works only after acknowledgement or manual setup. |
| P2 fanout and delegated failure handling | `features/gemini-cli-rp1-harness-subagents/gemini-subagents.json` with fanout, attribution, collection, and failure results | Manual gap in the current work root. | Multi-agent fanout, reducer, partial-result, and heavyweight workflow gate claims. | `unsupported` until the fanout and delegated-failure evidence is present. |
| P3 trust, approval, user-gated, and headless behavior | `features/gemini-cli-rp1-harness-lifecycle/gemini-boundaries.json` or accepted manual verification note | Manual gap in the current work root. | Trust prompts, approval requirements, user-input checkpoints, headless behavior, and resume/recovery claims. | `degraded` when a recoverable user action is known; `unsupported` when unattended or headless recovery is unproven. |
| P3 install, verify, update, stale asset, and removal lifecycle | Current `rp1 verify gemini --feature-id <feature-id>` output plus install, update, and uninstall verification notes | Manual gap in the current work root. | Lifecycle, stale-asset recovery, prerequisite, and removal status claims. | `degraded` for incomplete lifecycle evidence; `unsupported` when the command or lifecycle surface is unavailable. |
| Existing harness non-regression | Targeted Claude Code, OpenCode, Codex, and Copilot tests or smoke evidence | Owned by the later regression task. | Claims that Gemini remains opt-in and does not require setup for stable hosts. | Do not use missing non-regression evidence to upgrade Gemini. Keep stable-host claims scoped to their own checks. |

### Classification Guardrails

The current P1 smoke artifact can justify an `experimental` row for the recorded
smoke workflow, but it cannot justify `supported` Gemini workflow parity, PR
review support, unattended headless resume, or heavyweight map-reduce support.

If a reviewer supplies new P2 or P3 evidence, update the inventory first, then
update matrix rows from that evidence. If the evidence source is unavailable or
ambiguous, keep the row `degraded` or `unsupported` and name the manual gap.
