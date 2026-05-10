# GitHub Copilot CLI Platform Guide

Set up, verify, and recover rp1 on GitHub Copilot CLI.

---

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) version 2.74.0 or later
- GitHub Copilot CLI enabled for your GitHub account
- rp1 CLI installed

Verify Copilot plugin support:

```bash
gh --version
gh copilot -- plugin --help
```

## Quick Setup

Install rp1 into Copilot:

```bash
rp1 install copilot
```

Verify the install:

```bash
rp1 verify copilot
```

The clean result is `healthy_native`. After installation or update, restart your
Copilot CLI session so it reloads rp1.

## Run Workflows

Inside a Copilot CLI session, invoke rp1 workflows with `/rp1-...` commands:

```bash
/rp1-base-knowledge-build
/rp1-dev-build my-feature
/rp1-dev-pr-review
```

Pass arguments inline after the workflow name:

```bash
/rp1-dev-build my-feature --afk
/rp1-base-deep-research "authentication flow"
```

## Supported User Workflows

| Goal | Command |
|------|---------|
| Generate project context | `/rp1-base-knowledge-build` |
| Start a feature | `/rp1-dev-build my-feature` |
| Make a quick change | `/rp1-dev-build-fast "..."` |
| Review a PR | `/rp1-dev-pr-review` |
| Create an onboarding overview | `/rp1-base-project-birds-eye-view` |
| Open Arcade | `rp1 arcade` |

Runs started from Copilot appear in Arcade alongside runs from other supported
hosts.

## Update

```bash
rp1 update plugins copilot
# or
rp1 update
```

Restart your Copilot CLI session after updating.

## Uninstall

```bash
rp1 uninstall copilot
```

Preview first if needed:

```bash
rp1 uninstall copilot --dry-run
```

The uninstall command removes only rp1-managed Copilot content and preserves
non-rp1 Copilot configuration.

## Troubleshooting

### GitHub CLI Not Found

Confirm `gh` is installed and on your `PATH`:

```bash
which gh
gh --version
```

If missing, install it from [cli.github.com](https://cli.github.com/).

### Copilot Plugin Support Is Missing

Confirm the Copilot CLI extension is available:

```bash
gh copilot -- plugin --help
```

If that command is unavailable, update GitHub CLI and enable Copilot CLI for
your account.

### `rp1 verify copilot` Is Not `healthy_native`

| State | Meaning | What to do |
|-------|---------|------------|
| `healthy_native` | Copilot sees the required rp1 plugins and the install is complete. | No action. |
| `partial_native` | Copilot sees part of rp1, but something is missing. | Re-run `rp1 install copilot`, then verify again. |
| `legacy_only` | Only an old unsupported rp1 Copilot install was found. | Remove the legacy paths listed by verification, then reinstall. |
| `mixed_native_and_legacy` | The current install works, but old rp1 files are still present. | Remove only the legacy paths listed by verification. |
| `not_installed` | No rp1 Copilot install was found. | Run `rp1 install copilot`. |

### Workflows Still Do Not Appear

1. Restart the Copilot CLI session.
2. Run `rp1 verify copilot`.
3. Confirm `gh copilot -- plugin list` shows `rp1-base@rp1-local` and
   `rp1-dev@rp1-local`.
4. Re-run `rp1 install copilot` if either plugin is missing.

## Advanced Copilot Reference

The sections below are for maintainers and support/debugging sessions. Normal
setup should use the quick setup and troubleshooting paths above.

### Install Lifecycle

`rp1 install copilot` uses Copilot's native plugin lifecycle. rp1 stages a local
rp1-managed marketplace, registers it as `rp1-local`, then installs or updates
the required Copilot plugins from that marketplace.

| Surface | Location |
|---------|----------|
| Local marketplace metadata | `~/.rp1/copilot/marketplace/marketplace.json` |
| Local marketplace plugins | `~/.rp1/copilot/marketplace/plugins/rp1-*` |
| Native installed plugins | `~/.copilot/installed-plugins/rp1-local/rp1-*` |
| Unsupported legacy footprint | `~/.config/github-copilot/` |

Old file-copy paths under `~/.config/github-copilot/` are treated only as
legacy leftovers during verification and uninstall.

### Dry Run

```bash
rp1 install copilot --dry-run
```

Dry-run mode previews the Copilot marketplace registration and plugin
install/update actions without mutating Copilot.

### Platform Capabilities

| Capability | Supported |
|------------|-----------|
| Workflow commands | Yes |
| Custom agents | Yes |
| Delegated agent work | Yes |
| File read/write/edit/search | Yes |
| Shell command execution | Yes |
| `rp1 agent-tools` commands | Yes |
| Parallel delegated work | Yes |
| Inline argument recovery | Yes |
| `AGENTS.md` instruction loading | Yes |

### Tool Name Mapping

Copilot CLI uses its own tool names. rp1 translates generated tool references
for Copilot during the build process.

| rp1 abstract tool | Copilot CLI tool |
|-------------------|------------------|
| Read | `read` / `view` |
| Write | `edit` |
| Edit | `edit` |
| Grep | `grep` / `search` |
| Glob | `glob` / `search` |
| Bash | `bash` / `shell` / `execute` |
| Task | `task` / `agent` |
| Skill | `skill` |
| WebFetch | `web_fetch` |
| AskUserQuestion | `ask_user` |

### Maintainer Iteration

Use this loop only when developing Copilot support locally:

```bash
just copilot
```

This auto-builds stale Copilot plugin roots and launches Copilot with local build
outputs. It does not install into the supported `rp1-local` target.

Before release or when validating the supported user path, use the install-like
flow:

```bash
just build-copilot
./bin/rp1 install copilot --yes --artifacts-dir dist/copilot
./bin/rp1 verify copilot
gh copilot
```

Release-readiness validation should end in `healthy_native`.

## See Also

- [Installation and Host Setup](../../getting-started/installation.md)
- [install Reference](../cli/install.md)
- [Troubleshooting](../../troubleshooting/index.md)
