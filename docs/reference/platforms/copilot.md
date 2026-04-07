# Copilot CLI Platform Guide

Setup, usage, and platform-specific details for running rp1 on GitHub Copilot CLI.

---

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) version 2.74.0 or later
- [GitHub Copilot extension](https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line) enabled for your GitHub account
- rp1 CLI installed (`curl -fsSL https://rp1.run/install.sh | sh`)

Verify prerequisites:

```bash
gh --version
gh copilot -- plugin --help
```

## Installation

```bash
rp1 install copilot
```

`rp1 install copilot` uses GitHub Copilot's native plugin lifecycle. It stages a local rp1-managed marketplace, registers it as `rp1-local`, then installs or updates the required Copilot plugins from that marketplace.

Expected paths:

| Surface | Location |
|---------|----------|
| Local marketplace metadata | `~/.rp1/copilot/marketplace/marketplace.json` |
| Local marketplace plugins | `~/.rp1/copilot/marketplace/plugins/rp1-*` |
| Native installed plugins | `~/.copilot/installed-plugins/rp1-local/rp1-*` |
| Unsupported legacy footprint | `~/.config/github-copilot/` |

The supported install target is the native marketplace flow above. Old file-copy paths under `~/.config/github-copilot/` are only treated as legacy leftovers during verification and uninstall.

### Verify Installation

```bash
rp1 verify copilot
```

`rp1 verify copilot` inspects `gh copilot -- plugin list`, the native installed-plugin cache, the staged local marketplace, and any legacy rp1 footprints. The verifier reports one of these states:

| State | Meaning | What to do |
|-------|---------|------------|
| `healthy_native` | Required plugins are installed from `rp1-local` and the native plus staged artifacts are complete | Success |
| `partial_native` | Copilot sees some rp1 native state, but required plugins or artifact classes are missing | Re-run `rp1 install copilot` |
| `legacy_only` | Only unsupported file-drop content exists under `~/.config/github-copilot/` | Remove legacy rp1 files and reinstall |
| `mixed_native_and_legacy` | Native install works, but legacy rp1 files still exist | Clean up the listed legacy footprints |
| `not_installed` | No rp1 Copilot install was found | Run `rp1 install copilot` |

The clean target is `healthy_native`. `mixed_native_and_legacy` still indicates a working native install, but cleanup is still required.

### Preview Without Installing

```bash
rp1 install copilot --dry-run
```

Dry-run mode previews the local marketplace registration plus the `gh copilot -- plugin install` and `update` commands without mutating Copilot.

## Skill Invocation

Skills are invoked with the `/` prefix inside a Copilot CLI session:

```bash
/rp1-dev-build my-feature
/rp1-base-knowledge-build
```

Copilot CLI discovers skills from the configured skills directory. Each skill is an `rp1-` prefixed directory containing a `SKILL.md` file.

## Parameter Passing

Copilot CLI uses model-parsed parameter recovery. Pass arguments inline after the skill name:

```bash
/rp1-dev-build my-feature --afk
/rp1-base-deep-research "authentication flow"
```

The model extracts parameter values from your invocation text and passes them to the `rp1 agent-tools resolve-args` command. Skills with required arguments will prompt you if values are missing.

## Sub-Agent Workflows

Multi-agent workflows on Copilot CLI use file-backed JSON artifact handoff. Parent agents delegate to sub-agents via `create_agent`, and structured output is exchanged through files in `.rp1/work/agent-output/`.

This is consistent with how sub-agent coordination works on all rp1 platforms.

## KB Bootstrapping

Copilot CLI loads `AGENTS.md` at session start, which instructs the agent to read `.rp1/context/index.md` and progressively load knowledge base files. This provides architecture-aware, convention-respecting assistance.

Ensure your project has been initialized with rp1:

```bash
rp1 init
```

## Workflow Events and Arcade

Workflow events emitted via `rp1 agent-tools emit` work in Copilot CLI sessions. Runs initiated from Copilot CLI appear in the Arcade dashboard alongside runs from other platforms.

```bash
rp1 arcade    # View all workflow runs including Copilot-originated ones
```

## Platform Capabilities

| Capability | Supported |
|------------|-----------|
| Skills (slash commands) | Yes |
| Custom agents | Yes |
| Sub-agent delegation | Yes |
| File read/write/edit/search | Yes |
| Shell command execution | Yes |
| `rp1 agent-tools` commands | Yes |
| Parallel sub-agent execution | Yes |
| Model-parsed parameters | Yes |
| AGENTS.md instruction loading | Yes |

## Tool Name Mappings

Copilot CLI uses its own tool names. rp1's build pipeline translates tool references automatically:

| rp1 Abstract | Copilot CLI |
|--------------|-------------|
| Read | `read_file` |
| Write | `write_file` |
| Edit | `edit_file` |
| Grep | `grep_search` |
| Glob | `file_search` |
| Bash | `run_terminal_command` |
| Task | `create_agent` |
| Skill | `run_skill` |
| WebFetch | `fetch_url` |
| AskUserQuestion | `ask_user` |

## Updating

```bash
rp1 update plugins copilot
# or
rp1 update
```

Updating Copilot reuses the same native lifecycle as install. rp1 restages `~/.rp1/copilot/marketplace`, then runs Copilot's native install-or-update flow so `rp1-base` and `rp1-dev` stay on the same model as the original install.

After updating, restart your Copilot CLI session so it reloads the refreshed rp1 plugins.

## Uninstalling

```bash
rp1 uninstall copilot
```

Preview first if needed:

```bash
rp1 uninstall copilot --dry-run
```

`rp1 uninstall copilot` removes:

- native rp1 plugins such as `rp1-base@rp1-local` and `rp1-dev@rp1-local`
- the `rp1-local` marketplace registration
- the staged marketplace at `~/.rp1/copilot/marketplace`
- rp1-only legacy leftovers under `~/.config/github-copilot/`

It preserves non-rp1 Copilot content.

## Maintainer Workflow

Use the fast iteration loop while developing Copilot behavior:

```bash
just copilot
```

This auto-builds stale Copilot plugin roots and launches:

```bash
gh copilot -- --plugin-dir dist/copilot/base --plugin-dir dist/copilot/dev
```

That path is for maintainer iteration only. It does not install into `rp1-local` and does not mutate `~/.copilot/installed-plugins/`. Set `PLUGIN_UTILS=1 just copilot` only when you intentionally need the internal-only `rp1-utils` plugin.

Use the install-like path before release or when validating the supported user experience:

```bash
just build-copilot
./bin/rp1 install copilot --yes --artifacts-dir dist/copilot
./bin/rp1 verify copilot
gh copilot
```

Release-readiness validation should end in `healthy_native`.

## Troubleshooting

### GitHub CLI not found

Confirm `gh` is installed and on your PATH:

```bash
which gh
gh --version
```

If missing, install from [cli.github.com](https://cli.github.com/).

### Copilot extension not available

Enable the Copilot CLI extension:

```bash
gh extension install github/gh-copilot
```

Then confirm the native plugin lifecycle commands exist:

```bash
gh copilot -- plugin --help
```

### `partial_native` or missing workflows

1. Restart your Copilot CLI session
2. Run `rp1 verify copilot` to check installation health
3. Confirm `gh copilot -- plugin list` includes `rp1-base@rp1-local` and `rp1-dev@rp1-local`
4. Re-run `rp1 install copilot`

### `legacy_only` or `mixed_native_and_legacy`

If verification reports legacy footprints, remove only the listed rp1 paths under `~/.config/github-copilot/` and rerun `rp1 verify copilot`. Do not treat those legacy paths as a valid install surface.

### Permission denied

Confirm write access to the rp1 staging directory:

```bash
ls -la ~/.rp1/copilot/
```

## See Also

- [Installation Reference](../cli/install.md)
- [Skill Invocation](../index.md#skill-invocation)
- [DEVELOPMENT.md](../../../DEVELOPMENT.md) -- Developer guide with `just copilot` recipe
