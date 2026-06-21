# publish-artifact

Publish an rp1 artifact as an idempotent PR or issue comment instead of committing it to the repo.

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:publish-artifact <artifact-path> [target] [--dry-run] [--force]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-publish-artifact <artifact-path> [target] [--dry-run] [--force]
    ```

=== "Codex"

    ```bash
    $rp1-dev-publish-artifact <artifact-path> [target] [--dry-run] [--force]
    ```

## Description

The `publish-artifact` command takes an rp1 work artifact -- an investigation
report, design doc, audit, or similar markdown under `.rp1/work/` -- and posts a
projected summary of it as a comment on a GitHub PR or issue. Use it when you
want to share an artifact's findings on a PR or issue **without committing the
artifact file to the repo**.

The command is **idempotent**: each artifact carries a hidden marker, so
re-running updates the same comment in place rather than posting a duplicate.
The artifact file itself is never modified -- it is read-only on the local side
and write-only on the GitHub side.

It talks to the GitHub API directly and never shells out to the `gh` CLI. The
owner/repo is derived from the git `origin` remote, and an omitted target
resolves to the current branch's open PR.

!!! warning "Always dry-run first on a real PR or issue"
    The command writes to a real GitHub comment by default. Before publishing to
    a PR or issue you care about -- especially one with active reviewers -- run
    with `--dry-run` first. A dry-run performs every step except the GitHub
    write, returns the projected comment body plus the action (`post` or
    `patch`) the real run would take, and writes nothing.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact-path` | string | Yes | Path to the rp1 artifact markdown file to publish. A path outside `.rp1/work/` is allowed but returns a warning. |
| `target` | string | No | PR or issue number, or a full GitHub PR/issue URL. Defaults to the current branch's open PR. |
| `--dry-run` | flag | No | Project and return the comment body without writing to GitHub. |
| `--force` | flag | No | Override safety gates (closed/merged target, or a comment owned by another author). Does **not** bypass multiple-match refusals. |

## Output

On success the command reports:

- **`action`** -- `post` (a new comment was created) or `patch` (an existing
  comment was updated in place). On a dry-run, the action the real run *would*
  take.
- **`comment_url`** -- link to the created or updated comment (`null` on a
  dry-run).
- **`doc_key`** -- the idempotency marker key used to find an existing comment.
- **`size_bytes`** -- projected comment size. GitHub's 65 KB comment cap is
  enforced as a hard error.
- **`warnings`** -- advisory notes (summary-ladder rung, an orphaned prior
  comment, a stale local file timestamp, a path outside `.rp1/work/`). Warnings
  are surfaced but do not stop the publish.
- **`comment_body`** -- on a dry-run only, the full projected body to review
  before a real post.

## Recovery

The command refuses (and exits without writing) when it cannot proceed safely.
The reason is shown verbatim and both the artifact and any existing comment are
left untouched:

| Refusal | Recovery |
|---------|----------|
| Comment owned by another author | Re-run with `--force` if you intend to overwrite it. |
| Multiple comments match the artifact | Manually remove the duplicates; `--force` does not bypass this. |
| Target PR/issue is closed or merged | Re-run with `--force` if you still want to comment. |
| No open PR for the current branch | Pass an explicit `target` (number or URL). |
| Projected body exceeds the 65 KB cap | Trim the artifact or split it before publishing. |

## Examples

### Publish to the current branch's PR

=== "Claude Code"

    ```bash
    /rp1-dev:publish-artifact .rp1/work/features/my-feature/investigation_report_1.md
    ```

### Preview before posting

=== "Claude Code"

    ```bash
    /rp1-dev:publish-artifact .rp1/work/features/my-feature/design.md 397 --dry-run
    ```

### Publish to a specific issue by URL

=== "Claude Code"

    ```bash
    /rp1-dev:publish-artifact .rp1/work/audits/security_audit_1.md https://github.com/owner/repo/issues/42
    ```
