# verify

Verify rp1 host integrations and Gemini extension assets.

---

## Synopsis

```bash
rp1 verify
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
rp1 verify gemini [--feature-id <feature-id>] [--workflow <workflow-id>]
```

## Description

Use `rp1 verify` after install, update, or uninstall actions to confirm the host
integration or Gemini extension state. Stable host checks report whether rp1 is
installed and healthy for that host. Gemini verification reports extension
lifecycle state and support-matrix attribution.

## Subcommands

| Command | Purpose |
|---------|---------|
| `rp1 verify claude-code` | Verify Claude Code plugins are installed. |
| `rp1 verify opencode` | Verify OpenCode installation. |
| `rp1 verify codex` | Verify Codex CLI installation. |
| `rp1 verify copilot` | Verify GitHub Copilot CLI native plugin installation. |
| `rp1 verify gemini` | Verify Gemini CLI extension setup. |

For Copilot, the clean success signal is `healthy_native`. A
`mixed_native_and_legacy` result means the native install works, but old rp1
files still need cleanup under `~/.config/github-copilot/`.

## Gemini Verification

Gemini CLI is a first-class extension target. Automatic init,
install-all, and update-all paths install or refresh Gemini assets when Gemini
CLI is detected.

```bash
rp1 install gemini
rp1 verify gemini
```

The Gemini verifier reports:

| Section | Meaning |
|---------|---------|
| `Support: first-class (Gemini CLI extension assets)` | rp1 is checking Gemini CLI extension assets and workflow readiness. |
| `State` | Gemini setup state, such as `ready`, `degraded_missing_binary`, `degraded_missing_command`, `degraded_trust_or_approval`, or `registration_failed`. |
| `Manifest lifecycle` | Whether manifest-owned Gemini assets are `current`, `removed`, `missing`, `partial`, `stale`, or `blocked`. |
| `P2 delegation evidence` | Optional feature evidence for delegation, fanout, delegated failure, and acknowledgement. |
| `P3 boundary evidence` | Optional feature evidence for trust, approval, auth, user-input, headless, and lifecycle boundaries. |
| `Workflow attempt attribution` | Optional support-matrix attribution for a requested workflow id. |

Use `--workflow` to check whether a workflow attempt is supported on Gemini:

```bash
rp1 verify gemini --workflow dev:build
```

The current Gemini support matrix supports all 15 workflow rows. If
`--workflow` reports `supported`, the verifier prints the first-class Gemini
evidence source for that workflow row.

Use `--feature-id` only when you need the verifier to read feature evidence from
the work directory:

```bash
rp1 verify gemini --feature-id <feature-id>
```

Future Gemini workflow support changes must update the generated support
matrix, verifier output, and public docs together.

## Common Recovery

| Result | Next action |
|--------|-------------|
| Host plugin missing | Run the matching `rp1 install <host>` command, then restart the host. |
| Gemini lifecycle `removed` | Run `rp1 install gemini` before using Gemini commands. |
| Gemini lifecycle `missing` or `partial` | Reinstall the complete Gemini CLI extension with `rp1 install gemini`. |
| Gemini lifecycle `stale` | Run `rp1 install gemini` or `rp1 update plugins gemini`, restart Gemini CLI, then verify. |
| Gemini lifecycle `blocked` | Fix the printed file permission, trust, or approval blocker, then rerun verification. |
| Gemini workflow `unknown` | Confirm the workflow id or rebuild Gemini assets from current catalog sources. |

## See Also

- [install](install.md)
- [update](update.md)
- [uninstall](uninstall.md)
- [Gemini CLI Platform Guide](../platforms/gemini.md)
