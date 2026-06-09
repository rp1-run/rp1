# verify

Verify rp1 host integrations and Antigravity plugin assets.

---

## Synopsis

```bash
rp1 verify
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
rp1 verify antigravity [--workflow <workflow-id>]
rp1 verify goose
```

## Description

Use `rp1 verify` after install, update, or uninstall actions to confirm the host
integration or Antigravity plugin state. Stable host checks report whether rp1
is installed and healthy for that host. Antigravity verification reports plugin
lifecycle state and support-matrix attribution. Goose verification reports the
experimental core recipe harness assets and avoids broader parity claims.

## Subcommands

| Command | Purpose |
|---------|---------|
| `rp1 verify claude-code` | Verify Claude Code plugins are installed. |
| `rp1 verify opencode` | Verify OpenCode installation. |
| `rp1 verify codex` | Verify Codex CLI installation. |
| `rp1 verify copilot` | Verify GitHub Copilot CLI native plugin installation. |
| `rp1 verify antigravity` | Verify Antigravity CLI plugin setup. |
| `rp1 verify goose` | Verify Goose CLI, manifest assets, recipes, support metadata, and optional runtime-smoke evidence. |

For Copilot, the clean success signal is `healthy_native`. A
`mixed_native_and_legacy` result means the native install works, but old rp1
files still need cleanup under `~/.config/github-copilot/`.

## Antigravity Verification

Antigravity CLI is the active Google host target. Automatic init, install-all,
and update-all paths install or refresh Antigravity assets when `agy` is
detected.

```bash
rp1 install antigravity
rp1 verify antigravity
```

The Antigravity verifier reports:

| Section | Meaning |
|---------|---------|
| `Support: first-class (Antigravity CLI plugin assets)` | rp1 is checking Antigravity CLI plugin assets and workflow readiness. |
| `State` | Antigravity setup state, such as `ready`, `degraded_missing_binary`, `degraded_missing_command`, `degraded_trust_or_approval`, or `registration_failed`. |
| `Manifest lifecycle` | Whether manifest-owned Antigravity assets are `current`, `removed`, `missing`, `partial`, `stale`, or `blocked`. |
| `Dynamic delegation evidence` | Optional evidence for `define_subagent`, cached `TypeName` reuse, fanout, and delegated failure handling. |
| `Boundary evidence` | Optional evidence for trust, approval, auth, user-input, headless, workspace, and lifecycle boundaries. |
| `Workflow attempt attribution` | Optional support-matrix attribution for a requested workflow id. |

Use `--workflow` to check whether a workflow attempt is supported on
Antigravity:

```bash
rp1 verify antigravity --workflow dev:build
```

The Antigravity support matrix classifies shipped user-facing workflow rows as
`supported`, `limited`, or `unsupported`. Delegated rows are limited by the
dynamic session-subagent contract: define each required rp1-derived type once
with `define_subagent`, then reuse the cached `TypeName` with
`invoke_subagent`.

Future Antigravity workflow support changes must update the generated support
matrix, verifier output, and public docs together.

## Goose Verification

Goose support is experimental and limited to the verified core recipe harness:
generated Goose skills, agents, recipes, targeted install/verify, and a
non-delegating recipe runtime path.

```bash
rp1 install goose
rp1 verify goose
```

The Goose verifier reports:

| Section | Meaning |
|---------|---------|
| `Support: experimental` | rp1 is checking the verified Goose core recipe harness slice. |
| `Manifest lifecycle` | Whether manifest-owned Goose assets are `current`, `removed`, `missing`, `partial`, `stale`, or `blocked`. |
| `Recipe validation` | Whether installed recipes validate and at least one recipe renders through Goose. |
| `Support metadata` | The generated claim and explicit unsupported scope. |
| `Runtime smoke` | Optional opt-in evidence for a non-delegating recipe-backed runtime path. |

Unsupported Goose scope currently includes ACP sidecar work, protocol
integration, eval harness expansion, PR-review expansion, nested delegation,
interactive headless approvals, user elicitation, and broad workflow parity.

## Common Recovery

| Result | Next action |
|--------|-------------|
| Host plugin missing | Run the matching `rp1 install <host>` command, then restart the host. |
| Antigravity lifecycle `removed` | Run `rp1 install antigravity` before using Antigravity commands. |
| Antigravity lifecycle `missing` or `partial` | Reinstall the complete Antigravity CLI plugin with `rp1 install antigravity`. |
| Antigravity lifecycle `stale` | Run `rp1 install antigravity` or `rp1 update plugins antigravity`, restart Antigravity CLI, then verify. |
| Antigravity lifecycle `blocked` | Fix the printed file permission, trust, or approval blocker, then rerun verification. |
| Antigravity workflow `unknown` | Confirm the workflow id or rebuild Antigravity assets from current catalog sources. |
| Goose lifecycle `missing`, `partial`, or `stale` | Run `rp1 install goose`, then rerun `rp1 verify goose`. |

## See Also

- [install](install.md)
- [update](update.md)
- [uninstall](uninstall.md)
- [Antigravity CLI Platform Guide](../platforms/antigravity.md)
