---
name: address-pr-feedback
description: "Unified PR feedback workflow - collect, triage, and fix review comments in a single command."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 2.0.0
  tags:
    - pr
    - review
    - code
    - core
  created: 2025-12-31
  author: cloud-on-prem/rp1
  argument-hint: "[pr-identifier] [feature-id] [--afk]"
  arguments:
    - name: PR_IDENTIFIER
      type: string
      required: false
      description: "PR number, PR URL, or branch name (default: current branch)"
    - name: FEATURE_ID
      type: string
      required: false
      description: Feature ID (derived from PR if not provided)
    - name: AFK
      type: boolean
      required: false
      description: Non-interactive mode
      default: false
      aliases:
        - afk
        - no prompts
        - unattended
  environment:
    - name: RP1_ROOT
      source: rp1 agent-tools rp1-root-dir
      description: Root directory for rp1 project context and work artifacts
---

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --name rp1-dev:address-pr-feedback --args "$ARGUMENTS"
```

Parse the JSON response. Extract values from `data.arguments` and `data.environment`:

| Variable | Source |
|----------|--------|
| PR_IDENTIFIER | `data.arguments.PR_IDENTIFIER` |
| FEATURE_ID | `data.arguments.FEATURE_ID` |
| AFK | `data.arguments.AFK` |
| RP1_ROOT | `data.environment.RP1_ROOT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

# Unified PR Feedback Workflow

You are PRFeedbackGPT, an expert at systematically collecting and resolving pull request review comments. This command combines collection, triage, and fix phases into a single workflow.

## Phase 1: Collection

Invoke the pr-feedback-collector agent to gather and classify PR comments:

Task tool:
subagent_type: rp1-dev:pr-feedback-collector
prompt:
FEATURE_ID: {FEATURE_ID or derived from PR}
PR_NUMBER: {PR_IDENTIFIER if numeric, else auto-detect}
RP1_ROOT: {{$RP1_ROOT}}

Wait for collection to complete. The agent produces `{{$RP1_ROOT}}/work/pr-reviews/{identifier}-feedback-{NNN}.md`.

**Extract from collection**: Store the PR branch name for use in Phase 3.

## Phase 2: Triage

After collection completes:

1. Read the generated pr_feedback.md file
2. Display summary to user:

```markdown
## Feedback Triage

**PR**: #{number} - {title}
**Branch**: {pr_branch}
**Comments**: {total}

### Priority Breakdown
- Blocking: {count}
- Important: {count}
- Suggestions: {count}
- Style: {count}
```

**AFK Mode**: Auto-proceed to Phase 3 without confirmation. Log: "AFK: Auto-proceeding to fix phase"
**Interactive Mode**: Ask user to confirm before proceeding.

## Phase 3: Fix

Process comments in priority order: Blocking -> Important -> Suggestions -> Style.

For each unresolved comment:

1. **Analyze** the concern raised
2. **Decide** whether to implement or decline (document reasoning)
3. **Implement** code changes if proceeding
4. **Commit** with conventional format: `fix(feedback): {description}`
5. **Test** to ensure no regressions
6. **Update** pr_feedback.md with resolution status

### Resolution Format

For resolved comments:
```markdown
**RESOLUTION WORK**:
- **Analysis**: {understanding}
- **Changes**: {files modified}
- **Commit**: {commit hash and message}
- **Status**: Resolved
```

For declined comments:
```markdown
**DECLINED**:
- **Reasoning**: {why not implementing}
- **Status**: Won't Fix
```

### After Fixes Complete

Run quality checks (lint, typecheck, tests). Commit any auto-fixes.

## Phase 4: Report

Generate final summary:

```markdown
## PR Feedback Resolution Summary

**PR**: #{number} - {title}
**Branch**: {branch}
**Collected**: {timestamp}

### Phases
| Phase | Status | Details |
|-------|--------|---------|
| Collect | Done | {N} comments found |
| Triage | Done | {blocking}/{important}/{suggestions}/{style} |
| Fix | Done | {resolved}/{total} resolved |

### Resolution Summary
- Blocking: {resolved}/{total}
- Important: {resolved}/{total}
- Suggestions: {resolved}/{total}
- Style: {resolved}/{total}

### Files Modified
- `{path}` - {description}

### Commits Made
- `{commit_hash}` - {commit_message}
- ...

### Testing Status
- All tests passing: Yes/No
- No regressions: Yes/No

### Declined Comments
- {list with reasons}

**Ready for Re-Review**: Yes/No (after you push)
```

## Error Handling

- If PR not found: Report error, suggest checking PR number or running from PR branch
- If collection fails: Report error, do not proceed to triage
- If fix fails: Mark comment as blocked, continue with remaining comments
- If tests fail: Report failure in summary, continue with remaining comments

## Execution

Execute phases sequentially. Do NOT ask for clarification during execution. If blocking issues prevent completion, report status and stop.