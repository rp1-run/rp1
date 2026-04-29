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

Choose the next numbered manifest/status path pair:

```text
{workRoot}/comment-clean-comments/change-manifest-001.json
{workRoot}/comment-clean-comments/change-manifest-status-001.json
```

Increment the number if either file already exists. Set `resolved_change_manifest_path` and `resolved_change_manifest_status_path` to the selected pair.

## 2. Generate Manifest

Delegate all scope resolution to the typed generator:

```bash
rp1 agent-tools change-manifest generate \
  --code-root "{resolved_code_root}" \
  --out "{resolved_change_manifest_path}" \
  --status-out "{resolved_change_manifest_status_path}" \
  --source code-clean-comments \
  --scope "{SCOPE}"
```

Parse the `ToolResult` envelope into `cleanup_manifest_result`. The generator is responsible for existing manifest JSON, file, directory, git ref, and git range scopes. Do not inspect files, walk directories, parse git diffs, validate existing manifest JSON, or write manifest JSON yourself.

If `cleanup_manifest_result.data.status != "created"`, `cleanup_manifest_result.data.files == 0`, `cleanup_manifest_result.data.ownedLineCount == 0`, or `cleanup_manifest_result.data.manifestPath` is missing, fail closed and do not dispatch `comment-cleaner`. Report the status path and skip reason instead.

If the tool fails or returns malformed output, fail closed and do not dispatch `comment-cleaner`. Report `change_manifest_generate_failed` with the intended status path.

## 3. Dispatch Cleaner

Only when the generated manifest is created and non-empty, invoke:

{% dispatch_agent "rp1-dev:comment-cleaner" %}
CHANGE_MANIFEST={cleanup_manifest_result.data.manifestPath}, CODE_ROOT={resolved_code_root}
{% enddispatch_agent %}

## 4. Output

Report the scope, cleanup status, manifest path when created, status path, files covered, skip reason when skipped, and comment-cleaner result when it ran. Do not stage or commit changes.
