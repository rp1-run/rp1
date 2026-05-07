# pr-review

Run an evidence-grounded review for a pull request, branch, or local diff and
produce a verdict with actionable findings.

For the reviewer decision flow, start with the
[PR Review Guide](../../guides/pr-review.md). Use this page for exact command
syntax, output shape, CI behavior, and advanced review mechanics.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-review [target] [base-branch] [skip-visual]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-pr-review [target] [base-branch] [skip-visual]
    ```

=== "Codex"

    ```bash
    $rp1-dev-pr-review [target] [base-branch] [skip-visual]
    ```

## When To Use It

| Use `pr-review` when... | Use something else when... |
|-------------------------|----------------------------|
| You need a merge-readiness verdict. | Reviewers only need an orientation artifact; use [`pr-walkthrough`](pr-walkthrough.md). |
| You want concrete findings tied to code locations. | You only need a diagram; use [`pr-visual`](pr-visual.md). |
| You want to check a PR before or after human review. | Human comments already exist and need fixing; use [`address-pr-feedback`](address-pr-feedback.md). |

!!! warning "Worktree Safety"
    Do not create git worktrees under `.rp1/work/` while running PR reviews.
    Arcade treats `.rp1/work/` as workflow output storage, and nested
    worktrees can make the project file browser confusing. If a separate
    checkout is unavoidable, place it outside `.rp1/`.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `TARGET` | `$1` | No | Current branch | PR number, URL, or branch name |
| `BASE_BRANCH` | `$2` | No | From PR or `main` | Base branch for local branch comparison |
| `SKIP_VISUAL` | `$3` | No | `false` | Set `true` to skip diagram generation |

## Input Resolution

| Input Type | Example | Resolution |
|------------|---------|------------|
| Empty | - | Uses the current branch and associated PR when available |
| PR number | `123` | Fetches PR metadata with `gh` |
| PR URL | `https://github.com/owner/repo/pull/123` | Extracts the PR number and fetches PR metadata |
| Branch name | `feature/auth` | Uses the branch PR when available, otherwise compares against `BASE_BRANCH` |

If rp1 cannot identify the intended PR or diff, it should ask for clarification
or fail before producing a misleading report.

## Read The Result

The report is written under `.rp1/work/pr-reviews/` and appears in Arcade when
the workflow is tracked.

| Section | What to do with it |
|---------|--------------------|
| Intent summary | Confirm rp1 reviewed the change you meant to review. |
| Verdict and rationale | Decide whether to proceed, request changes, or block. |
| Findings by severity | Fix blocking findings first; use lower-severity items as judgment calls. |
| Cross-file issues | Check whether the problem requires a design or ownership decision. |
| Recommendations | Turn follow-ups into tasks, comments, or a rerun checklist. |
| Reviewed PR link | Jump back to the source PR when the target was resolved from GitHub. |

Typical verdicts:

| Judgment | Meaning |
|----------|---------|
| `approve` | No blocking issue was found. Continue through normal team gates. |
| `request_changes` | One or more findings should be fixed before merge. |
| `block` | Critical risk or review uncertainty should stop the merge path. |

## Examples

### Review Current Branch

=== "Claude Code"

    ```bash
    /pr-review
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-pr-review
    ```

=== "Codex"

    ```bash
    $rp1-dev-pr-review
    ```

### Review Specific PR

=== "Claude Code"

    ```bash
    /pr-review 123
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-pr-review 123
    ```

=== "Codex"

    ```bash
    $rp1-dev-pr-review 123
    ```

Example final output:

```text
PR Review Complete

Judgment: request_changes
The PR implements user authentication, but token expiration handling needs to
be fixed before merge.

Findings:
- Critical: 0
- High: 1
- Medium: 3
- Low: 5

Report: .rp1/work/pr-reviews/pr-123-review-001.md
Reviewed PR: https://github.com/owner/repo/pull/123
```

## CI Mode

When running in CI, `pr-review` can review pull requests without interactive
prompts. CI behavior is configured with `.rp1/config/pr-review.yaml` and
environment variables.

| Area | Local mode | CI mode |
|------|------------|---------|
| Target | Current branch, PR number, URL, or branch | Pull request event data |
| Prompts | Can ask for missing context | Must continue or fail without prompts |
| Output | Markdown report and optional visual output | Markdown report, job summary, optional GitHub comments |
| Posting | Manual by default | Controlled by config |

Minimal configuration:

```yaml
enabled: true
verdict: auto
add_comments: true
max_comments: 25
visualize: false
```

Environment overrides:

| Variable | Effect |
|----------|--------|
| `RP1_PR_REVIEW_ENABLED` | Enable or disable review |
| `RP1_PR_REVIEW_VERDICT` | Set verdict mode |
| `RP1_PR_REVIEW_ADD_COMMENTS` | Enable or disable inline comments |
| `RP1_PR_REVIEW_VISUALIZE` | Enable or disable diagrams |

See [PR Review Config Reference](../pr-review-config.md) and
[Remote PR Review Guide](../../guides/remote-pr-review.md) for CI setup.

## Advanced Review Mechanics

Most users only need the verdict and findings. The lower-level mechanics below
matter when you are tuning review behavior, explaining a result, or debugging
CI review output.

### Review Generation

`pr-review` resolves the target, builds an intent model from available PR or
branch context, reviews the changed files, synthesizes findings, and writes a
single report. Large or cross-cutting changes may also get diagrams when
visualization is enabled.

### Finding Confidence

Findings are filtered before they reach the final report.

| Confidence | Action |
|------------|--------|
| 65% and above | Included in the report |
| 40-64% for critical or high-severity concerns | Investigated before inclusion or exclusion |
| Below 40% | Excluded from the report |

If a finding looks surprising, check the evidence in the report and rerun after
updating the PR description, tests, or project context.

### Comment Deduplication In CI

When CI posting is enabled, rp1 checks existing bot comments and human comments
before posting new findings. This keeps repeated runs from adding duplicate
comments for the same issue.

## Related Commands

- [`pr-walkthrough`](pr-walkthrough.md) - Generate a reviewer-orientation artifact from direct PR evidence
- [`pr-visual`](pr-visual.md) - Generate diagrams from a PR or branch diff
- [`address-pr-feedback`](address-pr-feedback.md) - Collect and fix review comments

## See Also

- [PR Review Guide](../../guides/pr-review.md)
- [Remote PR Review Guide](../../guides/remote-pr-review.md)
- [PR Review Config](../pr-review-config.md)
