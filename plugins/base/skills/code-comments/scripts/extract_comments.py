#!/usr/bin/env python3
"""Extract comments from git-changed files. Usage: extract_comments.py <scope> <base_branch> [--line-scoped]"""
import json, re, subprocess, sys
from pathlib import Path
from typing import Optional

# Comment patterns: extension -> (single_line_patterns, multi_line_start_end_pairs)
PATTERNS = {
    **{e: ([r"#(?!!)"], []) for e in [".py", ".sh"]},  # Hash (exclude shebang)
    **{e: ([r"#"], []) for e in [".rb", ".yml", ".yaml"]},
    **{e: ([r"//"], [(r"/\*", r"\*/")]) for e in [
        ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp"
    ]},
    **{e: ([], [(r"<!--", r"-->")]) for e in [".html", ".xml"]},
    **{e: ([r"//"], [(r"/\*", r"\*/"), (r"<!--", r"-->")]) for e in [".vue", ".svelte"]},
    ".css": ([], [(r"/\*", r"\*/")]),
    **{e: ([r"//"], [(r"/\*", r"\*/")]) for e in [".scss", ".less"]},
    ".php": ([r"//", r"#"], [(r"/\*", r"\*/")]),
}

def run_git(args):
    """Run git command, return (success, output)."""
    try:
        r = subprocess.run(["git"] + args, capture_output=True, text=True, timeout=30)
        return r.returncode == 0, r.stdout.strip()
    except Exception as e:
        return False, str(e)

def get_changed_files(scope, base):
    """Get changed files based on scope."""
    if scope == "unstaged":
        ok, out = run_git(["diff", "--name-only"])
        return ok, out.split("\n") if out else [], None, "unstaged"
    if scope == "branch":
        ok, merge_base = run_git(["merge-base", "HEAD", base])
        if not ok:
            return False, [], None, "branch"
        ok, out = run_git(["diff", "--name-only", merge_base, "HEAD"])
        if not ok:
            return False, [], None, "branch"
        files = set(out.split("\n")) if out else set()
        _, unstaged = run_git(["diff", "--name-only"])
        if unstaged:
            files.update(unstaged.split("\n"))
        return True, list(files), merge_base, "branch"
    # Commit range (e.g., "abc123..def456", "HEAD~5..HEAD")
    ok, out = run_git(["diff", "--name-only", scope])
    return ok, out.split("\n") if out else [], scope, "range"

def get_lines_added(scope_type, diff_arg):
    """Get total lines added (insertions only) from git diff --stat."""
    if scope_type == "unstaged":
        ok, out = run_git(["diff", "--stat"])
    elif scope_type == "branch":
        ok, out = run_git(["diff", "--stat", diff_arg, "HEAD"])
    else:
        ok, out = run_git(["diff", "--stat", diff_arg])
    if not ok or not out:
        return 0
    # Parse last line: "N files changed, X insertions(+), Y deletions(-)"
    lines = out.strip().split("\n")
    if not lines:
        return 0
    summary = lines[-1]
    match = re.search(r"(\d+)\s+insertion", summary)
    return int(match.group(1)) if match else 0

def get_changed_line_ranges(scope: str) -> dict[str, set[int]]:
    """Get changed line numbers per file using git diff -U0.

    Args:
        scope: Git diff scope (e.g., "abc123..def456", commit range)

    Returns:
        Dict mapping file paths to sets of changed line numbers in the new version.
        Deleted files are excluded (empty set or not present).
    """
    ok, out = run_git(["diff", "-U0", "--no-color", scope])
    if not ok or not out:
        return {}

    result: dict[str, set[int]] = {}
    current_file: Optional[str] = None

    for line in out.split("\n"):
        # Match file header: +++ b/path/to/file
        if line.startswith("+++ b/"):
            current_file = line[6:]
            if current_file not in result:
                result[current_file] = set()
        # Match deleted file header: +++ /dev/null (skip deleted files)
        elif line.startswith("+++ /dev/null"):
            current_file = None
        # Match hunk header: @@ -old_start,old_count +new_start,new_count @@
        elif line.startswith("@@") and current_file:
            # Parse hunk header formats:
            # @@ -10,5 +10,8 @@     -> lines 10-17 in new file
            # @@ -0,0 +1,50 @@     -> new file, lines 1-50
            # @@ -5 +5 @@          -> single line 5 (count defaults to 1)
            # @@ -5,0 +6,3 @@      -> lines 6-8 added (old count 0 means pure addition)
            match = re.search(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
            if match:
                start = int(match.group(1))
                count = int(match.group(2)) if match.group(2) else 1
                # If count is 0, no lines added at this position (pure deletion)
                if count > 0:
                    for line_num in range(start, start + count):
                        result[current_file].add(line_num)

    return result

def extract_comments(filepath, ext, line_filter: Optional[set[int]] = None):
    """Extract comments from a file.

    Args:
        filepath: Path to file
        ext: File extension (e.g., ".py")
        line_filter: Optional set of line numbers to include. If provided, only comments
                     on these lines are returned. If None, all comments are returned.

    Returns:
        List of comment dicts with file, line, type, content, context_before, context_after.
    """
    pats = PATTERNS.get(ext)
    if not pats:
        return []
    single_pats, multi_pats = pats
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > 10000:
            return []
    except Exception:
        return []
    comments, in_multi, multi_end, multi_start, multi_content = [], False, None, 0, []
    for i, line in enumerate(lines, 1):
        ctx_before = lines[i - 2].rstrip() if i > 1 else ""
        ctx_after = lines[i].rstrip() if i < len(lines) else ""
        if in_multi and multi_end:
            multi_content.append(line.rstrip())
            if re.search(multi_end, line):
                # For multi-line comments, check if start line is in filter
                if line_filter is None or multi_start in line_filter:
                    comments.append({"file": str(filepath), "line": multi_start, "type": "multi",
                        "content": "\n".join(multi_content),
                        "context_before": lines[multi_start - 2].rstrip() if multi_start > 1 else "",
                        "context_after": ctx_after})
                in_multi, multi_content = False, []
            continue
        for start_pat, end_pat in multi_pats:
            if re.search(start_pat, line):
                if re.search(end_pat, line):
                    m = re.search(f"{start_pat}.*?{end_pat}", line)
                    if m:
                        # Single-line multi-line comment (e.g., /* comment */)
                        if line_filter is None or i in line_filter:
                            comments.append({"file": str(filepath), "line": i, "type": "multi",
                                "content": m.group(0), "context_before": ctx_before, "context_after": ctx_after})
                else:
                    in_multi, multi_end, multi_start, multi_content = True, end_pat, i, [line.rstrip()]
                break
        if in_multi:
            continue
        for pat in single_pats:
            m = re.search(f"({pat}.*?)$", line)
            if m:
                if line_filter is None or i in line_filter:
                    comments.append({"file": str(filepath), "line": i, "type": "single",
                        "content": m.group(1).strip(), "context_before": ctx_before, "context_after": ctx_after})
                break
    return comments

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extract_comments.py <scope> <base_branch> [--line-scoped]"}))
        sys.exit(1)
    scope, base = sys.argv[1], sys.argv[2]
    line_scoped = "--line-scoped" in sys.argv[3:] if len(sys.argv) > 3 else False

    ok, _ = run_git(["rev-parse", "--git-dir"])
    if not ok:
        print(json.dumps({"error": "Not a git repository", "scope": scope, "base": base, "files_scanned": 0, "comments": []}))
        sys.exit(1)
    ok, files, diff_arg, scope_type = get_changed_files(scope, base)
    if not ok:
        print(json.dumps({"error": f"Failed to get changed files for scope '{scope}'", "scope": scope, "base": base, "files_scanned": 0, "lines_added": 0, "comments": []}))
        sys.exit(1)

    # Get changed line ranges if line-scoped filtering is enabled
    changed_lines: dict[str, set[int]] = {}
    if line_scoped and scope_type == "range":
        changed_lines = get_changed_line_ranges(scope)

    lines_added = get_lines_added(scope_type, diff_arg)
    all_comments, scanned = [], 0
    for f in files:
        if not f:
            continue
        p = Path(f)
        ext = p.suffix.lower()
        if ext not in PATTERNS or not p.exists():
            continue
        scanned += 1
        # Apply line filter if line-scoped mode is active and we have line ranges for this file
        file_line_filter = changed_lines.get(f) if line_scoped else None
        all_comments.extend(extract_comments(p, ext, file_line_filter))

    result = {
        "scope": scope,
        "base": base,
        "files_scanned": scanned,
        "lines_added": lines_added,
        "comments": all_comments
    }
    if line_scoped:
        result["line_scoped"] = True
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
