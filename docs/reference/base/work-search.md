# work-search

Searches project-scoped rp1 work artifacts through `rp1 agent-tools work-search`.

This is an advanced machine-facing API reference. The exact JSON fields,
database terms, and scoring names are shown for automation and debugging; normal
users usually search and open artifacts through Arcade.

---

## Synopsis

```bash
rp1 agent-tools work-search "persistent memory"
rp1 agent-tools work-search "phase plan" --limit 5
rp1 agent-tools work-search --refresh-only
rp1 agent-tools work-search "requirements" --project /path/to/project --no-refresh
```

## Description

`work-search` resolves the active rp1 project, refreshes a project-local
SQLite FTS5 sidecar index at `.rp1/search.db`, and searches regular markdown
files under that project's `.rp1/work` directory. Results are scoped by the
project's `.rp1/project_id`, so similarly named artifacts in another rp1 project
are not returned.

The sidecar database is a rebuildable read-side projection. It does not replace
the canonical workflow event database, and search failures are reported as
`work-search` errors instead of blocking workflow bootstrap, event emission, or
artifact registration.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `query` | Yes, unless `--refresh-only` is used | Plain text search query. The command tokenizes words and numbers, escapes FTS syntax, and combines terms with deterministic AND semantics. |

## Options

| Option | Description |
|--------|-------------|
| `--project <path>` | Resolve and search an explicit rp1 project instead of the active project. |
| `--limit <n>` | Maximum number of results. Defaults to `10`; values above `50` are capped at `50`. |
| `--no-refresh` | Search the existing sidecar index without scanning `.rp1/work` first. Returns `unavailable_index` if no sidecar index exists. |
| `--refresh-only` | Refresh the sidecar index and return refresh stats without requiring a query. |

## Result Contract

The command prints a JSON `ToolResult`.

Successful searches return:

```json
{
  "success": true,
  "tool": "work-search",
  "data": {
    "query": "phase plan",
    "project": {
      "projectId": "project-id",
      "projectRoot": "/path/to/project",
      "workRoot": "/path/to/project/.rp1/work"
    },
    "refresh": {
      "scannedDocuments": 4,
      "indexedDocuments": 1,
      "skippedDocuments": 3,
      "deletedDocuments": 0,
      "failedDocuments": 0,
      "indexedAt": "2026-04-26T00:00:00.000Z"
    },
    "results": [
      {
        "rank": 1,
        "score": -1.23,
        "snippet": "...phase...plan...",
        "path": "features/example/design.md",
        "displayPath": "features/example/design.md",
        "storageRoot": "work_dir",
        "projectId": "project-id",
        "metadata": {
          "docId": "doc-id",
          "runId": "run-id",
          "workflow": "build",
          "feature": "example",
          "step": "design",
          "title": "Design: Example"
        },
        "chunk": {
          "heading": "Implementation Plan",
          "startLine": 42,
          "endLine": 65
        }
      }
    ]
  }
}
```

`refresh` is `null` when `--no-refresh` is used. `--refresh-only` returns
`query: null`, the project scope, refresh stats, and an empty `results` array.

Each result includes:

| Field | Description |
|-------|-------------|
| `rank` | 1-based deterministic result order. |
| `score` | SQLite FTS5 `bm25()` score. Lower scores rank first. |
| `snippet` | Matching snippet with `<mark>` tags around terms. |
| `path` / `displayPath` | Normalized path relative to `.rp1/work`. |
| `storageRoot` | Always `work_dir` for P1. |
| `projectId` | Owning rp1 project identity. |
| `metadata` | Best-effort document, run, workflow, feature, step, and title metadata from frontmatter, artifact registry rows, or path fallback. |
| `chunk` | Matched markdown chunk heading and line range. |

## Typed Errors

Errors use the same envelope with `success: false`, `tool: "work-search"`,
`data: null`, and an `errors` array. Each error includes a stable `code`.

| Code | Meaning |
|------|---------|
| `invalid_query` | Query is missing, empty, or contains no searchable word or number. |
| `invalid_limit` | `--limit` is not a positive integer. |
| `unresolved_project` | The active or explicit path is not an initialized rp1 project. |
| `unavailable_index` | The sidecar index cannot be opened or does not exist when `--no-refresh` is used. |
| `schema_migration_failed` | Sidecar schema initialization failed. |
| `refresh_failed` | Markdown scan, metadata extraction, or sidecar refresh failed. |
| `search_failed` | FTS query execution failed. |

Example:

```json
{
  "success": false,
  "tool": "work-search",
  "data": null,
  "errors": [
    {
      "code": "invalid_query",
      "message": "Missing search query. Provide a query or use --refresh-only."
    }
  ]
}
```

## Baseline Scope

P1 intentionally supports only:

- Local project search.
- Regular markdown files under `.rp1/work`.
- Lexical SQLite FTS5 ranking.
- The `rp1 agent-tools work-search` JSON contract.
- The rebuildable `.rp1/search.db` sidecar database.

P1 does not provide:

- Arcade search UI or Arcade deep links.
- Vector ranking, embeddings, or hybrid ranking.
- MCP exposure.
- Arbitrary SQL access.
- Source code, JSON artifact, or non-work-root indexing.

## Manual Verification

1. Run a refresh for the current project:

    ```bash
    rp1 agent-tools work-search --refresh-only
    ```

2. Search for a known phrase in a markdown artifact under `.rp1/work`:

    ```bash
    rp1 agent-tools work-search "known phrase" --limit 5
    ```

3. Confirm the output is `success: true`, the `project.projectId` matches the
   current project, result paths are relative to `.rp1/work`, and snippets come
   from expected markdown artifacts.

4. From another directory, verify explicit project scoping:

    ```bash
    rp1 agent-tools work-search "known phrase" --project /path/to/project --no-refresh
    ```

5. Repeat from a different initialized rp1 project with the same phrase and
   confirm only that project's artifacts are returned.
