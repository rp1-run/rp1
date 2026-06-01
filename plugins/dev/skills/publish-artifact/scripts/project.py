#!/usr/bin/env python3
"""Project an rp1 artifact into a deterministic PR/issue comment body.

Pure and network-free: given an artifact file and the repo-relative source path
to display, emit the exact comment body on stdout. Warnings go to stderr.
This module never calls GitHub and never modifies the artifact.
"""
import argparse
import os
import re
import sys

MAX_BYTES = 65536

# A frontmatter key line: starts at column 0, identifier-ish key, then ": ".
# Indented continuation lines (multi-line quoted values) never match, so a colon
# inside a wrapped value cannot create a bogus key.
_KEY_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$")


def split_frontmatter(text):
    """Return (fm_dict, body). The frontmatter block is OPTIONAL.

    If the text does not open with a '---' block, fm is {} and body is the whole
    text. Values keep their first-line content; surrounding quotes are stripped.
    """
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        km = _KEY_RE.match(line)
        if not km:
            continue
        key, val = km.group(1).strip(), km.group(2).strip()
        if val and val[0] in "\"'":
            if len(val) >= 2 and val[-1] == val[0]:
                val = val[1:-1]   # both quotes on same line → strip both
            else:
                val = val[1:]     # only leading quote (multi-line value) → strip just the opener
        fm[key] = val
    return fm, m.group(2)


def _title_case(slug):
    words = slug.replace("_", "-").split("-")
    return " ".join(w.capitalize() for w in words if w)


def _first_h1(body):
    m = re.search(r"^#\s+(.+?)\s*$", body, re.MULTILINE)
    return m.group(1) if m else None


def derive_title(fm, body, artifact_path):
    """Title precedence: artifact field -> first H1 -> producer -> filename stem."""
    art = fm.get("artifact", "").strip()
    if art:
        title = _title_case(art)
        issue = fm.get("issue_id", "").strip()
        return f"{title} — {issue}" if issue else title  # em-dash U+2014
    h1 = _first_h1(body)
    if h1:
        return h1
    prod = fm.get("producer", "").strip()
    if prod:
        return _title_case(prod)
    stem = os.path.splitext(os.path.basename(artifact_path))[0]
    return _title_case(stem)


def strip_leading_h1(body):
    """Drop a single leading '# ...' line (and the blank lines around it)."""
    b = body.lstrip("\n")
    if b.startswith("# "):
        nl = b.find("\n")
        b = b[nl + 1:] if nl != -1 else ""
    return b.lstrip("\n")


# An author-placed split marker on its own line. Case-sensitive token; any
# surrounding whitespace (and internal spacing inside the comment) is tolerated.
# An inline marker (mid-paragraph) never matches — the whole line must be the marker.
SPLIT_RE = re.compile(r"^[ \t]*<!--[ \t]*rp1:split[ \t]*-->[ \t]*$", re.MULTILINE)

SUMMARY_RE = re.compile(
    r"^##\s+(?:\d+\.\s+)?(Executive Summary|Summary|Overview|TL;DR)\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def _norm(s):
    """Normalize a slice to: stripped of edge blank lines, ending in one newline."""
    s = s.lstrip("\n").rstrip()
    return s + "\n" if s else ""


def _section_after(body, heading_match):
    """Section shape: content after a heading line up to the next '## '."""
    start = heading_match.end() + 1  # skip the newline after the heading line
    nxt = re.search(r"^## ", body[start:], re.MULTILINE)
    end = start + nxt.start() if nxt else len(body)
    summary = _norm(body[start:end])
    rest = _norm(body[end:]) if end < len(body) else ""
    return summary, rest


def _lead_split(body, idx):
    """Lead shape: content before idx is the summary, idx onward is the rest."""
    summary = _norm(body[:idx])
    rest = _norm(body[idx:])
    return summary, rest


def extract_summary(body):
    """Deterministic ladder. Returns ((summary, rest), warning_or_None).

    rung 0 is an explicit author-placed `<!-- rp1:split -->` marker: content
    before it is the summary, content after it is the rest, and the marker line
    itself is dropped. It overrides every heuristic rung below (including a named
    Executive Summary heading) because it is the author's stated intent.
    """
    m = SPLIT_RE.search(body)
    if m:  # rung 0 — explicit split marker
        summary = _norm(body[:m.start()])
        rest = _norm(body[m.end():])
        warn = None if summary else (
            "WARNING: <!-- rp1:split --> marker found but no content precedes it; "
            "the Executive Summary will be empty."
        )
        return (summary, rest), warn
    m = SUMMARY_RE.search(body)
    if m:  # rung 1
        return _section_after(body, m), None
    m = re.search(r"^## .*$", body, re.MULTILINE)
    if m:  # rung 2
        heading = m.group(0)[3:].strip()
        return _section_after(body, m), (
            f'WARNING: no Executive Summary section found; falling back to first H2 ("{heading}").'
        )
    m = re.search(r"^#{3,6}\s", body, re.MULTILINE)
    if m:  # rung 3
        return _lead_split(body, m.start()), "WARNING: no H2 found; splitting before first subheading (rung 3)."
    m = re.search(r"^(?:---|\*\*\*|___)\s*$", body, re.MULTILINE)
    if m:  # rung 4
        return _lead_split(body, m.start()), "WARNING: no headings found; splitting at first thematic break (rung 4)."
    m = re.search(r"\n[ \t]*\n", body)
    if m:  # rung 5 — split at the first blank line
        return _lead_split(body, m.start() + 1), "WARNING: no structure found; using lead paragraph as summary (rung 5)."
    # rung 6 — single block
    return (_norm(body), ""), "WARNING: single-block body; posting whole body as summary (rung 6)."


BANNER = (
    "> ⚠️ **This artifact is marked `incomplete`.** "
    "Reviewers: the analysis below may evolve."
)


def build_table_rows(fm, source_path):
    """Header table rows, skipping any field that has no value. Source path always shown."""
    rows = ["| Field | Value |", "|-------|-------|"]
    producer = fm.get("producer", "").strip()
    atype = fm.get("artifact", "").strip() or fm.get("type", "").strip()
    issue = fm.get("issue_id", "").strip()
    status = fm.get("status", "").strip()
    date = fm.get("date", "").strip()
    doc = fm.get("rp1_doc_id", "").strip()
    if producer:
        rows.append(f"| Producer | `{producer}` |")
    if atype:
        rows.append(f"| Artifact type | `{atype}` |")
    if issue:
        rows.append(f"| Issue ID | `{issue}` |")
    if status:
        rows.append(f"| Status | `{status}` |")
    if date:
        rows.append(f"| Generated | {date} |")
    if doc:
        rows.append(f"| Doc ID | `{doc}` |")
    rows.append(f"| Source path | `{source_path}` (gitignored, local to author) |")
    return rows


def build_banner(fm):
    """Return the incomplete banner line, or None."""
    if fm.get("status", "").strip().lower() == "incomplete":
        return BANNER
    return None


def marker_key(fm, source_path):
    """Idempotency key: rp1_doc_id when present, else path:<source_path>."""
    doc = fm.get("rp1_doc_id", "").strip()
    return doc if doc else f"path:{source_path}"


FOOTER_RULE = "---"
FOOTER_SUB = (
    "<sub>\U0001F916 Posted by `publish-artifact`. Re-run the skill to update "
    "this comment in place. Local artifact is gitignored and may be edited by "
    "`rp1` agents.</sub>"
)


def assemble(key, title, table_rows, banner, summary_body, rest_body):
    """Build the exact comment body. summary_body/rest_body end in one \\n (rest may be '')."""
    lines = [f"<!-- rp1-artifact: {key} -->", f"## \U0001F4CB rp1 Artifact: {title}", ""]
    lines += table_rows
    lines.append("")
    if banner:
        lines.append(banner)
        lines.append("")
    lines.append("### Executive Summary")
    lines.append("")
    lines += summary_body.rstrip("\n").split("\n")
    if rest_body:
        lines.append("")
        lines.append("<details>")
        lines.append("<summary><strong>Full artifact</strong> (click to expand)</summary>")
        lines.append("")
        lines += rest_body.rstrip("\n").split("\n")
        lines.append("")
        lines.append("</details>")
    lines.append("")
    lines.append(FOOTER_RULE)
    lines.append(FOOTER_SUB)
    return "\n".join(lines) + "\n"


def check_size(body):
    """Return an error message if body exceeds GitHub's cap, else None."""
    n = len(body.encode("utf-8"))
    if n > MAX_BYTES:
        return f"Comment body exceeds GitHub's 65 KB cap ({n} bytes). Multi-comment chunking is not yet supported."
    return None


def project(artifact_path, source_path):
    """Pure projection. Returns (comment_body, warnings)."""
    with open(artifact_path, encoding="utf-8") as f:
        text = f.read()
    fm, body = split_frontmatter(text)
    title = derive_title(fm, body, artifact_path)
    body1 = strip_leading_h1(body)
    (summary_body, rest_body), warn = extract_summary(body1)
    warnings = [warn] if warn else []
    rows = build_table_rows(fm, source_path)
    banner = build_banner(fm)
    key = marker_key(fm, source_path)
    out = assemble(key, title, rows, banner, summary_body, rest_body)
    return out, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description="Project an rp1 artifact into a PR/issue comment body.")
    ap.add_argument("artifact_path")
    ap.add_argument("--source-path", required=True,
                    help="repo-relative path to display in the Source path row and path: key")
    args = ap.parse_args(argv)
    body, warnings = project(args.artifact_path, args.source_path)
    for w in warnings:
        print(w, file=sys.stderr)
    err = check_size(body)
    if err:
        print(err, file=sys.stderr)
        return 1
    sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
