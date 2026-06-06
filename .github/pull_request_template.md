## Intent

<!-- What problem does this PR solve? Who benefits? -->

## Scope

<!-- What changed? What is intentionally out of scope? -->

## PR Title

<!--
Your PR title MUST follow Conventional Commits format:

  <type>(<scope>): <description>
  <type>: <description>

Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, security
Scopes are optional and unrestricted.

Examples:
  feat(cli): add interactive mode
  fix(web-ui): resolve fullscreen diagram issue
  docs: update installation guide
  security: tighten sandbox path validation

This is enforced by CI and the PR title becomes the squashed commit message.
-->

## Author Checklist

- [ ] The PR title follows Conventional Commits and matches the squash commit intent.
- [ ] The PR has a focused scope and does not bundle unrelated cleanup.
- [ ] I explained user impact, maintainer impact, or the concrete bug being fixed.
- [ ] I called out tradeoffs, follow-ups, and any behavior I intentionally did not change.
- [ ] I updated docs when user-facing behavior, commands, configuration, or workflows changed.
- [ ] I refreshed generated catalog/build artifacts when the change affects skill, agent, or platform output.
- [ ] I did not commit `.rp1/work/` artifacts unless a maintainer explicitly asked for generated evidence.
- [ ] I listed every validation command I ran below, or explained why a relevant command was not run.

## Change-Type Validation

Check the rows that apply and include command output summaries in Test Plan.

- [ ] Code changes: relevant `just check` and `just test` path completed.
- [ ] CLI/runtime changes: `just check-cli` and relevant `just test-cli` or targeted Bun tests completed.
- [ ] Native app changes: `just check-native-app` and `just test-native-app` completed.
- [ ] Web UI or Arcade behavior: `just check-web-ui` completed, and browser/smoke/manual validation is described.
- [ ] Skill, agent, prompt, or platform build changes: `just build-plugins-check` completed.
- [ ] Skill or catalog-visible changes: `just catalog-check` completed, or generated catalog updates are included.
- [ ] Eval or attestation changes: relevant eval command and `just eval-verify` completed, or the missing attestation is explained.
- [ ] Lockfile changes: `just check-no-artifactory` completed.
- [ ] Docs/navigation/rendering changes: docs were previewed or built, and screenshots/notes are included when useful.

## Skill/Agent Contract Checklist

Complete this section when changing `plugins/**`, generated skill docs, or agent prompts.

- [ ] Namespace prefixes follow the rp1 rules.
- [ ] Parameterized skills use `metadata.arguments`; agents use top-level `arguments`.
- [ ] I did not add manual `argument-hint` strings or hand-written Parameters tables where generated sections apply.
- [ ] Artifact registration includes explicit `storageRoot` and correct relative paths.
- [ ] State-machine step names match emitted `--step` values.
- [ ] Sub-agent emitted steps are namespaced where needed.
- [ ] Producer agents load canonical artifact templates rather than embedding output formats inline.
- [ ] Cross-plugin calls respect the base/dev dependency boundary.

## Test Plan

<!-- Commands run, results, and targeted manual verification. -->

## Manual Verification / Known Risk

<!-- Anything CI cannot prove yet. Say whether you think it blocks merge. -->

## Related Issues

<!-- Fixes #123, Closes #456, or N/A. -->
