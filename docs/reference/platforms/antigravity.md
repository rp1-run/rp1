# Antigravity CLI Platform Guide

Antigravity CLI is the active Google host target for rp1. It uses the `agy`
binary, Antigravity plugin assets, and a catalog-backed support matrix for
user-facing workflows.

Gemini CLI support was never released as a public rp1 platform. Historical
Gemini artifacts may remain as provenance, but active install, verification,
troubleshooting, and release guidance should use Antigravity.

## Current Status

- `rp1 build:opencode --platform antigravity` writes Antigravity plugin assets
  to `dist/antigravity/`; `--platform all` includes Antigravity with the other
  shipped host targets.
- The Antigravity package contains rp1 skills, rules, hooks, MCP configuration,
  support metadata, compact delegation-definition assets, lifecycle manifests,
  and `support-matrix.json`.
- Antigravity lifecycle commands are manifest-backed:
  `rp1 install antigravity`, `rp1 update plugins antigravity`,
  `rp1 verify antigravity`, and `rp1 uninstall antigravity`.
- Existing Claude Code, OpenCode, Codex CLI, and GitHub Copilot CLI setup and
  workflow support are independent from Antigravity.

## Prerequisites

- Antigravity CLI available on `PATH` as `agy`.
- rp1 CLI available from the project checkout that owns the Antigravity plugin
  assets.
- A trusted workspace or worktree when running Antigravity interactively.
- Current `dist/antigravity/` assets from the active feature or release branch.

Verify the local Antigravity binary first:

```bash
agy --version
```

Install or verify the Antigravity package:

```bash
rp1 install antigravity
rp1 verify antigravity
```

## Package Layout

Antigravity assets install under the Antigravity-owned local profile area:

```text
~/.gemini/antigravity-cli/rp1-base/
~/.gemini/antigravity-cli/rp1-dev/
```

The generated package contains:

| Asset | Purpose |
|-------|---------|
| `plugin.json` or package metadata | Identifies rp1 plugin assets to Antigravity. |
| `skills/` | User-invoked rp1 workflows and helper skills. |
| `rules/` | Host instructions and rp1 project behavior rules. |
| `hooks` | Session hooks where Antigravity supports them. |
| `mcp_config.json` | MCP guidance and configuration when a workflow needs external tools. |
| Delegation-definition assets | Compact rp1 subagent definitions used by dynamic delegation prompts. |
| `manifest.json` | Manifest-owned file list for install, verify, update, and uninstall. |
| `support-matrix.json` | Per-workflow support state, limitation, and user action. |

Static packaged agent files or static `/agents` discovery are not the runtime
delegation contract for Antigravity.

## Workflow Support Matrix

The Antigravity support matrix classifies each shipped user-facing workflow as
`supported`, `limited`, or `unsupported`.

Use `--workflow` to inspect a catalog workflow row:

```bash
rp1 verify antigravity --workflow dev:build
```

Support states mean:

| State | Meaning |
|-------|---------|
| `supported` | The workflow has no known Antigravity-specific blocker in the current matrix. |
| `limited` | The workflow is usable only within the printed boundary or validation state. |
| `unsupported` | The workflow must run on another host until the printed product-owned exception is resolved. |

Delegated workflow rows are currently limited by the dynamic session-subagent
contract.

## Dynamic Delegation

Antigravity delegated and fanout-heavy rp1 workflows use dynamic custom
subagents. The parent workflow maintains a conversation/session-local registry
for each required rp1-derived subagent type.

Before first use of a required type in the active session, the parent calls
`define_subagent` with:

- `name`
- `description`
- `system_prompt`
- `enable_mcp_tools`
- `enable_write_tools`
- `enable_subagent_tools`

After definition succeeds, the parent records the returned `TypeName` in the
session registry and reuses it for repeated task units and fanout batches with
`invoke_subagent`.

Every dynamic invocation should include:

- explicit `Prompt`, `Role`, and cached `TypeName`
- an allowed `Workspace` when the workflow needs file access outside the
  inherited workspace
- an attributable result contract with unit id, status, artifact path when
  applicable, and failure reason

Static `/agents` discovery is not support evidence. Nested delegation is enabled
only where validation evidence proves it works for the workflow.

## Lifecycle Commands

| Command | Purpose | Notes |
|---------|---------|-------|
| `rp1 install antigravity` | Copies current manifest-owned Antigravity assets into Antigravity plugin directories. | Targeted install path; `rp1 install` also installs Antigravity when `agy` is detected. |
| `rp1 update plugins antigravity` | Refreshes installed Antigravity assets from the current manifest. | Targeted refresh path; `rp1 update plugins all` also refreshes Antigravity when detected. |
| `rp1 verify antigravity` | Checks Antigravity plugin lifecycle state. | A current lifecycle means the installed Antigravity package is ready. |
| `rp1 verify antigravity --workflow <workflow-id>` | Attributes one workflow attempt against the Antigravity matrix. | Limited rows print the dynamic delegation or product-owned exception boundary. |
| `rp1 uninstall antigravity` | Removes safe, manifest-owned Antigravity assets. | Preserves modified files and unrelated Antigravity assets. |

Lifecycle states include `current`, `removed`, `missing`, `partial`, `stale`,
and `blocked`. A `removed`, `missing`, `partial`, or `stale` lifecycle state
means the Antigravity plugin assets are inactive or need a refresh; it does not
change support status for stable hosts.

## Limitations And User Actions

Antigravity may require workspace trust, shell approval, tool permissions, MCP
access, or an interactive user decision before a workflow can continue. rp1
does not grant those permissions automatically.

Maintainers can capture release evidence with `just antigravity-smoke-boundaries`.
The recipe writes `features/antigravity/antigravity-boundaries.md` and
`features/antigravity/antigravity-boundaries.json` under `.rp1/work/`. It
automates safe local checks such as `agy --version`, available boundary flags,
generated `mcp_config.json`, and support metadata. Live-only proof is supplied
by rerunning the focused recipes with transcript paths:

```bash
RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT=/tmp/rp1-antigravity-permissions-trust.txt just antigravity-smoke-permissions-trust
RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT=/tmp/rp1-antigravity-mcp-failure.txt just antigravity-smoke-mcp-failure
```

Set `RP1_ANTIGRAVITY_REQUIRE_LIVE=1` when missing live transcripts should fail
release verification instead of producing a manual-required evidence artifact.

| Situation | What it means | What to do |
|-----------|---------------|------------|
| Antigravity CLI is missing | The Antigravity target cannot be verified locally. | Install Antigravity CLI, then run `agy --version`. |
| Plugin assets are missing or stale | Installed files do not match the current manifest. | Run `rp1 install antigravity` or `rp1 update plugins antigravity`, restart Antigravity CLI, then verify. |
| Workspace trust is required | The run is blocked on an interactive trust decision. | Trust the intended repository or rerun on a stable host. |
| Tool approval is required | The run is blocked on Antigravity approval policy. | Approve the action interactively when appropriate; do not assume unattended resume. |
| Dynamic subagent definition fails | The parent could not create the required custom type for this session. | Rerun in an allowed workspace and capture the failure as support evidence if it persists. |
| Dynamic subagent invocation fails | The parent could not launch or collect a previously defined type. | Verify the cached `TypeName`, workspace, and result contract before retrying. |
| Headless validation stops | A trust, approval, user-input, or dynamic delegation gate likely interrupted automation. | Rerun interactively or capture the blocker as validation evidence. |

## MCP And Settings

MCP setup must follow Antigravity-specific paths and support boundaries. When a
workflow depends on MCP access, the workflow or verification output should make
the required server, permission, and remediation explicit.

If MCP is unavailable or misconfigured, treat the workflow as limited or
unsupported for Antigravity until validation proves a reliable path.

## Fresh Evidence Boundary

Fresh Antigravity release claims require Antigravity evidence from current
builds, package validation, lifecycle checks, verifier output, and workflow
smoke runs. Historical Gemini evidence may explain implementation history, but
it does not prove Antigravity support unless the same assumption has fresh
Antigravity validation or an explicit product-owned exception.

## Stable Host Boundary

Antigravity prerequisites apply when `agy` is detected or when a user targets
Antigravity directly. Users without Antigravity CLI installed are not asked to
install Antigravity, refresh Antigravity assets, or run Antigravity lifecycle
commands.

Stable host verification remains separate:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

Stable-host evidence is tracked separately from Antigravity, and Antigravity
limitations do not downgrade stable-host support.
