# address-pr-feedback

Unified PR feedback workflow - collect, triage, and fix review comments in a single command.

## Synopsis

=== "Claude Code"

    ```bash
    /address-pr-feedback [pr-number | pr-url | branch] [--afk]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/address-pr-feedback [pr-number | pr-url | branch] [--afk]
    ```

## Description

The `address-pr-feedback` command provides a unified workflow for handling PR review comments. It consolidates what was previously two separate commands into a single, streamlined process.

The command executes four phases:

1. **Collection**: Gathers and classifies review comments from GitHub
2. **Triage**: Displays priority breakdown for review
3. **Fix**: Addresses comments systematically in priority order
4. **Report**: Generates resolution summary

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pr-number` | number | No | PR number to process |
| `pr-url` | string | No | GitHub PR URL |
| `branch` | string | No | Branch name (auto-detects PR) |
| `--afk` | flag | No | Run autonomously without prompts |

If no parameter is provided, the command auto-detects the PR from the current branch.

## Output

The command produces:

- **Feedback document**: `.rp1/work/pr-reviews/{identifier}-feedback-{NNN}.md`
- **Resolution report**: Displayed at completion

## Examples

### Basic Usage

Process feedback for the current branch's PR:

```bash
/address-pr-feedback
```

### Specific PR

Target a specific PR by number:

```bash
/address-pr-feedback 42
```

### Autonomous Mode

Run without prompts (useful for automation):

```bash
/address-pr-feedback 42 --afk
```

### PR URL

Use a full GitHub URL:

```bash
/address-pr-feedback https://github.com/owner/repo/pull/42
```

## Workflow Phases

### Phase 1: Collection

Uses the `pr-feedback-collector` agent to:

- Fetch PR review comments via `gh` CLI
- Classify by priority (blocking, important, suggestion, style)
- Extract actionable tasks
- Generate structured feedback document

### Phase 2: Triage

Displays summary for review:

```
## Feedback Triage

**PR**: #42 - Feature title
**Comments**: 8

### Priority Breakdown
- 🚨 Blocking: 1
- ⚠️ Important: 2
- 💡 Suggestions: 3
- 🎨 Style: 2
```

In interactive mode, you can review before proceeding.
In `--afk` mode, auto-proceeds to fix phase.

### Phase 3: Fix

Processes comments in priority order:

1. Blocking issues (must fix)
2. Important issues (should fix)
3. Suggestions (consider)
4. Style issues (optional)

For each comment:

- Analyzes the concern
- Implements code changes
- Updates feedback document with resolution status
- Runs tests to verify

### Phase 4: Report

Generates consolidated summary:

```markdown
## PR Feedback Resolution Summary

**PR**: #42 - Feature title

### Resolution Summary
- 🚨 Blocking: 1/1
- ⚠️ Important: 2/2
- 💡 Suggestions: 3/3
- 🎨 Style: 2/2

**Ready for Re-Review**: ✅
```

## Related Commands

- [`pr-review`](pr-review.md) - Automated PR review
- [`pr-visual`](pr-visual.md) - Visualize PR changes

## See Also

- [Addressing PR Feedback Guide](../../guides/pr-feedback.md) - Complete workflow guide
- [PR Review Guide](../../guides/pr-review.md) - Review workflow patterns
