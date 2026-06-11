---
name: publish-artifact
description: "Publish an rp1 artifact (investigation report, design doc, audit) from .rp1/work/ as an idempotent PR or issue comment instead of committing it to the repo; re-runs update the same comment in place."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: review
  is_workflow: false
  version: 2.0.0
  tags:
    - pr
    - review
    - artifact
    - github
  created: 2026-06-01
  updated: 2026-06-11
  author: cloud-on-prem/rp1
  arguments:
    - name: ARTIFACT_PATH
      type: string
      required: true
      description: "Path to the rp1 artifact markdown file to publish"
    - name: TARGET
      type: string
      required: false
      description: "PR or issue number, or full GitHub PR/issue URL (default: current branch's open PR)"
    - name: DRY_RUN
      type: boolean
      required: false
      default: false
      description: "Project and print the comment body without writing to GitHub"
      aliases:
        - "dry-run"
        - "dry run"
        - "preview"
    - name: FORCE
      type: boolean
      required: false
      default: false
      description: "Override safety gates (closed/merged targets, foreign-author comment)"
      aliases:
        - "force"
---

# Publish Artifact

Publish an rp1 artifact (markdown under `.rp1/work/`; frontmatter optional) as a PR or issue comment without committing the artifact file to the repo. Re-running updates the same comment in place.

**The artifact file is never modified by this skill** — it is read-only on the local side, write-only on the GitHub side.

> ### ⚠️ Always dry-run first on a real PR or issue
>
> The skill writes to a real GitHub PR/issue comment by default. Before publishing to a PR/issue you care about (especially one with active reviewers), run with `"dry_run": true` first. A dry-run runs every step except the GitHub write, returns the projected `comment_body` plus the `action` (`post` or `patch`) the real run would take, and writes nothing. Once the projection looks right, re-run without `dry_run` to post.

## When to invoke

- User explicitly runs `/rp1-dev:publish-artifact <path> [target]`.
- User has just produced an rp1 artifact and asks how to share it on a PR or issue without committing it.
- User asks to "summarize an rp1 investigation report into a PR or issue comment."

## When NOT to invoke

- The file is not an rp1 work artifact at all (not under `.rp1/work/` and unrelated to rp1). This skill publishes rp1 artifacts; frontmatter is optional, but the file should be an rp1 work product.
- The user wants to keep the artifact in the repo. This skill is for the *don't commit it* case.

## Gather the inputs

| Field | Required | How to determine |
|---|---|---|
| `artifact_path` | yes | The path to the artifact markdown the user wants to publish. A path outside `.rp1/work/` is allowed (a warning is returned). |
| `target` | no | A PR/issue **number** or full GitHub PR/issue **URL** the user named. Omit it to default to the current branch's open PR. |
| `dry_run` | no | `true` when the user wants a preview, or on a first publish to a real target. Defaults to `false` (real post). |
| `force` | no | `true` only when the user explicitly wants to override a safety gate (closed/merged target, or a comment owned by another author). Defaults to `false`. See `references/edge-cases.md`. |

## Procedure

The whole procedure runs as **one command** — the `github-pr publish-comment` agent-tool. Pipe a single JSON object on stdin and read the JSON result on stdout:

```bash
echo '{"artifact_path": "<path>", "target": "<pr-or-issue>", "dry_run": false, "force": false}' \
  | rp1 agent-tools github-pr publish-comment
```

Include only the fields you have: `artifact_path` is required; omit `target`, `dry_run`, and `force` when they are unset rather than guessing values.

That single process does everything: derive owner/repo from the git origin remote → resolve the PR/issue target → project the comment body → find any existing comment for this artifact via its marker → POST or PATCH (or, under `dry_run`, return the projected body and the action it *would* take, writing nothing). It calls the GitHub API directly; it never shells out to `gh` and never modifies the artifact file.

> **Run the one command. Do not re-implement these steps inline or call `git`/`gh` yourself.**
> The procedure threads state across steps — the projected body, the idempotency
> `doc_key`, the chosen `action`, and the target comment id. The agent-tool holds
> that state in one process. Pass the user's inputs straight through, read the JSON
> output, and relay the result.

## Reading the output

The command returns a JSON object:

```json
{
  "action": "post" | "patch",
  "comment_url": "https://github.com/...#issuecomment-...",
  "doc_key": "<rp1_doc_id or path:<relative-path>>",
  "size_bytes": 1234,
  "warnings": ["..."],
  "dry_run": false,
  "comment_body": "<projected body — present only on dry_run>"
}
```

- **`action`** — `post` (new comment created) or `patch` (existing comment updated in place). On a dry-run this is the action the real run *would* take.
- **`comment_url`** — link to the created/updated comment; `null` on a dry-run.
- **`doc_key`** — the idempotency marker key (`rp1_doc_id` when present, else `path:<relative-path>`).
- **`size_bytes`** — projected comment body size; the GitHub 65 KB cap is enforced as a hard error.
- **`warnings`** — surface every entry to the user. These are advisory (summary-ladder rung, orphaned prior comment, stale local mtime, path outside `.rp1/work/`), not failures.
- **`comment_body`** — on a dry-run only, the full projected body. Show it (or diff it) so the user can confirm before a real post.

**On success:** relay the `action`, the `comment_url`, and any `warnings`.

**On a refusal or error:** the command exits non-zero and prints the reason (foreign-owned comment without `force`, multiple matching comments, size cap, no PR for the current branch, closed/merged target without `force`, auth/network error). Show the reason verbatim. The artifact and any existing comment are left untouched. For foreign-owned or closed/merged cases, the user can re-run with `"force": true` if they intend to override; multiple-match refusals require manual dedup and `force` does **not** bypass them.

## References (read these — they encode the spec)

- `references/artifact-frontmatter.md` — required/optional frontmatter fields, parsing rules, title derivation rule.
- `references/projection-format.md` — exact comment template and fill-in rules. **The output is byte-deterministic.**
- `references/edge-cases.md` — re-run dedup logic, error table, `force`/`dry_run` semantics.
