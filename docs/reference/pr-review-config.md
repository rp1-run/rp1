# PR Review Configuration Reference

Complete reference for `.rp1/config/pr-review.yaml` configuration options.

---

## Overview

The PR review configuration file controls how automated PR reviews behave in CI/CD environments. The file is located at:

```
.rp1/config/pr-review.yaml
```

When the configuration file is missing, default values are used. In CI mode with `enabled: false` (the default), the review is skipped entirely.

---

## Schema

```yaml
# Enable PR review in CI mode
# When false in CI, review exits early without posting
# Type: boolean
# Default: false
enabled: false

# Review draft PRs
# When false, draft PRs are skipped entirely
# Type: boolean
# Default: true
review_drafts: true

# AI harness for running the review
# Type: "claude-code" | "opencode"
# Default: "claude-code"
ai_harness: claude-code

# Post inline comments on specific code locations
# When false, only a summary review is posted
# Type: boolean
# Default: true
add_comments: true

# Collapse summary in HTML <details> tag
# Useful for reducing visual noise on large reviews
# Type: boolean
# Default: false
collapse_summary: false

# Verdict mode for PR review submission
# Type: "approve" | "request_changes" | "comment" | "auto"
# Default: "auto"
verdict: auto

# Maximum inline comments per review
# Prevents overwhelming PR authors
# Type: integer
# Default: 25
max_comments: 25

# Hidden HTML comment for bot identification
# Used for deduplication across runs
# Type: string
# Default: "<!-- rp1-review -->"
bot_marker: "<!-- rp1-review -->"

# Generate mermaid diagrams in review summary
# Diagrams show component flows and change relationships
# Type: boolean
# Default: true
visualize: true

# CI platform for context extraction
# Type: "github" | "buildkite" | "gitlab"
# Default: "github"
ci_platform: github
```

---

## Option Details

### enabled

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `false` |
| Required | No |

Controls whether PR review runs in CI mode. When `false` and running in CI, the review exits early without posting any comments or review.

**Example:**
```yaml
enabled: true  # Enable automated reviews
```

!!! warning "CI Only"
    This setting only affects CI mode. Local runs (`/pr-review` in an IDE) always proceed regardless of this setting.

---

### review_drafts

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `true` |
| Required | No |

Controls whether draft PRs are reviewed.

| Value | Behavior |
|-------|----------|
| `true` | Review draft PRs normally |
| `false` | Skip draft PRs (exit early, no review posted) |

**Example:**
```yaml
review_drafts: false  # Don't review work-in-progress
```

---

### ai_harness

| Property | Value |
|----------|-------|
| Type | `"claude-code"` \| `"opencode"` |
| Default | `"claude-code"` |
| Required | No |

Specifies which AI coding assistant runs the review.

**Example:**
```yaml
ai_harness: opencode  # Use OpenCode instead of Claude Code
```

---

### add_comments

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `true` |
| Required | No |

Controls whether inline comments are posted on specific code locations.

| Value | Behavior |
|-------|----------|
| `true` | Post inline comments + summary review |
| `false` | Post summary review only (no inline comments) |

**Example:**
```yaml
add_comments: false  # Summary only, less noise
```

!!! tip "Reducing Noise"
    Set `add_comments: false` for large teams where inline comments might be overwhelming. The summary still contains all findings.

---

### collapse_summary

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `false` |
| Required | No |

Wraps the review summary in an HTML `<details>` tag for collapsible display.

**Example:**
```yaml
collapse_summary: true  # Collapsible summary
```

**Rendered output:**
```html
<details>
<summary>rp1 PR Review Summary</summary>

... full review content ...

</details>
```

---

### verdict

| Property | Value |
|----------|-------|
| Type | `"approve"` \| `"request_changes"` \| `"comment"` \| `"auto"` |
| Default | `"auto"` |
| Required | No |

Controls the GitHub review verdict submitted with the review.

| Mode | Behavior | Use Case |
|------|----------|----------|
| `auto` | Verdict based on finding severity | Most teams |
| `approve` | Always submit APPROVE | Advisory-only reviews |
| `request_changes` | Always submit REQUEST_CHANGES | Strict enforcement |
| `comment` | Always submit COMMENT | Neutral feedback |

**Auto verdict logic:**

| Findings | Verdict |
|----------|---------|
| Critical or High severity | `REQUEST_CHANGES` |
| Medium or Low severity only | `COMMENT` |
| No findings | `APPROVE` |

**Example:**
```yaml
verdict: comment  # Never block PRs, just provide feedback
```

---

### max_comments

| Property | Value |
|----------|-------|
| Type | `integer` |
| Default | `25` |
| Required | No |

Limits the number of inline comments posted per review. When findings exceed this limit, only the highest severity items are posted.

**Example:**
```yaml
max_comments: 10  # Limit to 10 most important comments
```

!!! note "Summary Unaffected"
    The review summary always contains all findings regardless of this limit.

---

### bot_marker

| Property | Value |
|----------|-------|
| Type | `string` |
| Default | `"<!-- rp1-review -->"` |
| Required | No |

Hidden HTML comment embedded in all bot comments for identification. Used for:

- Deduplication across multiple runs
- Identifying bot comments vs human comments
- Analytics and tracking

**Example:**
```yaml
bot_marker: "<!-- my-team-rp1 -->"
```

!!! warning "Consistency"
    Changing `bot_marker` will cause deduplication to fail for existing comments. Only change this when setting up a new repository.

---

### visualize

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `true` |
| Required | No |

Generates mermaid diagrams showing change relationships and component flows. Enabled by default.

| Value | Behavior |
|-------|----------|
| `true` | Include mermaid diagrams in review summary (default) |
| `false` | Text-only review (faster) |

**Example:**
```yaml
visualize: true  # Include visual diagrams
```

!!! note "GitHub Rendering"
    GitHub natively renders mermaid code blocks in PR comments. No special setup required.

---

### ci_platform

| Property | Value |
|----------|-------|
| Type | `"github"` \| `"buildkite"` \| `"gitlab"` |
| Default | `"github"` |
| Required | No |

Specifies which CI platform to use for context extraction. This determines how PR metadata is retrieved.

| Platform | Description |
|----------|-------------|
| `github` | Use GitHub Actions environment variables and event payload |
| `buildkite` | Use Buildkite environment variables |
| `gitlab` | Use GitLab CI environment variables |

**Example:**
```yaml
ci_platform: github  # Use GitHub Actions (default)
```

!!! note "CI Detection"
    The CI environment is detected automatically via standard environment variables (`CI=true`, `GITHUB_ACTIONS=true`, etc.). The `ci_platform` setting only controls which platform's context extraction is used.

---

## Environment Variable Overrides

Configuration values can be overridden via environment variables for CI flexibility:

| Environment Variable | Overrides | Example |
|---------------------|-----------|---------|
| `RP1_PR_REVIEW_ENABLED` | `enabled` | `true` |
| `RP1_PR_REVIEW_VERDICT` | `verdict` | `request_changes` |
| `RP1_PR_REVIEW_ADD_COMMENTS` | `add_comments` | `false` |
| `RP1_PR_REVIEW_VISUALIZE` | `visualize` | `true` |

**Precedence:** Environment variables override file configuration.

**Example in GitHub Actions:**
```yaml
- name: Run Strict Review
  env:
    RP1_PR_REVIEW_VERDICT: request_changes
  run: claude /rp1-dev:pr-review
```

---

## Complete Example

```yaml
# .rp1/config/pr-review.yaml
#
# Configuration for automated PR reviews in CI/CD

# Enable the feature
enabled: true

# Skip draft PRs - only review when ready
review_drafts: false

# Use Claude Code
ai_harness: claude-code

# Post inline comments for specific findings
add_comments: true

# Don't collapse - show full summary
collapse_summary: false

# Auto-determine verdict based on severity
verdict: auto

# Limit comments to avoid overwhelming authors
max_comments: 20

# Custom marker for this repo
bot_marker: "<!-- rp1-review -->"

# Include visual diagrams for architectural context
visualize: true

# Use GitHub Actions for CI (default)
ci_platform: github
```

---

## Validation Errors

Invalid configuration produces clear error messages:

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid verdict value` | `verdict` not one of allowed values | Use `auto`, `approve`, `request_changes`, or `comment` |
| `Invalid ai_harness value` | `ai_harness` not recognized | Use `claude-code` or `opencode` |
| `Invalid ci_platform value` | `ci_platform` not recognized | Use `github`, `buildkite`, or `gitlab` |
| `max_comments must be positive` | Negative value | Use a non-negative integer |
| `YAML parse error` | Invalid YAML syntax | Check indentation and structure |

---

## See Also

- [Remote PR Review Guide](../guides/remote-pr-review.md) - Setup tutorial
- [pr-review Command](dev/pr-review.md) - Command reference
- [CI/CD Integration](../guides/ci-cd-integration.md) - Broader CI patterns
