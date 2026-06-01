#!/usr/bin/env python3
"""Parse a PR/issue target (bare number or GitHub URL) into structured fields.

Pure: no network. A bare number yields kind="unknown" — the caller probes
whether it is a PR or an issue. A URL yields kind from its /pull/ or /issues/ path.
"""
import argparse
import json
import re
import sys

_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/(?P<kind>pull|issues)/(?P<number>\d+)"
)


def parse(target, current_repo):
    """Return {owner, repo, number:int, kind:'pr'|'issue'|'unknown'}.

    current_repo is "owner/repo" for bare-number targets. Raises ValueError on
    unrecognizable input or a bare number with no current_repo.
    """
    m = _URL_RE.match(target.strip())
    if m:
        return {
            "owner": m.group("owner"),
            "repo": m.group("repo"),
            "number": int(m.group("number")),
            "kind": "pr" if m.group("kind") == "pull" else "issue",
        }
    if re.fullmatch(r"\d+", target.strip()):
        if "/" not in current_repo:
            raise ValueError("bare number requires a current repo (owner/repo)")
        owner, repo = current_repo.split("/", 1)
        return {"owner": owner, "repo": repo, "number": int(target), "kind": "unknown"}
    raise ValueError(f"Target must be a PR/issue number or a GitHub URL: {target!r}")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--current-repo", default="", help='"owner/repo" for bare-number targets')
    args = ap.parse_args(argv)
    try:
        print(json.dumps(parse(args.target, args.current_repo)))
        return 0
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
