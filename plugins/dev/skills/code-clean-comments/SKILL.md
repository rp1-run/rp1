---
name: code-clean-comments
description: "Systematically removes unnecessary comments from a user scope by first resolving it into a durable change manifest."
allowed-tools: Bash(pwd), Bash(rp1 *), Bash(git *), Bash(test *), Bash(mkdir *), Bash(node *)
metadata:
  category: quality
  is_workflow: false
  version: 3.0.0
  tags:
    - code
    - refactoring
    - review
  created: 2025-10-25
  updated: 2026-04-26
  author: cloud-on-prem/rp1
  arguments:
    - name: SCOPE
      type: string
      required: false
      default: "."
      description: "File path, directory path, git ref, git range, or existing change-manifest JSON"
    - name: CODE_ROOT
      type: string
      required: false
      default: ""
      description: "Source root for resolving scoped paths"
  sub_agents:
    - "rp1-dev:comment-cleaner"
---

# Comment Cleaner

Resolves a user scope into a durable change-manifest artifact, then spawns the comment-cleaner agent with only `CHANGE_MANIFEST` and `CODE_ROOT`.

The comment-cleaner agent remains manifest-only. Never pass `SCOPE`, `BASE_BRANCH`, branch, unstaged, or commit-range parameters to it.

## 1. Resolve Directories

Use generated Resolve Arguments directory values. Resolve `{resolved_code_root}` to `CODE_ROOT` when it is non-empty; otherwise use `{codeRoot}`. Use `{workRoot}` for the durable artifact directory.

Create the manifest directory if needed:

```bash
mkdir -p "{workRoot}/comment-clean-comments"
```

Choose the next numbered manifest path:

```text
{workRoot}/comment-clean-comments/change-manifest-001.json
```

Increment the number if that file already exists.

## 2. Resolve `SCOPE`

Supported scopes:

- Existing change-manifest JSON: validate it and use or copy it as the durable manifest.
- File path under `CODE_ROOT`: create one manifest file entry with a full-file owned hunk.
- Directory path under `CODE_ROOT`: create manifest entries for supported code files under that directory, excluding generated/dependency directories such as `.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`, `.rp1`, and `vendor`.
- Git range containing `..`: derive owned hunks from `git diff -U0 --no-color {SCOPE}`.
- Git ref without `..`: derive owned hunks from `git diff -U0 --no-color {SCOPE}...HEAD`.

If `SCOPE` cannot be resolved, or it resolves to zero owned files/hunks, fail closed and do not dispatch comment-cleaner.

## 3. Manifest Schema

Write durable JSON:

```json
{
  "version": 1,
  "source": "code-clean-comments",
  "codeRoot": "{resolved_code_root}",
  "scope": "{SCOPE}",
  "files": [
    {
      "path": "relative/path/from/CODE_ROOT.ts",
      "ownedHunks": [{ "startLine": 1, "endLine": 10 }],
      "allowedOperations": ["remove_comments"]
    }
  ]
}
```

Use relative file paths from `CODE_ROOT`. Hunks are inclusive line bounds in the current file. For full-file scopes, use one hunk from line 1 to the current line count. For git scopes, include only added/modified new-file hunk lines from the diff.

## 4. Dispatch Cleaner

After writing and validating the manifest, invoke:

{% dispatch_agent "rp1-dev:comment-cleaner" %}
CHANGE_MANIFEST={resolved_change_manifest_path}, CODE_ROOT={resolved_code_root}
{% enddispatch_agent %}

## 5. Output

Report the scope, manifest path, files covered, and comment-cleaner result. Do not stage or commit changes.
