# Gemini CLI Platform Guide

Gemini CLI is a first-class rp1 generated bundle and build platform. It has its
own build target, generated extension assets, lifecycle commands, verifier
output, and support-matrix attribution for the user-facing rp1 workflows.

Gemini remains explicit opt-in. The current generated support matrix is
bundle-backed: it has 15 workflow rows, 15 `supported` rows, and 0
`unsupported` rows. Validation-only harness workflows remain excluded from
product workflow claims.

## Current Status

- `rp1 build:opencode --platform gemini` writes generated Gemini assets to
  `dist/gemini/`; `--platform all` includes Gemini alongside the other build
  platforms.
- The generated bundle includes per-plugin extension metadata, command TOML,
  packaged skills, packaged agents, `GEMINI.md`, `manifest.json`,
  `support-matrix.json`, and the top-level `bundle-manifest.json`.
- Gemini lifecycle commands are manifest-backed:
  `rp1 install gemini`, `rp1 update plugins gemini`, `rp1 verify gemini`, and
  `rp1 uninstall gemini`.
- Automatic init, install-all, and update-all paths skip Gemini. Install or
  refresh Gemini only when you intentionally want generated Gemini bundle
  assets.
- Existing Claude Code, OpenCode, Codex CLI, and GitHub Copilot CLI setup and
  workflow support are independent from Gemini.
- Gemini platform icon metadata uses the existing `@lobehub/icons` `Gemini`
  mono asset pattern.

## Prerequisites

- Gemini CLI available on `PATH`.
- rp1 CLI available from the project checkout that owns the generated bundle
  assets.
- A trusted workspace or worktree when running Gemini interactively.
- Current `dist/gemini/` assets from the active feature or release branch.

Verify the local Gemini binary first:

```bash
gemini --version
```

Install the generated bundle only when you want Gemini assets:

```bash
rp1 install gemini
rp1 verify gemini
```

## Generated Bundle Lifecycle

Gemini install, update, verify, and uninstall operate on manifest-owned files in
the generated extension bundle. rp1 does not install historical smoke commands,
manual-copy validation assets, or proof-only workflows as normal Gemini product
commands.

| Command | Purpose | Notes |
|---------|---------|-------|
| `rp1 install gemini` | Copies current manifest-owned Gemini bundle assets into Gemini extension directories. | Explicit opt-in; automatic install skips Gemini. |
| `rp1 update plugins gemini` | Refreshes installed Gemini assets from the current manifest. | Explicit opt-in; update-all skips Gemini. |
| `rp1 verify gemini` | Checks generated bundle lifecycle state. | A current lifecycle means the installed generated bundle is ready. |
| `rp1 verify gemini --workflow <workflow-id>` | Attributes one workflow attempt against the generated matrix. | Supported attribution points at the generated bundle evidence source. |
| `rp1 uninstall gemini` | Removes safe, manifest-owned Gemini assets. | Preserves modified files and unrelated Gemini extensions. |

Gemini asset lifecycle states include `current`, `removed`, `missing`,
`partial`, `stale`, and `blocked`. A `removed`, `missing`, `partial`, or
`stale` lifecycle state means the generated bundle assets are inactive or need a
refresh; it does not change support status for stable hosts.

## Verifier Output

`rp1 verify gemini` reports:

- `Support: generated bundle (Gemini extension assets)`
- `State` for generated bundle setup
- `Manifest lifecycle` with stage, asset counts, and lifecycle state
- optional P2/P3 validation evidence sections when a feature id is supplied
- optional `Workflow attempt attribution` when `--workflow` is supplied

Use `--workflow` to inspect a catalog workflow row on Gemini:

```bash
rp1 verify gemini --workflow dev:build
```

When the workflow row is supported, the verifier prints the workflow id, state,
generated-bundle rationale, evidence source, and user action.

## Current Support Matrix

The generated matrix lives in `dist/gemini/<plugin>/support-matrix.json` and is
also represented in `dist/gemini/bundle-manifest.json`. The current
user-facing workflow rows are all `supported`.

| Workflow id | Workflow class | Status | User action |
|-------------|----------------|--------|-------------|
| `dev:build` | development workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:build-fast` | development workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:phase-plan` | development workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:speedrun` | development workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:pr-review` | review workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:pr-visual` | review workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:pr-walkthrough` | review workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:generate-user-docs` | documentation workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:project-birds-eye-view` | documentation workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:knowledge-build` | knowledge workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:analyse-security` | strategy workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:deep-research` | strategy workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:socratic-duel` | strategy workflow | `supported` | Run from the generated Gemini extension bundle. |
| `base:socratic-duel-run` | strategy workflow | `supported` | Run from the generated Gemini extension bundle. |
| `dev:blueprint` | planning workflow | `supported` | Run from the generated Gemini extension bundle. |

Internal-only, template-only, non-workflow, and validation-only artifacts are
excluded from user-facing Gemini workflow support claims.

## Support Policy

User-facing workflow rows are generated as `supported` when they are
distributable, invocable workflows in the catalog and their Gemini command,
skill, agent, and context assets are present in the generated bundle. Optional
runtime evidence can still be recorded for validation, but it is not required
to claim generated-bundle support.

When a Gemini support-state change is made, update these in the same change:

- generated support matrix
- verifier output expectations
- this platform guide
- install, update, uninstall, and verify command docs
- generated guide references when they mention workflow support

## Limitations And User Actions

| Situation | What it means | What to do |
|-----------|---------------|------------|
| Gemini CLI is missing | The generated bundle target cannot be verified locally. | Install Gemini CLI only if you intend to use Gemini assets, then run `gemini --version`. |
| Generated bundle assets are missing or stale | Installed Gemini extension files do not match the current manifest. | Run `rp1 install gemini` or `rp1 update plugins gemini`, restart Gemini CLI, then verify. |
| A workflow id is unknown | The workflow id is not present in the generated matrix. | Confirm the workflow id or rebuild the Gemini bundle from current catalog sources. |
| Gemini asks to trust the workspace | The run is blocked on an interactive trust decision. | Trust the intended repository or rerun on a stable host. |
| Gemini asks for tool approval | The run is blocked on Gemini approval policy. | Approve the action interactively when appropriate; do not assume unattended resume. |
| Gemini reports new agents | Project or extension agents may need acknowledgement. | Acknowledge and enable the agents, then rerun verification. |
| Headless validation stops | A trust, approval, user-input, or acknowledgement gate likely interrupted automation. | Rerun interactively or capture the blocker as validation evidence. |

## Opt-In Boundary

Gemini prerequisites apply only to users who choose to install or verify Gemini
generated bundle assets. Do not ask non-Gemini users to install Gemini,
acknowledge Gemini agents, refresh Gemini extensions, or run Gemini lifecycle
commands.

Stable host verification remains separate:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

Stable-host evidence is tracked separately from Gemini, and Gemini limitations
do not downgrade stable-host support.
