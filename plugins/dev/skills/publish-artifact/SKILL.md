---
name: publish-artifact
description: "Publish an rp1 artifact (investigation report, design doc, audit) from .rp1/work/ as an idempotent PR or issue comment instead of committing it to the repo; re-runs update the same comment in place."
allowed-tools: Bash(echo *), Bash(rp1 *), Bash(git *), Bash(gh *), Bash(python3 *)
metadata:
  category: review
  is_workflow: false
  version: 1.0.0
  tags:
    - pr
    - review
    - artifact
    - github
  created: 2026-06-01
  updated: 2026-06-01
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

> ### ⚠️ Always `--dry-run` first on a real PR or issue
>
> The skill writes to a real GitHub PR/issue comment by default. Before invoking against a real PR/issue you care about (especially one with active reviewers), always do a dry-run first:
>
> ```
> /rp1-dev:publish-artifact <path> [target] --dry-run
> ```
>
> Dry-run runs every step of the procedure except the GitHub write, prints the projected comment body to stdout and a diagnostic block to stderr (telling you whether the next run would `POST` or `PATCH`), and exits 0. Once the projection looks right, re-run without `--dry-run` to actually post. This is the v1 safety net while the projection logic is stabilizing.

## When to invoke

- User explicitly runs `/rp1-dev:publish-artifact <path> [target]`.
- User has just produced an rp1 artifact and asks how to share it on a PR or issue without committing it.
- User asks to "summarize an rp1 investigation report into a PR or issue comment."

## When NOT to invoke

- The file is not an rp1 work artifact at all (not under `.rp1/work/` and unrelated to rp1). This skill publishes rp1 artifacts; frontmatter is optional, but the file should be an rp1 work product.
- The user wants to keep the artifact in the repo. This skill is for the *don't commit it* case.

## Inputs

| Arg | Required | Default |
|---|---|---|
| `<path>` | yes | — |
| `[target]` | no | current branch's open PR (`gh pr view --json number -q .number`). May be a PR or issue **number**, or a full GitHub PR/issue **URL**. |
| `--dry-run` | no | false (real post). First-time runs on real targets should pass `--dry-run` first. |
| `--force` | no | false. See `references/edge-cases.md`. |

## Procedure

The whole procedure runs as **one command** — `scripts/publish.py`. Set `SKILL_DIR`
to this skill's directory (the folder containing this `SKILL.md`), then invoke:

```bash
python3 "$SKILL_DIR/scripts/publish.py" <path> [target] [--dry-run] [--force]
```

That single process does everything: pre-flight checks → resolve the PR/issue
target → project the comment body → find any existing comment for this artifact →
POST or PATCH (or, under `--dry-run`, print the body + diagnostic and stop).

> **Run the one command. Do not re-implement these steps inline.**
> The procedure threads state across steps — the projected body, the idempotency
> `doc_key`, the chosen `action`, the target comment id, and the target's metadata.
> Separate `Bash` calls each get a fresh shell, so hand-assembling the steps drops
> that state and leads to re-calling the helper scripts with the wrong arguments.
> `publish.py` exists precisely to hold that state in one process. Pass the user's
> args straight through to it; read its output; relay the result.

### What it does, in order (for transparency — not steps to run yourself)

1. **Pre-flight:** `gh` present, `gh auth` ok, artifact file exists. A path outside
   `.rp1/work/` is a warning, not an error (the path-based key still works).
2. **Resolve target:** no `target` → current branch's open PR; a number or URL →
   parsed via `scripts/parse_target.py` (bare numbers are probed for PR-vs-issue).
   Closed/merged PRs and closed issues are gated behind `--force`.
3. **Project body:** `scripts/project.py` turns the artifact into the byte-exact
   comment body and computes `doc_key` (`rp1_doc_id`, else `path:<relative-path>`).
   The split between the visible Executive Summary and the folded "Full artifact"
   is chosen by a deterministic ladder; an author can override it by placing a
   `<!-- rp1:split -->` line in the artifact (invisible when rendered) — content
   before it is the summary, content after it is folded. Over the 65 KB cap →
   hard error.
4. **Find existing comment:** fetch all comments, match the line-1 marker
   `<!-- rp1-artifact: <doc_key> -->`, then apply the decision table — 0 → POST,
   1 mine → PATCH, 1 foreign → refuse (unless `--force`), ≥2 → refuse (always).
5. **Write or preview:** `--dry-run` prints the diagnostic (stderr) + body (stdout)
   and exits 0; otherwise it POSTs/PATCHes via `gh api -F body=@-` and prints a
   confirmation with the comment URL.

### Reading the output

- **Dry-run:** stderr carries the `=== publish-artifact (dry run) ===` block
  (artifact, doc key, target, size, would-POST-or-PATCH); stdout carries only the
  projected body, so `--dry-run | diff expected.md -` works. Relay the diagnostic
  and surface any `WARNING:` lines (summary-ladder rung, orphaned comment, stale
  mtime, path outside `.rp1/work/`).
- **Real run:** the `✓ Posted|Updated …` block names the action, the PR/issue, and
  the comment URL. Relay it verbatim.
- **Non-zero exit:** the script printed the reason to stderr (refusals, size cap,
  auth, no PR for branch). Show it; the artifact and any existing comment are
  untouched.

The per-arg semantics and every guard rail are specified in `references/edge-cases.md`.

## References (read these — they encode the spec)

- `references/artifact-frontmatter.md` — required/optional frontmatter fields, parsing implementation, title derivation rule.
- `references/projection-format.md` — exact comment template and fill-in rules. **The output is byte-deterministic.**
- `references/edge-cases.md` — re-run dedup logic, error table, `--force`/`--dry-run` semantics.

## Fixtures and tests (the contract)

The `examples/*-input.md` ↔ `examples/*-output.md` pairs are byte-exact golden tests
for `scripts/project.py` (run by `tests/test_project.py`). The orchestration decisions
in `scripts/publish.py` — the marker match, POST/PATCH/refuse table, dry-run diagnostic,
soft orphan detection — are unit-tested in `tests/test_publish.py` with `gh` never
called. After any change to the projection or orchestration:

    python3 -m unittest discover -s plugins/dev/skills/publish-artifact/tests

A failing golden test means the projection drifted from the contract — fix the script,
not the fixtures.

## Spec

The contract this skill implements lives in `references/` (artifact frontmatter, projection format, edge cases).
