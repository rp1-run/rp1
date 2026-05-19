# Troubleshooting

Find the symptom you are seeing, then follow the shortest recovery path.

---

## Quick Symptom Map

| Symptom | Start here |
|---------|------------|
| `rp1` command is missing | [CLI install problems](#cli-install-problems) |
| Host commands do not appear | [Host integration problems](#host-integration-problems) |
| Codex, Copilot, or Gemini validation behaves differently | [Host-specific recovery](#host-specific-recovery) |
| Gemini reports missing or stale assets, trust, approval, acknowledgement, or headless blockers | [Gemini CLI](#gemini-cli) |
| Agent guesses wrong paths or patterns | [Project context problems](#project-context-problems) |
| A workflow is waiting, stuck, or too broad | [Workflow recovery](#workflow-recovery) |
| Arcade does not show the run or artifact | [Arcade problems](#arcade-problems) |
| PR review or CI automation fails | [PR review and CI problems](#pr-review-and-ci-problems) |

---

## CLI Install Problems

### `rp1` Is Not Found

1. Reopen your terminal.
2. Confirm the binary is on your `PATH`:

    ```bash
    rp1 --version
    ```

3. If the command is still missing, reinstall from
   [Installation and Host Setup](../getting-started/installation.md).

### `rp1 verify` Fails After Install

Run the general verification first:

```bash
rp1 verify
```

Then verify the host you use:

```bash
rp1 verify claude-code
rp1 verify opencode
rp1 verify codex
rp1 verify copilot
```

If one host is missing, reinstall only that host:

```bash
rp1 install claude-code
rp1 install opencode
rp1 install codex
rp1 install copilot
```

Gemini is optional and explicit opt-in. Verify it only when you intentionally
installed or refreshed generated Gemini bundle assets:

```bash
rp1 verify gemini
rp1 verify gemini --workflow <workflow-id>
```

Use a stable host when Gemini reports an unsupported workflow attribution. The
current Gemini support matrix has no supported workflow rows.

---

## Host Integration Problems

### Commands Do Not Appear In The Host

1. Restart the host tool.
2. Run the matching verification command.
3. Reinstall that host integration if verification still fails.

| Host | Verify | Repair |
|------|--------|--------|
| Claude Code | `rp1 verify claude-code` | `rp1 install claude-code` |
| OpenCode | `rp1 verify opencode` | `rp1 install opencode` |
| Codex | `rp1 verify codex` | `rp1 install codex` |
| GitHub Copilot CLI | `rp1 verify copilot` | `rp1 install copilot` |

### Correct Workflow Syntax By Host

| Goal | Claude Code | OpenCode | Codex | GitHub Copilot CLI |
|------|-------------|----------|-------|--------------------|
| Generate project context | `/knowledge-build` | `/rp1-base-knowledge-build` | `$rp1-base-knowledge-build` | `/rp1-base-knowledge-build` |
| Start a feature | `/build my-feature` | `/rp1-dev-build my-feature` | `$rp1-dev-build my-feature` | `/rp1-dev-build my-feature` |
| Quick task | `/build-fast "..."` | `/rp1-dev-build-fast "..."` | `$rp1-dev-build-fast "..."` | `/rp1-dev-build-fast "..."` |
| Review a PR | `/pr-review` | `/rp1-dev-pr-review` | `$rp1-dev-pr-review` | `/rp1-dev-pr-review` |

---

## Host-Specific Recovery

### Claude Code

If commands are missing after install:

1. Restart Claude Code.
2. Run `rp1 verify claude-code`.
3. Reinstall with `rp1 install claude-code` if verification reports missing
   plugins.

### OpenCode

OpenCode uses prefixed rp1 command names. Try `/skills` if you do not remember
the exact command name, then look for commands beginning with `rp1-`.

If commands are missing:

1. Restart OpenCode.
2. Run `rp1 verify opencode`.
3. Reinstall with `rp1 install opencode`.

### Codex

Codex is detected by `rp1 init`, but the Codex integration is installed with a
separate command.

If Codex does not show rp1 workflows:

1. Run `rp1 install codex`.
2. Restart Codex.
3. Run `rp1 verify codex`.
4. Use `$rp1-...` command syntax.

### GitHub Copilot CLI

For Copilot, the target verification result is `healthy_native`.

| Verification state | Meaning | Recovery |
|--------------------|---------|----------|
| `partial_native` | Copilot sees only part of rp1. | Run `rp1 install copilot`, then verify again. |
| `legacy_only` | Only an old unsupported install was found. | Remove the legacy paths printed by verification, then reinstall. |
| `mixed_native_and_legacy` | The current install works, but old files remain. | Remove only the legacy paths printed by verification. |
| `not_installed` | rp1 is not installed for Copilot. | Run `rp1 install copilot`. |

See the [Copilot CLI platform guide](../reference/platforms/copilot.md) for the
full Copilot setup and recovery path.

### Gemini CLI

Gemini CLI is an opt-in generated bundle target. It is not part of the default
stable-host setup path, and Gemini limitations do not downgrade Claude Code,
OpenCode, Codex, or GitHub Copilot CLI support.

| Symptom | Recovery |
|---------|----------|
| Gemini CLI is missing | Install Gemini CLI only if you intend to use Gemini assets, then run `gemini --version`. |
| Generated bundle assets are missing, partial, or stale | Run `rp1 install gemini` or `rp1 update plugins gemini`, restart Gemini CLI, then verify again. |
| Gemini asks to trust the workspace | Trust the intended repository interactively, or rerun the workflow on a stable host. |
| Gemini asks for tool approval | Approve the action interactively when appropriate; do not assume unattended resume. |
| Gemini reports new agents | Acknowledge and enable the agent, then rerun the validation command. |
| Headless validation stops | Rerun interactively or keep the row `unsupported` in the support matrix. |

See the [Gemini CLI platform guide](../reference/platforms/gemini.md) for the
support matrix, workflow attribution, and lifecycle recovery details.

---

## Project Context Problems

### Agent Guesses Wrong Paths Or Patterns

This usually means project context is stale, incomplete, or was not generated
for the current checkout.

1. Rebuild project context:

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

2. Confirm `.rp1/context/index.md`, `.rp1/context/modules.md`, and `.rp1/context/patterns.md` exist.
3. Re-run the workflow after context is refreshed.

### Project Context Is Stale

Rebuild context after:

- large refactors
- new major modules
- framework or tooling changes
- changes to project conventions

If a teammate is onboarding, generate a fresh project overview after the context
refresh. See [Team Onboarding](../guides/team-onboarding.md).

### Context Build Takes Too Long

First-time context generation can be slow on large repositories. If it is too
slow to finish:

1. Run it when you can leave the host working.
2. Exclude generated, vendored, or build-output directories from project-level
   instructions.
3. Break the repository into smaller documented areas if the project is a very
   large monorepo.

---

## Workflow Recovery

### A Workflow Is Waiting For You

Open Arcade and check the run:

```bash
rp1 arcade
```

Waiting states usually mean the workflow needs a decision, approval, missing
input, or manual verification. Answer the prompt in the host, then continue the
workflow from the same conversation when possible.

### A Workflow Is Stuck Or Repeating Work

Use a smaller and more concrete request:

- name the exact file, PR, feature, or failure
- provide the success condition
- ask for analysis before edits if the cause is unclear
- stop after the narrow fix if you do not want follow-up refactoring

For feature work, the [Feature Development](../guides/feature-development.md)
guide explains the requirements, planning, implementation, and release journey.

### A Workflow Used The Wrong Scope

Start over with explicit boundaries:

```text
Only change docs/guides/team-onboarding.md.
Do not edit runtime code.
The task is complete when links resolve and the page explains first-day onboarding.
```

---

## Arcade Problems

### Arcade Does Not Open

Run:

```bash
rp1 arcade
```

If the browser does not open automatically, use the URL printed by the command.
If Arcade was already running, `rp1 arcade` reuses it.

### A Run Does Not Appear

1. Confirm the workflow you ran is a tracked workflow.
2. Refresh Arcade.
3. Check that you initialized the project with `rp1 init`.
4. Start a new tracked workflow from the project root.

Project context generation is maintenance work and may not appear as a normal
tracked run.

### Artifacts Or Links Look Missing

Open the run detail in Arcade and check the artifact list. File artifacts open
inside Arcade; external links open in the target service.

If an annotation appears orphaned, the source text likely changed after the
comment was created. Use the annotation context to decide whether to resolve it
or recreate it on the current text.

See [Arcade Overview](../arcade/index.md),
[Artifact Viewer](../arcade/artifact-viewer.md), and
[Annotations](../arcade/annotations.md).

---

## PR Review And CI Problems

### Local PR Review Cannot Continue

Common causes:

- the branch has uncommitted changes
- the PR base is unclear
- required PR metadata is missing
- CI evidence is unavailable

Run the review again after the local branch is in the state you want reviewed,
or provide the PR URL explicitly.

See [PR Review](../guides/pr-review.md).

### Remote PR Review Or CI Automation Fails

Use the CI guide for setup and environment requirements:

- [CI/CD Integration](../guides/ci-cd-integration.md)
- [Remote PR Review](../guides/remote-pr-review.md)
- [PR Review Config](../reference/pr-review-config.md)

If automation cannot prompt, make required values explicit in the job
configuration.

---

## Getting Help

When reporting an issue, include:

1. rp1 version: `rp1 --version`
2. Host tool and version
3. Operating system
4. The exact command you ran
5. The verification command output for the affected host
6. A short description of expected versus actual behavior

## Related

- [Installation and Host Setup](../getting-started/installation.md)
- [init Reference](../reference/cli/init.md)
- [install Reference](../reference/cli/install.md)
- [Copilot CLI Platform Guide](../reference/platforms/copilot.md)
- [Gemini CLI Platform Guide](../reference/platforms/gemini.md)
- [Team Onboarding](../guides/team-onboarding.md)
