#!/usr/bin/env python3
"""End-to-end orchestrator for publish-artifact.

ONE command runs the whole procedure: resolve the PR/issue target, project the
artifact into a deterministic comment body, find any existing comment for this
artifact, and POST or PATCH it (or, with --dry-run, print what it would do).

Why this exists as a single script: the procedure threads mutable state
(projected body, doc key, action, target comment id, target metadata) across
every step. Run as separate shell snippets, that state cannot survive — each
Bash call is a fresh shell — which forces re-assembly and re-implementation.
Collapsing it here removes that failure mode: the agent runs this once.

The artifact file is read-only on the local side. This script never modifies it.
GitHub is reached only via the `gh` CLI; the pure decision logic is split into
module-level functions so it is unit-tested without touching the network.
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import project  # noqa: E402  (sibling module in scripts/)
import parse_target  # noqa: E402


class Refusal(Exception):
    """A non-destructive, deliberate stop (e.g. foreign comment, duplicates)."""


# --------------------------------------------------------------------------- #
# Pure decision logic (unit-tested in tests/test_publish.py — no network).
# --------------------------------------------------------------------------- #

MARKER_FMT = "<!-- rp1-artifact: {key} -->"
FOOTER_SOFT_MATCH = "Posted by `publish-artifact`"


def find_marker_matches(all_comments, doc_key):
    """Comments whose body opens with this artifact's marker (always line 1)."""
    marker = MARKER_FMT.format(key=doc_key)
    return [c for c in all_comments if c["body"].startswith(marker)]


def soft_detect_orphan(all_comments, me, doc_key):
    """Warn if we previously posted here but the marker for this key is gone.

    Returns a warning string or None. Only meaningful when there are 0 marker
    matches (broken idempotency → a fresh comment will orphan the old one).
    """
    soft = [
        c for c in all_comments
        if FOOTER_SOFT_MATCH in c["body"] and c["user_login"] == me
    ]
    if not soft:
        return None
    return (
        f"WARNING: found {len(soft)} prior publish-artifact comment(s) but no "
        f"marker for doc_key {doc_key}. Idempotency is broken — a new comment will "
        f"be posted, orphaning the old one(s)."
    )


def decide_action(matches, me, force):
    """Map marker matches to (action, target_comment_id) per edge-cases.md.

    0 matches            -> ('POST', None)
    1 match, mine        -> ('PATCH', id)
    1 match, foreign     -> ('PATCH', id) only with force, else Refusal
    >= 2 matches         -> Refusal (manual dedup; --force does NOT override)
    """
    if len(matches) == 0:
        return "POST", None
    if len(matches) == 1:
        only = matches[0]
        if only["user_login"] == me:
            return "PATCH", only["id"]
        if not force:
            raise Refusal(
                f"Comment is owned by @{only['user_login']} ({only['html_url']}). "
                f"Pass --force to overwrite, or coordinate with them."
            )
        return "PATCH", only["id"]
    urls = "\n  ".join(c["html_url"] for c in matches)
    raise Refusal(
        f"Found {len(matches)} comments matching this artifact:\n  {urls}\n"
        f"Delete duplicates manually, then re-run."
    )


def mtime_warning(local_mtime, comment_updated_at, force):
    """Warn (allow) when the local artifact predates the existing comment."""
    if force:
        return None
    comment_ts = datetime.fromisoformat(comment_updated_at.rstrip("Z")).timestamp()
    if local_mtime < comment_ts:
        return (
            "WARNING: local artifact is older than the existing comment. "
            "Continuing — pass --force to suppress this warning."
        )
    return None


def target_line(kind, number, state, base_ref, head_ref):
    """The dry-run diagnostic's Target: line (PR carries base/head)."""
    if kind == "pr":
        return f"#{number} ({state}, base: {base_ref}, head: {head_ref})"
    return f"#{number} ({state}, issue)"


def build_diagnostic(relative_path, doc_key, kind, number, state,
                     base_ref, head_ref, size_bytes, action, matched_url):
    """The stderr diagnostic header for --dry-run (body follows on stdout)."""
    return (
        "=== publish-artifact (dry run) ===\n"
        f"Artifact: {relative_path}\n"
        f"Doc key:  {doc_key}\n"
        f"Target:   {target_line(kind, number, state, base_ref, head_ref)}\n"
        f"Size:     {size_bytes} / {project.MAX_BYTES} bytes\n"
        f"Action:   would {action} (matched comment: {matched_url})\n"
        "\n--- projected comment body ---\n"
    )


def format_success(action, kind, number, fm, doc_key, html_url, size_bytes):
    """The final user-facing confirmation block for a real POST/PATCH."""
    verb = "Posted" if action == "POST" else "Updated"
    where = "PR" if kind == "pr" else "issue"
    atype = fm.get("artifact", "").strip() or fm.get("type", "").strip() or "(untyped)"
    issue = fm.get("issue_id", "").strip() or "—"
    kb = f"{size_bytes / 1024:.1f} KB"
    return (
        f"✓ {verb} rp1 artifact on {where} #{number}\n"
        f"  Artifact: {atype} / {issue} (doc_key {doc_key})\n"
        f"  Comment:  {html_url}\n"
        f"  Size:     {kb} / 65 KB cap"
    )


# --------------------------------------------------------------------------- #
# gh wiring (the only network-touching code).
# --------------------------------------------------------------------------- #

def _gh(args, check=True, input_text=None):
    """Run `gh ...`; return stdout (stripped). Raise on failure when check."""
    proc = subprocess.run(
        ["gh", *args], capture_output=True, text=True, input=input_text
    )
    if check and proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip())
    return proc.stdout.strip()


def _gh_ok(args):
    """Run `gh ...` only for its exit status."""
    return subprocess.run(
        ["gh", *args], capture_output=True, text=True
    ).returncode == 0


def fetch_comments(repo_full, number):
    """All comments on the PR/issue (endpoint is shared), as a list of dicts."""
    out = _gh([
        "api", "-X", "GET", f"repos/{repo_full}/issues/{number}/comments",
        "--paginate",
        "--jq", ".[] | {id: .id, body: .body, user_login: .user.login, "
                "html_url: .html_url, updated_at: .updated_at}",
    ])
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def preflight(path):
    """gh present + authed + artifact exists. Raises SystemExit on failure."""
    from shutil import which
    if which("gh") is None:
        sys.exit("gh CLI not found. Install: https://cli.github.com")
    if not _gh_ok(["auth", "status"]):
        sys.exit("gh is not authenticated. Run: gh auth login")
    if not os.path.isfile(path):
        sys.exit(f"Artifact not found: {os.path.realpath(path)}")


def resolve_target(target, repo_full, force):
    """Return (owner, repo, number, kind, state, base_ref, head_ref).

    Applies the closed/merged -> --force gate. Raises SystemExit on hard stops.
    """
    if not target:
        number = _gh(["pr", "view", "--json", "number", "--jq", ".number"], check=False)
        if not number:
            sys.exit("No open PR for current branch. Push and open a PR, or pass "
                     "an explicit PR/issue number or URL.")
        owner, repo = repo_full.split("/", 1)
        kind = "pr"
        number = int(number)
    else:
        try:
            parsed = parse_target.parse(target, repo_full)
        except ValueError as e:
            sys.exit(str(e))
        owner, repo, number, kind = (
            parsed["owner"], parsed["repo"], parsed["number"], parsed["kind"]
        )

    repo_full = f"{owner}/{repo}"
    if kind == "unknown":
        is_pr = _gh(["api", f"repos/{repo_full}/issues/{number}",
                     "--jq", ".pull_request != null"], check=False)
        kind = "pr" if is_pr == "true" else "issue"

    base_ref = head_ref = ""
    if kind == "pr":
        tsv = _gh(["pr", "view", str(number), "--json",
                   "state,baseRefName,headRefName",
                   "--jq", "[.state,.baseRefName,.headRefName]|@tsv"])
        state, base_ref, head_ref = (tsv.split("\t") + ["", "", ""])[:3]
        if state in ("CLOSED", "MERGED") and not force:
            sys.exit(f"PR #{number} is {state}. Pass --force to comment anyway.")
    else:
        state = _gh(["issue", "view", str(number), "--json", "state",
                     "--jq", ".state"])
        if state == "CLOSED" and not force:
            sys.exit(f"Issue #{number} is CLOSED. Pass --force to comment anyway.")

    return owner, repo, number, kind, state, base_ref, head_ref


def relative_source_path(path):
    """Repo-relative path for the Source-path row and the path: key."""
    root = subprocess.run(
        ["git", "-C", os.path.dirname(os.path.abspath(path)),
         "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    ).stdout.strip()
    ap = os.path.abspath(path)
    if root and ap.startswith(root + os.sep):
        return ap[len(root) + 1:]
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="publish-artifact",
        description="Publish an rp1 artifact as a PR/issue comment (idempotent).",
    )
    ap.add_argument("path", help="path to the rp1 artifact markdown file")
    ap.add_argument("target", nargs="?", default="",
                    help="PR/issue number or GitHub URL (default: current branch's open PR)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the projected body + a diagnostic; never write to GitHub")
    ap.add_argument("--force", action="store_true",
                    help="loosen guard rails (foreign single comment, closed/merged, stale mtime)")
    args = ap.parse_args(argv)

    preflight(args.path)

    case = os.path.realpath(args.path)
    if "/.rp1/work/" not in case + "/":
        print(f"WARNING: {args.path} is outside .rp1/work/. The path-based "
              "idempotency key still works; this is informational.", file=sys.stderr)

    repo_full = _gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])
    owner, repo, number, kind, state, base_ref, head_ref = resolve_target(
        args.target, repo_full, args.force
    )
    repo_full = f"{owner}/{repo}"

    relative_path = relative_source_path(args.path)
    with open(args.path, encoding="utf-8") as f:
        fm, _ = project.split_frontmatter(f.read())
    body, warnings = project.project(args.path, relative_path)
    for w in warnings:
        print(w, file=sys.stderr)
    size_err = project.check_size(body)
    if size_err:
        sys.exit(size_err)
    doc_key = project.marker_key(fm, relative_path)
    size_bytes = len(body.encode("utf-8"))

    all_comments = fetch_comments(repo_full, number)
    matches = find_marker_matches(all_comments, doc_key)
    me = _gh(["api", "user", "--jq", ".login"])

    try:
        action, target_comment_id = decide_action(matches, me, args.force)
    except Refusal as r:
        sys.exit(str(r))

    if action == "POST":
        orphan = soft_detect_orphan(all_comments, me, doc_key)
        if orphan:
            print(orphan, file=sys.stderr)
    elif target_comment_id is not None and matches:
        warn = mtime_warning(os.path.getmtime(args.path),
                             matches[0]["updated_at"], args.force)
        if warn:
            print(warn, file=sys.stderr)

    matched_url = matches[0]["html_url"] if matches else "none"

    if args.dry_run:
        sys.stderr.write(build_diagnostic(
            relative_path, doc_key, kind, number, state,
            base_ref, head_ref, size_bytes, action, matched_url,
        ))
        sys.stdout.write(body)
        sys.stderr.write("--- end body ---\n")
        return 0

    # Real write. `-F body=@-` reads the body from stdin, preserving it
    # literally (no type-inference of true/false/numeric-looking content) and
    # sidestepping argv length limits for large artifacts.
    if action == "POST":
        endpoint = f"repos/{repo_full}/issues/{number}/comments"
        html_url = _gh(["api", "-X", "POST", endpoint, "-F", "body=@-",
                        "--jq", ".html_url"], input_text=body)
    else:
        endpoint = f"repos/{repo_full}/issues/comments/{target_comment_id}"
        html_url = _gh(["api", "-X", "PATCH", endpoint, "-F", "body=@-",
                        "--jq", ".html_url"], input_text=body)

    print(format_success(action, kind, number, fm, doc_key, html_url, size_bytes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
