#!/usr/bin/env python3
"""Extract comments from git-changed files. Usage: extract_comments.py <scope> <base_branch>"""
import json, re, subprocess, sys
from pathlib import Path

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
        return ok, out.split("\n") if out else []
    ok, merge_base = run_git(["merge-base", "HEAD", base])
    if not ok:
        return False, []
    ok, out = run_git(["diff", "--name-only", merge_base, "HEAD"])
    if not ok:
        return False, []
    files = set(out.split("\n")) if out else set()
    _, unstaged = run_git(["diff", "--name-only"])
    if unstaged:
        files.update(unstaged.split("\n"))
    return True, list(files)

def extract_comments(filepath, ext):
    """Extract comments from a file."""
    pats = PATTERNS.get(ext)
    if not pats:
        return []
    single_pats, multi_pats = pats
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > 10000:
            return []  # Skip large files
    except Exception:
        return []
    comments, in_multi, multi_end, multi_start, multi_content = [], False, None, 0, []
    for i, line in enumerate(lines, 1):
        ctx_before = lines[i - 2].rstrip() if i > 1 else ""
        ctx_after = lines[i].rstrip() if i < len(lines) else ""
        if in_multi and multi_end:
            multi_content.append(line.rstrip())
            if re.search(multi_end, line):
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
                comments.append({"file": str(filepath), "line": i, "type": "single",
                    "content": m.group(1).strip(), "context_before": ctx_before, "context_after": ctx_after})
                break
    return comments

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extract_comments.py <scope> <base_branch>"}))
        sys.exit(1)
    scope, base = sys.argv[1], sys.argv[2]
    if scope not in ("branch", "unstaged"):
        print(json.dumps({"error": f"Invalid scope: {scope}. Use 'branch' or 'unstaged'"}))
        sys.exit(1)
    ok, _ = run_git(["rev-parse", "--git-dir"])
    if not ok:
        print(json.dumps({"error": "Not a git repository", "scope": scope, "base": base, "files_scanned": 0, "comments": []}))
        sys.exit(1)
    ok, files = get_changed_files(scope, base)
    if not ok:
        print(json.dumps({"error": "Failed to get changed files", "scope": scope, "base": base, "files_scanned": 0, "comments": []}))
        sys.exit(1)
    all_comments, scanned = [], 0
    for f in files:
        if not f:
            continue
        p = Path(f)
        ext = p.suffix.lower()
        if ext not in PATTERNS or not p.exists():
            continue
        scanned += 1
        all_comments.extend(extract_comments(p, ext))
    print(json.dumps({"scope": scope, "base": base, "files_scanned": scanned, "comments": all_comments}, indent=2))

if __name__ == "__main__":
    main()
