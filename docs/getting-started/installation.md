# Installation and Host Setup

Install rp1, connect it to your AI coding host, and verify that the host can run
rp1 workflows.

---

## Prerequisites

Before you begin, make sure you have:

- **Git 2.15+**
- **One supported AI coding host**
- **A repository** where you want to use rp1

| Host | Required tool | Workflow syntax | Notes |
|------|---------------|-----------------|-------|
| Claude Code | [Claude Code](https://claude.ai/code) | `/knowledge-build` | Short command names are available. |
| OpenCode | [OpenCode](https://github.com/opencode-ai/opencode) | `/rp1-base-knowledge-build` | rp1 commands keep their `rp1-` prefix. |
| Codex | [Codex CLI](https://github.com/openai/codex) | `$rp1-base-knowledge-build` | Install the Codex integration after `rp1 init`. |
| GitHub Copilot CLI | [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli) | `/rp1-base-knowledge-build` | Requires standalone Copilot CLI with plugin support. |

---

## Step 1: Install the rp1 CLI

=== "macOS"

    ```bash
    brew install rp1-run/tap/rp1
    ```

=== "Linux"

    ```bash
    brew install rp1-run/tap/rp1
    ```

=== "Windows"

    ```bash
    scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
    scoop install rp1
    ```

Alternative install script:

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

Package-manager installs add the rp1 CLI. The standalone install script also
tries to install host integrations unless you set `SKIP_PLUGINS=1`.

Verify the CLI binary is available:

```bash
rp1 --version
```

---

## Step 2: Initialize Your Project

From your repository root:

```bash
cd your-project
rp1 init
```

`rp1 init` prepares the repository for rp1:

- creates the project `.rp1/` directories
- detects supported host tools on your machine
- updates the host instruction file
- configures local rp1 ignore defaults
- installs host integrations where automatic setup is supported
- verifies the result and prints next actions

For non-interactive setup:

```bash
rp1 init --yes
```

### What `init` Does By Host

| Host | Detected by `init` | Instruction file | Integration setup |
|------|---------------------|------------------|-------------------|
| Claude Code | Yes | `CLAUDE.md` | Offered automatically |
| OpenCode | Yes | `AGENTS.md` | Offered automatically |
| GitHub Copilot CLI | Yes | `AGENTS.md` | Offered automatically |
| Codex | Yes | `AGENTS.md` | Run `rp1 install codex` after `init` |

---

## Step 3: Install or Repair a Host Integration

If `init` did not install the host integration, or verification says one host is
missing, run the matching install command:

```bash
rp1 install claude-code
rp1 install opencode
rp1 install codex
rp1 install copilot
```

You can also install into every detected supported host:

```bash
rp1 install
```

Verify a specific host:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

For GitHub Copilot CLI, the clean success signal is `rp1 verify copilot`
reporting `healthy_native`. See the
[Copilot CLI platform guide](../reference/platforms/copilot.md) for Copilot
verification states and recovery steps.

---

## Step 4: Restart the Host Tool

Restart Claude Code, OpenCode, Codex, or GitHub Copilot CLI after installation or
updates so it reloads rp1.

---

## Step 5: Generate Project Context

Generate project context once so rp1 can work against your repository instead of
generic assumptions.

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

=== "Codex"

    ```bash
    $rp1-base-knowledge-build
    ```

=== "GitHub Copilot CLI"

    ```bash
    /rp1-base-knowledge-build
    ```

This creates project context in `.rp1/context/`, which feature, review, and
onboarding workflows use for project-aware work.

---

## Common Follow-Ups

After project context is ready, continue with the workflow that matches your
goal.

| Goal | Claude Code | OpenCode | Codex | GitHub Copilot CLI |
|------|-------------|----------|-------|--------------------|
| Start a feature | `/build my-feature` | `/rp1-dev-build my-feature` | `$rp1-dev-build my-feature` | `/rp1-dev-build my-feature` |
| Make a quick change | `/build-fast "..."` | `/rp1-dev-build-fast "..."` | `$rp1-dev-build-fast "..."` | `/rp1-dev-build-fast "..."` |
| Review a PR | `/pr-review` | `/rp1-dev-pr-review` | `$rp1-dev-pr-review` | `/rp1-dev-pr-review` |
| Onboard a teammate | `/project-birds-eye-view` | `/rp1-base-project-birds-eye-view` | `$rp1-base-project-birds-eye-view` | `/rp1-base-project-birds-eye-view` |

---

## Troubleshooting

| Symptom | Next step |
|---------|-----------|
| `rp1` is not found | Reopen your terminal, then run `rp1 --version`. |
| Host commands do not appear | Restart the host and run the matching `rp1 verify ...` command. |
| Codex does not show rp1 commands | Run `rp1 install codex`, then restart Codex. |
| Copilot verification is not `healthy_native` | Follow [Copilot recovery](../reference/platforms/copilot.md#troubleshooting). |
| First workflow is using stale project details | Re-run the project context command from Step 5. |

More recovery paths are grouped by symptom in
[Troubleshooting](../troubleshooting/index.md).

---

## Next Steps

- [Your First Workflow](first-workflow.md)
- [Team Onboarding](../guides/team-onboarding.md)
- [CLI Reference](../reference/cli/index.md)
