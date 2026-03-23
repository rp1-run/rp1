# Agent Tools Reference

CLI utilities designed for use by AI agents during automated workflows. These tools provide deterministic, type-safe operations with structured JSON output.

!!! note "Internal Tools"
    Agent tools are used by rp1 agents internally. They are not intended for direct user invocation.

---

## Overview

Agent tools provide programmatic interfaces for operations that agents need to perform during workflows. Each tool:

- Accepts JSON input via stdin
- Returns structured JSON output
- Uses standard exit codes (0 = success, 1 = failure)
- Follows the `ToolResult<T>` envelope pattern

```typescript
interface ToolResult<T> {
  success: boolean;
  tool: string;
  data?: T;
  errors?: string[];
}
```

---

## Available Tool Modules

| Module | Description |
|--------|-------------|
| [`emit`](#emit) | Workflow event emission with state machine validation |
| [`feedback`](#feedback) | Feedback lifecycle: read, resolve, reply, accept-edit for Arcade annotations |
| [`github-pr`](#github-pr) | GitHub PR operations (review, comments, reactions) |
| [`task`](#task) | Task queue management (create, list, pickup, complete, fail, cancel, get) |
| [`rp1-root-dir`](cli/rp1-root-dir.md) | RP1_ROOT path resolution with worktree-aware detection |
| `comment-extract` | Extract comments from source files for review workflows |
| `mmd-validate` | Validate Mermaid diagram syntax |

---

## github-pr

Provides deterministic GitHub API operations for PR review workflows. Uses `@octokit/rest` for type-safe API calls.

### Authentication

All github-pr tools require a `GITHUB_TOKEN` environment variable with appropriate permissions:

| Operation | Required Scope |
|-----------|---------------|
| `fetch-comments` | `repo` (read) |
| `submit-review` | `pull-requests: write` |
| `add-reaction` | `pull-requests: write` |
| `reply-comment` | `pull-requests: write` |

---

### submit-review

Submit a PR review with optional inline comments.

#### Synopsis

```bash
echo '<json>' | rp1 agent-tools github-pr submit-review
```

#### Input Schema

```json
{
  "owner": "string",      // Repository owner (org or user)
  "repo": "string",       // Repository name
  "pr_number": "number",  // Pull request number
  "body": "string",       // Review summary body (markdown)
  "event": "string",      // "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
  "comments": [           // Optional inline comments
    {
      "path": "string",   // File path relative to repo root
      "line": "number",   // Line number in the diff
      "body": "string"    // Comment body (markdown)
    }
  ]
}
```

#### Output Schema

```json
{
  "success": true,
  "tool": "github-pr",
  "data": {
    "review_id": 123456789,
    "html_url": "https://github.com/owner/repo/pull/42#pullrequestreview-123456789",
    "comments_posted": 3
  }
}
```

#### Example

```bash
echo '{
  "owner": "rp1-run",
  "repo": "rp1",
  "pr_number": 42,
  "body": "## rp1 PR Review\n\nLooks good overall with minor suggestions.",
  "event": "COMMENT",
  "comments": [
    {
      "path": "src/auth.ts",
      "line": 67,
      "body": "<!-- rp1-review -->\n**[HIGH - Security]** Consider validating input here."
    }
  ]
}' | rp1 agent-tools github-pr submit-review
```

#### Event Types

| Event | Description |
|-------|-------------|
| `APPROVE` | Approve the PR (may be blocked by branch protection) |
| `REQUEST_CHANGES` | Request changes before merging |
| `COMMENT` | Leave feedback without explicit approval/rejection |

---

### add-reaction

Add a reaction to an existing PR comment.

#### Synopsis

```bash
echo '<json>' | rp1 agent-tools github-pr add-reaction
```

#### Input Schema

```json
{
  "owner": "string",      // Repository owner
  "repo": "string",       // Repository name
  "comment_id": "number", // Comment ID to react to
  "reaction": "string"    // Reaction type
}
```

#### Supported Reactions

| Reaction | Display |
|----------|---------|
| `+1` | :+1: |
| `-1` | :-1: |
| `laugh` | :laughing: |
| `confused` | :confused: |
| `heart` | :heart: |
| `hooray` | :tada: |
| `rocket` | :rocket: |
| `eyes` | :eyes: |

#### Output Schema

```json
{
  "success": true,
  "tool": "github-pr",
  "data": {
    "reaction_id": 987654321,
    "content": "+1"
  }
}
```

#### Example

```bash
echo '{
  "owner": "rp1-run",
  "repo": "rp1",
  "comment_id": 123456,
  "reaction": "+1"
}' | rp1 agent-tools github-pr add-reaction
```

---

### reply-comment

Reply to an existing PR review comment thread.

#### Synopsis

```bash
echo '<json>' | rp1 agent-tools github-pr reply-comment
```

#### Input Schema

```json
{
  "owner": "string",      // Repository owner
  "repo": "string",       // Repository name
  "pr_number": "number",  // Pull request number
  "comment_id": "number", // Comment ID to reply to
  "body": "string"        // Reply body (markdown)
}
```

#### Output Schema

```json
{
  "success": true,
  "tool": "github-pr",
  "data": {
    "comment_id": 456789,
    "html_url": "https://github.com/owner/repo/pull/42#discussion_r456789"
  }
}
```

#### Example

```bash
echo '{
  "owner": "rp1-run",
  "repo": "rp1",
  "pr_number": 42,
  "comment_id": 123456,
  "body": "<!-- rp1-review -->\nAdditional context: This pattern is used for XSS prevention."
}' | rp1 agent-tools github-pr reply-comment
```

---

### fetch-comments

Fetch all comments from a PR (both review comments and issue comments).

#### Synopsis

```bash
echo '<json>' | rp1 agent-tools github-pr fetch-comments
```

#### Input Schema

```json
{
  "owner": "string",      // Repository owner
  "repo": "string",       // Repository name
  "pr_number": "number"   // Pull request number
}
```

#### Output Schema

```json
{
  "success": true,
  "tool": "github-pr",
  "data": {
    "review_comments": [
      {
        "id": 123456,
        "user": "reviewer",
        "body": "Consider adding validation here",
        "path": "src/auth.ts",
        "line": 67,
        "created_at": "2026-01-11T10:30:00Z",
        "is_bot": false
      }
    ],
    "issue_comments": [
      {
        "id": 789012,
        "user": "contributor",
        "body": "Ready for review!",
        "created_at": "2026-01-10T15:00:00Z",
        "is_bot": false
      }
    ]
  }
}
```

#### Comment Types

| Type | Description |
|------|-------------|
| `review_comments` | Comments on specific code lines in the diff |
| `issue_comments` | General comments on the PR (not line-specific) |

#### Bot Detection

The `is_bot` field indicates whether the comment was posted by a bot account:

- Checks user type (`Bot` vs `User`)
- Checks common bot username patterns (`[bot]`, `-bot`, `github-actions`)

#### Example

```bash
echo '{
  "owner": "rp1-run",
  "repo": "rp1",
  "pr_number": 42
}' | rp1 agent-tools github-pr fetch-comments
```

---

## feedback

Manages the feedback lifecycle for Arcade annotations. Agents use these subcommands to read user feedback, resolve annotations, reply to comments, and accept file edits.

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `read` | Fetch open annotations and pending file edits for a run |
| `resolve` | Mark an annotation as resolved |
| `reply` | Reply to an annotation thread |
| `accept-edit` | Accept a user-proposed file edit |

All feedback subcommands require a `--run-id` to scope operations to a specific workflow run.

### read

Fetch open annotations and pending file edits for a given run.

#### Synopsis

```bash
rp1 agent-tools feedback read --run-id <run-id>
```

#### Output

Returns open annotations with summary counts, associated artifact paths, and any pending direct file edits. Annotations without an explicit `runId` are matched via their associated artifacts.

### resolve

Mark an annotation as resolved after addressing the feedback.

```bash
rp1 agent-tools feedback resolve <annotation-id> --run-id <run-id>
```

### reply

Reply to an annotation thread.

```bash
rp1 agent-tools feedback reply <annotation-id> --run-id <run-id>
```

Reads the reply body from stdin.

### accept-edit

Accept a user-proposed direct file edit.

```bash
rp1 agent-tools feedback accept-edit <doc-id> --run-id <run-id>
```

---

## Error Handling

All tools return errors in a consistent format:

```json
{
  "success": false,
  "tool": "github-pr",
  "errors": [
    "GITHUB_TOKEN environment variable not set",
    "Rate limit exceeded - retry after 60 seconds"
  ]
}
```

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `GITHUB_TOKEN not set` | Missing authentication | Set `GITHUB_TOKEN` environment variable |
| `Rate limit exceeded` | Too many API calls | Wait and retry, or use a token with higher limits |
| `Not found` | Invalid owner/repo/PR | Verify repository and PR number exist |
| `Validation failed` | Invalid input JSON | Check input matches schema |
| `Permission denied` | Insufficient token scope | Use token with required permissions |

---

## See Also

- [rp1-root-dir Reference](cli/rp1-root-dir.md) - Path resolution
- [PR Review Config](pr-review-config.md) - Configuration options
- [Remote PR Review Guide](../guides/remote-pr-review.md) - CI setup tutorial
- [Annotations](../web-ui/annotations.md) - Annotation system used by the feedback tool
