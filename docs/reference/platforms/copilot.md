# Copilot CLI Platform Guide

Setup, usage, and platform-specific details for running rp1 on GitHub Copilot CLI.

---

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) version 2.74.0 or later
- [GitHub Copilot extension](https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line) enabled for your GitHub account
- rp1 CLI installed (`curl -fsSL https://rp1.run/install.sh | sh`)

Verify prerequisites:

```bash
gh --version          # Must be >= 2.74.0
gh copilot --help     # Copilot extension must be available
```

## Installation

```bash
rp1 install copilot
```

This extracts rp1 skills and agents to the Copilot CLI configuration directory:

| Artifact | Location |
|----------|----------|
| Skills | `~/.config/github-copilot/skills/rp1-*/` |
| Agents | `~/.config/github-copilot/agents/` |

### Verify Installation

```bash
rp1 verify copilot
```

### Preview Without Installing

```bash
rp1 install copilot --dry-run
```

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
rp1 update
```

This detects when installed Copilot plugins are older than the embedded version and re-extracts them.

## Uninstalling

To remove rp1 from Copilot CLI:

```bash
just rm-stable
```

Or manually:

```bash
rm -rf ~/.config/github-copilot/skills/rp1-*/
rm -rf ~/.config/github-copilot/agents/rp1*
```

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

### Skills not appearing

1. Restart your Copilot CLI session
2. Run `rp1 verify copilot` to check installation health
3. Confirm skill files exist at `~/.config/github-copilot/skills/`

### Permission denied

Confirm write access to the configuration directory:

```bash
ls -la ~/.config/github-copilot/
```

## See Also

- [Installation Reference](../cli/install.md)
- [Skill Invocation](../index.md#skill-invocation)
- [DEVELOPMENT.md](../../../DEVELOPMENT.md) -- Developer guide with `just copilot` recipe
