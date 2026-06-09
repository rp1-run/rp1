# Goose Platform Guide

Goose support is experimental and limited to rp1's verified core recipe
harness: generated Goose skills, agents, recipes, targeted install/verify, and
one non-delegating recipe-backed runtime path. This page does not claim broad
workflow parity with Claude Code, OpenCode, Codex, Copilot, or Antigravity.

## Prerequisites

- Goose CLI available on `PATH` as `goose`.
- Goose `1.35.0` or newer.
- Current Goose build assets from `dist/goose/` when installing from a source
  checkout.
- The Goose builtin `developer` extension for basic filesystem and shell work.

Check the local Goose binary first:

```bash
goose --version
```

## Install And Verify

Install rp1 Goose assets:

```bash
rp1 install goose
```

Verify the local setup:

```bash
rp1 verify goose
```

`rp1 install goose` installs only manifest-owned Goose assets under
`~/.agents`. It does not modify Claude Code, OpenCode, Codex, Copilot,
Antigravity, or Gemini install locations.

## Goose Discovery Paths

| Asset | Installed location |
|-------|--------------------|
| Skills | `~/.agents/skills/` |
| Agents | `~/.agents/agents/` |
| Recipes | `~/.agents/recipes/` |
| Plugin manifests and support metadata | `~/.agents/plugins/` |

The generated package includes rp1 skills, agents, recipe entrypoints, plugin
manifest files, support metadata, and the rp1 version marker used by lifecycle
verification.

## Runtime Entrypoint

Run an installed rp1 Goose recipe with this shape:

```bash
goose run --recipe <recipe-name-or-path> --params ARGUMENTS='<raw rp1 arguments>'
```

For source or validation runs, recipe rendering and smoke tests use the builtin
developer extension explicitly:

```bash
goose run --recipe <recipe-path> \
  --params ARGUMENTS='FEATURE_ID=goose-harness-core' \
  --no-profile \
  --with-builtin developer
```

Generated recipes load the matching generated skill, set `CURRENT_HOST=goose`,
bootstrap rp1 with `--harness goose`, preflight `goose --version`, and treat
Goose JSON output as a transcript or metadata envelope rather than a bare final
answer.

## Current Runtime Support

| Area | Status |
|------|--------|
| Generated Goose skills, agents, recipes, manifests, and support metadata | Supported for the core harness slice |
| `rp1 install goose` and `rp1 verify goose` | Supported as targeted Goose lifecycle commands |
| Basic filesystem and shell work | Supported through Goose's builtin `developer` extension |
| Argument passing | Supported through the recipe `ARGUMENTS` parameter |
| Workflow identity | Supported with `CURRENT_HOST=goose` and `--harness goose` |
| Runtime proof | Verified for one non-delegating recipe-backed path that records rp1 run and artifact evidence |
| Runtime smoke during normal verify | Not run automatically; `rp1 verify goose` reports optional smoke evidence when supplied |

## Verify Output

`rp1 verify goose` reports:

| Section | Meaning |
|---------|---------|
| Goose CLI | Detected `goose` version and whether it satisfies the minimum version. |
| Manifest lifecycle | Whether manifest-owned installed assets are current, missing, partial, stale, removed, or blocked. |
| Recipe validation | Whether installed recipes validate and at least one recipe renders through Goose. |
| Support metadata | The generated support claim and unsupported scope. |
| Runtime smoke | Optional evidence for the non-delegating recipe-backed runtime path. |

If verification reports missing, partial, stale, or blocked assets, run
`rp1 install goose` and then rerun `rp1 verify goose`.

## Unsupported Areas

The Goose feature slice deliberately does not support:

- ACP sidecar work.
- Protocol integration.
- Eval harness expansion.
- PR-review expansion.
- Nested subagents or nested delegation.
- Subagent delegation without a validated foreground Summon smoke.
- Interactive headless approvals.
- User elicitation in headless recipe runs.
- Web access, notebook editing, and background shell session control.
- Broad workflow parity claims outside the verified core recipe harness.

When a generated Goose workflow reaches one of these paths, it should fail
closed with an unsupported-capability message instead of waiting indefinitely or
pretending the capability succeeded.

## Recovery

| Situation | What to do |
|-----------|------------|
| `goose` is missing | Install Goose CLI, confirm `goose --version`, then rerun `rp1 verify goose`. |
| Goose is older than `1.35.0` | Upgrade Goose and rerun verification. |
| Assets are missing or stale | Run `rp1 install goose`, then rerun `rp1 verify goose`. |
| Recipe validation or render fails | Inspect the printed Goose command output, refresh assets with `rp1 install goose`, then verify again. |
| Runtime needs delegation or interactive input | Run the workflow on a harness that supports that path, or add validation before expanding Goose support. |
