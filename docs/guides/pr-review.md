# PR Review Tutorial

Perform thorough code reviews using rp1's map-reduce PR analysis. This tutorial walks you through automated review, visual understanding, and feedback handling.

**Time to complete**: ~30-40 minutes

---

## What You'll Learn

- How rp1's map-reduce PR review architecture works
- Running automated PR analysis with confidence gating
- Visualizing PR changes with Mermaid diagrams
- Collecting and addressing reviewer feedback
- Integrating rp1 reviews into team workflows

## Prerequisites

!!! warning "Before You Begin"
    - rp1 installed ([Installation](../getting-started/installation.md))
    - Knowledge base generated (`/knowledge-build`)
    - A PR to review (local branch or GitHub PR)
    - For GitHub features: [`gh` CLI](https://cli.github.com/) installed and authenticated

---

## The Scenario

We'll review a **feature PR** that adds user authentication to an API. This example was chosen because:

- Auth changes touch multiple layers (routes, middleware, database)
- Security implications require careful review
- Multiple files demonstrate the map-reduce approach

**PR**: Branch `feature/user-auth` with 8 files changed, adding JWT-based authentication.

---

## The PR Review Workflow

```mermaid
flowchart TB
    PR[PR Created] --> R[Review + Visual]
    R --> FB[Address Feedback]
    FB --> M[Merge]
```

| Step | Command | Purpose |
|------|---------|---------|
| Review | `pr-review` | Automated analysis with confidence gating (auto-generates visuals for complex PRs) |
| Visualize | `pr-visual` | Manual diagram generation (if needed separately) |
| Address Feedback | [Separate guide](pr-feedback.md) | Collect and fix reviewer comments |

---

## Step 1: Run PR Review

Start the automated review analysis:

=== "Claude Code"

    ```bash
    /pr-review
    ```

    Or specify a target:

    ```bash
    # By branch
    /pr-review feature/user-auth main

    # By PR number
    /pr-review 42

    # By GitHub URL
    /pr-review https://github.com/owner/repo/pull/42
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-review
    ```

    Or specify a target:

    ```bash
    # By branch
    /rp1-dev/pr-review feature/user-auth main

    # By PR number
    /rp1-dev/pr-review 42

    # By GitHub URL
    /rp1-dev/pr-review https://github.com/owner/repo/pull/42
    ```

**What happens:**

rp1's map-reduce PR review:

1. **Splits** the diff into reviewable units (logical file groups)
2. **Maps** each unit to a sub-reviewer agent (parallel analysis)
3. **Reduces** findings through a synthesizer for holistic judgment

```mermaid
flowchart TB
    subgraph Map Phase
        D[PR Diff] --> S[Splitter]
        S --> U1[Unit 1: Routes]
        S --> U2[Unit 2: Middleware]
        S --> U3[Unit 3: Services]
        S --> U4[Unit 4: Tests]
    end

    subgraph Parallel Review
        U1 --> R1[Sub-Reviewer 1]
        U2 --> R2[Sub-Reviewer 2]
        U3 --> R3[Sub-Reviewer 3]
        U4 --> R4[Sub-Reviewer 4]
    end

    subgraph Reduce Phase
        R1 --> SYN[Synthesizer]
        R2 --> SYN
        R3 --> SYN
        R4 --> SYN
        SYN --> REP[Review Report]
    end
```

**What to expect:**

```
🔍 PR Review Started

Target: feature/user-auth → main
Files changed: 8
Additions: +342, Deletions: -28

Phase 1: Splitting diff into review units...
✓ Unit 1: Authentication routes (2 files)
✓ Unit 2: JWT middleware (2 files)
✓ Unit 3: User service (2 files)
✓ Unit 4: Test coverage (2 files)

Phase 2: Parallel sub-reviews...
[████████████████████] 4/4 units analyzed

Phase 3: Synthesizing findings...
```

!!! tip "Checkpoint"
    The splitter organizes files into logical units. If your files are grouped oddly, it may be because they share functionality the splitter detected.

---

## Step 2: Understand Confidence Gating

Each finding has a confidence score that determines how it's reported:

**What to expect:**

```
📊 Findings Summary

Critical Findings (≥65% confidence):
┌────────────────────────────────────────────────────────────────┐
│ 🔴 SECURITY: JWT secret hardcoded in source file              │
│    Location: src/middleware/auth.ts:12                        │
│    Confidence: 92%                                            │
│    "Secret should be loaded from environment variable"        │
└────────────────────────────────────────────────────────────────┘

High Priority (≥65% confidence):
┌────────────────────────────────────────────────────────────────┐
│ 🟠 Missing token expiration check                             │
│    Location: src/middleware/auth.ts:45                        │
│    Confidence: 78%                                            │
│    "Token validation doesn't check exp claim"                 │
└────────────────────────────────────────────────────────────────┘

Medium Priority (≥65% confidence):
┌────────────────────────────────────────────────────────────────┐
│ 🟡 No rate limiting on login endpoint                         │
│    Location: src/routes/auth.ts:28                            │
│    Confidence: 71%                                            │
│    "Login should have rate limiting to prevent brute force"   │
└────────────────────────────────────────────────────────────────┘

Filtered (40-64%, critical/high only investigated):
- Possible SQL injection (45% → investigated → FALSE POSITIVE)
- Missing input validation (52% → investigated → documented)
```

**Confidence thresholds:**

| Confidence | Action |
|------------|--------|
| ≥65% | Included in report |
| 40-64% (critical/high) | Investigation protocol triggered |
| <40% | Excluded from report |

---

## Step 3: Review Fitness Judgment

The synthesizer produces a holistic judgment:

**What to expect:**

```
📋 Fitness Judgment

Verdict: REQUEST_CHANGES

Rationale:
The PR introduces functional authentication but has security
issues that must be addressed before merge:

1. Hardcoded JWT secret (critical, blocking)
2. Missing token expiration check (high, blocking)
3. No rate limiting (medium, recommended)

Positive Observations:
- Good test coverage for happy path
- Clean separation of concerns
- Proper error handling in middleware

Recommended Actions:
1. Move JWT_SECRET to environment variable
2. Add expiration check in validateToken()
3. Consider adding rate limiting to login route

Report: .rp1/work/pr-reviews/feature-user-auth/review.md
```

**Verdict types:**

| Verdict | Meaning |
|---------|---------|
| `APPROVE` | No blocking issues, safe to merge |
| `REQUEST_CHANGES` | Issues must be addressed |
| `BLOCK` | Critical problems, needs rework |

!!! tip "Checkpoint"
    The review report is saved to `.rp1/work/pr-reviews/`. Review it before taking action.

---

## Step 4: Visualize Changes (Auto or Manual)

Visualizations are **automatically generated** during `pr-review` for complex PRs (5+ files, large changes, or architectural modifications). You can also generate them manually:

=== "Claude Code"

    ```bash
    /pr-visual
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual
    ```

**What happens:**

rp1 generates Mermaid diagrams showing:

- File change relationships
- New dependencies introduced
- Data flow modifications
- Component interactions

**What to expect:**

```
📊 PR Visualization

Generating diagrams for: feature/user-auth → main

Diagrams created:
1. File Change Map - shows which files changed and how they relate
2. New Dependencies - shows new imports/dependencies added
3. Auth Flow - shows the authentication data flow

Output: .rp1/work/pr-reviews/feature-user-auth/diagrams.md
```

Example generated diagram:

```mermaid
flowchart TB
    subgraph "New Authentication Flow"
        REQ[Request] --> MW[Auth Middleware]
        MW --> |valid token| ROUTE[Protected Route]
        MW --> |invalid token| ERR[401 Error]

        LOGIN[Login Route] --> SVC[User Service]
        SVC --> DB[(Database)]
        SVC --> JWT[JWT Sign]
        JWT --> RES[Token Response]
    end
```

!!! info "When to Run Manually"
    Run `pr-visual` separately when you want to regenerate diagrams, share visuals without the full review, or explain changes to stakeholders.

---

## Step 5: Address Feedback

After human reviewers comment on your PR, use the feedback workflow to collect and fix their comments systematically.

[Go to Addressing PR Feedback :material-arrow-right:](pr-feedback.md){ .md-button .md-button--primary }

---

## Team Workflow Integration

### Pattern A: Pre-Review with rp1

Run `pr-review` before requesting human review:

```mermaid
flowchart TB
    DEV[Developer] --> PR[Create PR]
    PR --> rp1[rp1 pr-review]
    rp1 --> FIX[Fix Issues]
    FIX --> HUMAN[Request Human Review]
    HUMAN --> MERGE[Merge]
```

**Benefits**: Catch obvious issues before human reviewers spend time.

### Pattern B: Post-Review Feedback Loop

Use rp1 to process and fix human feedback:

```mermaid
flowchart TB
    PR[Create PR] --> HUMAN[Human Review]
    HUMAN --> COLLECT[rp1 pr-feedback-collect]
    COLLECT --> FIX[rp1 pr-feedback-fix]
    FIX --> UPDATE[Push Updates]
    UPDATE --> MERGE[Merge]
```

**Benefits**: Systematic processing of reviewer comments, nothing missed.

### Pattern C: Full rp1 Loop

Combine automated and human review:

```mermaid
flowchart TB
    PR[Create PR] --> AUTO[rp1 pr-review]
    AUTO --> FIX1[Fix Auto Issues]
    FIX1 --> HUMAN[Human Review]
    HUMAN --> COLLECT[pr-feedback-collect]
    COLLECT --> FIX2[pr-feedback-fix]
    FIX2 --> MERGE[Merge]
```

**Benefits**: Most thorough review process, combines AI and human insight.

---

## Summary

You've learned the PR review workflow:

| Step | Command | Output |
|------|---------|--------|
| 1. Review | `pr-review` | Findings with confidence scores |
| 2. Judgment | (automatic) | APPROVE / REQUEST_CHANGES / BLOCK |
| 3. Visualize | `pr-visual` | Mermaid diagrams (auto or manual) |

### Key Concepts

- **[Map-Reduce](../concepts/map-reduce-workflows.md)**: Parallel analysis of diff units, synthesized judgment
- **Confidence Gating**: Only high-confidence findings reported
- **Fitness Judgment**: Holistic assessment, not just issue list

---

## Next Steps

- **Address feedback**: See [Addressing PR Feedback](pr-feedback.md) for the complete feedback workflow
- **Reference docs**: See [pr-review](../reference/dev/pr-review.md), [pr-visual](../reference/dev/pr-visual.md)
- **Understand the architecture**: Learn about [Map-Reduce Workflows](../concepts/map-reduce-workflows.md)
- **Investigate issues**: Use [Bug Investigation](bug-investigation.md) for complex problems

---

## Troubleshooting

??? question "PR review is taking too long"

    Large PRs with many files take longer due to parallel sub-reviews. Consider:

    - Breaking large PRs into smaller chunks
    - Excluding generated files (they're filtered automatically, but patterns may need adjustment)

??? question "Confidence scores seem too low"

    Confidence depends on evidence found in your codebase. Ensure your knowledge base is current:
    ```bash
    /knowledge-build
    ```

??? question "Diagrams aren't rendering"

    Mermaid diagrams require a compatible viewer. The generated markdown works in:

    - GitHub (native support)
    - VS Code with Mermaid extension
    - MkDocs with pymdownx.superfences

??? question "Can I review without GitHub?"

    Yes. `pr-review` and `pr-visual` work with local branches:
    ```bash
    /pr-review feature-branch main
    ```

    Only `pr-feedback-collect` requires GitHub integration.
