# Edge Cases Reference

Behavior at every decision point that could be ambiguous, destructive, or non-idempotent.

## Re-run lookup outcomes

After fetching all comments on the PR or issue and grepping for `<!-- rp1-artifact: <doc_id> -->`:

| Matches | Author of match | Behavior |
|---|---|---|
| 0 | n/a | **POST** a new comment. |
| 1 | == authenticated user | **PATCH** existing comment. GitHub's "edited" badge surfaces the change. |
| 1 | != authenticated user | **Refuse unless `force`.** Print: `Comment is owned by @<login>. Pass --force to overwrite, or coordinate with them.` |
| ≥ 2 | any | **Refuse.** Print all matching comment URLs. Tell user to delete duplicates manually. Never auto-pick. |

The current user is resolved via `users.getAuthenticated`.
To get a comment's author: the `user.login` field on each comment object.

## Marker dropped from existing comment

If someone manually edited the canonical comment and removed the `<!-- rp1-artifact: ... -->` line, the lookup finds 0 matches → we POST a new comment. **Print a warning to stderr:**

```
WARNING: idempotency was broken for this artifact (no marker found in existing comments).
A new comment will be posted, leaving the pre-existing comment orphaned.
Consider deleting the old comment manually.
```

The soft-detection heuristic: search for any existing comment by the authenticated user that contains the footer string `Posted by \`publish-artifact\``. If any such comment exists but no marker matched our `doc_id`, the warning fires.

## Error conditions

Principle: **fail loud, never destructive, never silent.** All errors exit non-zero.

| Failure | Detection | Exit message |
|---|---|---|
| Not authenticated / no GitHub token | GitHub API returns 401 | Bubble up the GitHub auth error. Local artifact is unchanged. |
| Path doesn't exist | artifact file stat fails | `Artifact not found: <absolute-path>` |
| Path not under `.rp1/work/` | prefix check on the path | **WARN, continue.** `WARNING: <path> is outside .rp1/work/.` The path-based key still works outside `.rp1/work/`; the warning is informational. |
| Frontmatter or any field absent | n/a | **Not an error.** Frontmatter is optional; absent fields are skipped; the idempotency key falls back to `path:<relative-path>`. |
| Target is an issue (not a PR) | `kind` resolution | **Not an error.** Comments use `/issues/{n}/comments`, valid for both. State checked via `issues.get`. |
| No PR for branch + no target arg | no open PR for the current branch | `No open PR for current branch. Push and open a PR, or pass an explicit PR/issue number or URL.` |
| PR closed or merged | `pulls.get` state | **WARN, allow only with `force`.** `PR #<n> is <state>. Pass --force to comment anyway.` |
| Closed issue | `issues.get` state | **WARN, allow only with `force`.** `Issue #<n> is CLOSED. Pass --force to comment anyway.` |
| Comment body > 65 536 chars | byte length after assembly | `Comment body exceeds GitHub's 65 KB cap (<size> bytes). Multi-comment chunking is not yet supported.` |
| Network / GitHub API error | GitHub API request fails | Bubble up the GitHub error verbatim. Local artifact is unchanged. |
| No recognizable summary section | regex misses all variants | **WARN, fall back to first H2.** `WARNING: no Executive Summary section found; falling back to first H2 ("<heading>").` |
| `status: incomplete` in frontmatter | frontmatter parsing | Publish with the `⚠️ marked incomplete` banner (see projection-format.md). Not an error. |
| Local artifact `mtime` older than existing comment `updated_at` | local mtime vs comment `updated_at` | **WARN, allow.** `WARNING: local artifact is older than the existing comment. Continuing — pass --force to suppress this warning.` |

## --force flag effects

A single flag that loosens three guard rails at once:

1. Overwriting another user's comment (one match, different author).
2. Posting to a closed/merged PR.
3. Suppressing the "local older than comment" warning.

`--force` does **not** loosen:

- Multiple-match refusal (still requires manual dedup)
- (there is no missing-field refusal anymore — frontmatter is optional)
- Body-size cap (65 KB is a GitHub-side limit)

## dry_run flag effects

Resolves the target, reads + parses + projects the artifact, and looks up any existing comment. Stops before any `POST`/`PATCH` (writes nothing to GitHub), then exits 0.

The JSON result carries the projected body in `comment_body` and reports the action the real run *would* take in `action` (`post` or `patch`), with `comment_url` set to `null`. `doc_key`, `size_bytes`, and `warnings` are populated as they would be on a real run, so you can confirm the projection (and diff `comment_body` against an expected file) before posting.

## Path-based idempotency key

When an artifact has no `rp1_doc_id`, the marker is keyed off the repo-relative path
(`<!-- rp1-artifact: path:<relative-path> -->`). Stable across re-runs; the skill never
writes to the artifact. Trade-off: **renaming or moving the artifact orphans its old
comment** (a fresh comment is posted). Delete the stale comment manually if that happens.
