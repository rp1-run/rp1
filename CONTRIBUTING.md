# Contributing to rp1

rp1 is a Bun/TypeScript CLI and plugin monorepo for professional development workflows across AI coding assistants. Contributions should preserve durable artifacts, workflow state, project context, and cross-host portability across Claude Code, OpenCode, Codex CLI, GitHub Copilot CLI, and Antigravity CLI.

## Project Objective

rp1 turns repeatable engineering workflows into structured, project-aware, artifact-backed commands. The repository includes the CLI runtime, agent-tools, install/build pipelines, Arcade UI, public docs, plugin prompts, and prompt evaluation machinery.

Good contributions make those workflows clearer, safer, easier to validate, or easier to operate without weakening the contracts that let runs be resumed, audited, reviewed, and ported between host tools.

## Appreciated PRs

- User-facing workflow improvements for feature delivery, bug investigation, code quality, PR review, docs, knowledge generation, planning, strategy, security, and prompt authoring.
- CLI/runtime improvements for command behavior, `agent-tools`, workflow bootstrap, emit/state machines, install/verify, catalog, distribution, and single-executable packaging.
- Arcade and documentation improvements that help users monitor runs, inspect artifacts, annotate feedback, review PRs, onboard teams, or troubleshoot.
- Prompt, skill, and agent changes that follow the repository authoring contracts.
- Focused fixes with a clear user or maintainer problem and a narrow validation story.

## Poor-Fit PRs

- Broad rewrites without a concrete user problem.
- New abstractions that do not remove real complexity or match existing patterns.
- Changes that make one host work while regressing cross-host behavior.
- Public docs that expose internal runtime vocabulary as normal onboarding.
- Prompt or skill changes that duplicate generated boilerplate.
- Tests that lock in implementation details rather than behavior.
- Large unrelated changes bundled into one PR.
- Committing `.rp1/work/` output by default.

## Repo Map

- `cli/`: CLI commands, agent-tools, build/install/init flows, shared libraries, web UI server, and frontend.
- `plugins/base/`: knowledge, docs, research, strategy, security, shared templates, and base workflow assets.
- `plugins/dev/`: build workflows, code quality, PR management, and feature delivery.
- `plugins/utils/`: prompt-authoring, tersification, and eval helpers.
- `docs/`: public documentation site and reference material.
- `evals/`: prompt evaluation suites, assertions, fixtures, and attestation support.
- `native-app/`: native app experiments and packaging.

## Local Setup

Install Bun and Just before working in the repo. After cloning, run:

```bash
just setup-git
```

That command aligns clone-local line ending behavior with `.gitattributes`, which is especially important on Windows.

Lefthook is optional but recommended:

```bash
brew install lefthook
lefthook install
```

or:

```bash
npm install -g @evilmartians/lefthook
lefthook install
```

The hooks are not a full CI mirror. The pre-push hook blocks pushes targeting `main` or `master`, runs CLI and web UI typechecks, checks the catalog, performs an advisory eval attestation check, and checks lockfiles for private registry references.

## Validation Matrix

Use the smallest validation set that proves the changed behavior or contract.

| Change area | Expected local validation | Notes |
|-------------|---------------------------|-------|
| General code | `just check`, `just test` | Mirrors broad CI intent. |
| CLI | `just check-cli`, plus `just test-cli` or targeted `bun test` | Include targeted tests for changed command or tool behavior. |
| Web UI / Arcade | `just check-web-ui`; add `just test-web-ui-smoke` when runtime behavior changed | Include browser or manual evidence for visible UI changes. |
| Native app | `just check-native-app`, `just test-native-app` | Manual macOS launch checks may be needed for shell behavior. |
| Plugins, prompts, platform builds | `just build-plugins-check` | Validates supported platform prompt builds. |
| Catalog-visible skill or agent metadata | `just catalog-check`, or `just catalog-generate` with checked-in generated changes when intended | Avoid stale discovery docs. |
| Evals or prompt attestations | Relevant eval command, `just eval-attest <output-file>`, and `just eval-verify` | If attestation is missing, explain why. |
| Lockfiles | `just check-no-artifactory` | Prevents private registry leakage. |
| Docs/navigation/rendering | Docs preview or build path | Add screenshots or notes when visual rendering matters. |

## Skill And Agent Authoring Contract

Follow the repo-local `AGENTS.md` rules when changing `plugins/**`, generated skill docs, or agent prompts:

- Use namespace prefixes exactly: `/rp1-base:skill-name`, `/rp1-dev:skill-name`, `/rp1-utils:skill-name`.
- Reference agents as `subagent_type: rp1-base:agent-name` for Claude Code and `subagent_type: @rp1-dev/agent-name` for OpenCode.
- Parameterized skills define `metadata.arguments`; agents define top-level `arguments`.
- Do not write manual `argument-hint` strings or hand-written `## Parameters` tables where generated sections apply.
- Do not hand-write the generated `## 0. Resolve Arguments` section for skills.
- Do not declare removed directory environment variables such as `RP1_PROJECT_ROOT`, `RP1_KB_ROOT`, or `RP1_WORK_ROOT`.
- Discover directories with `rp1 agent-tools rp1-root-dir` when needed.
- Use relative paths from the project root in prompts.
- Register artifacts with explicit `storageRoot` and the correct relative path base.
- Add `allowed-tools` to skills that execute shell commands; do not add it to agent files.
- Producer agents load canonical artifact templates from `rp1-base:artifact-templates` instead of embedding full output formats inline.
- State-machine IDs must match emitted `--step` values.
- Sub-agent emitted steps use `{agent-name}:` prefixes when reporting into a parent run.
- Dev workflows may depend on base; base agents must not call dev commands.

## PR Expectations

Use the [PR template](.github/pull_request_template.md). It asks for intent, scope, validation, known risk, and related issues.

PR titles must follow Conventional Commits. CI accepts these types:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `chore`
- `revert`
- `security`

Scopes are optional and unrestricted. Use a scope when it helps the reviewer understand the affected area, such as `cli`, `web-ui`, `docs`, `dev`, `base`, `utils`, `deps`, or `tests`.

Before opening a PR:

- Keep the PR focused; split unrelated cleanup.
- Explain the user impact, maintainer impact, or concrete bug being fixed.
- Update docs when user-facing behavior, commands, configuration, or workflows change.
- Refresh generated catalog/build artifacts when skill, agent, or platform output changes.
- Do not commit `.rp1/work/` artifacts unless a maintainer asks for generated evidence.
- List every validation command you ran and summarize the result.
- Call out manual verification gaps, accepted risk, and follow-up work.

## Maintainer Merge Assessment

This section is maintainer guidance, not an author checklist.

- The PR solves a problem that belongs in rp1 now.
- The description gives enough intent for human review and rp1 PR review.
- The implementation follows existing Bun, TypeScript, fp-ts, filesystem, artifact, and workflow-state patterns.
- Tests are high-value and protect user-visible behavior or important contracts.
- CI is green, or every failing check is understood and accepted.
- Any critical or high rp1 PR review finding is fixed or explicitly accepted by a maintainer.
- Manual verification items are completed, non-blocking, or tracked as follow-up work.
- Docs are updated where user-facing behavior changed.
- Generated catalogs, platform artifacts, or attestations are updated when relevant.
- The PR is small enough to review, or it has a walkthrough, diagram, or split plan.
- The merge title has the intended release-please effect.

## Maintainer Release Notes

Releases are managed by release-please with manual approval gates. Maintainers should merge release PRs only after reviewing the generated changelog and artifact implications.

After validating and promoting a beta to stable, maintainers should clean up stale beta surfaces:

1. Archive or remove the GitHub pre-release tagged `v*.*.*-beta.*`.
2. Reset or remove the beta cask in `rp1-run/homebrew-tap`.
3. Notify beta testers to return to the stable install path:

```bash
brew uninstall rp1-beta && brew install rp1-run/tap/rp1
```

The `just beta-release` recipe prints the beta cleanup checklist after a successful beta publish.

## More Documentation

See [rp1.run](https://rp1.run) for public guides and reference documentation. Open a GitHub issue or discussion when a contribution needs design discussion before implementation.
