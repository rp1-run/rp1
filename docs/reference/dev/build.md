# build

End-to-end feature workflow orchestrator. Runs the complete 6-step lifecycle (requirements → design → build → verify → follow-up → archive) in a single command.

---

## Synopsis

=== "Claude Code"

    ```bash
    /build feature-id [requirements] [--afk] [--no-worktree] [--push] [--create-pr]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build feature-id [requirements] [--afk] [--no-worktree] [--push] [--create-pr]
    ```

## Description

The `build` command is the **primary entry point** for feature development. It orchestrates all workflow steps automatically with smart resumption — detecting existing artifacts and continuing from where you left off.

### Key Features

- **Single command**: No need to run individual steps manually
- **Smart resumption**: Detects existing artifacts and resumes from the right step
- **AFK mode**: Run autonomously without user interaction
- **Worktree isolation**: Changes happen in a separate branch (default for full workflow)
- **Builder-reviewer architecture**: Quality-gated implementation with feedback loops

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier (used for directory and branch names) |
| `REQUIREMENTS` | `$2` | No | `""` | Initial requirements text or context |
| `--afk` | flag | No | `false` | Non-interactive mode (auto-proceed, no prompts) |
| `--no-worktree` | flag | No | `false` | Disable worktree isolation |
| `--push` | flag | No | `false` | Push branch after completion |
| `--create-pr` | flag | No | `false` | Create PR after completion (implies --push) |

## Workflow Steps

The command orchestrates these steps:

| Step | What Happens | Artifact |
|------|--------------|----------|
| 1. Requirements | Collect and document requirements | `requirements.md` |
| 2. Design | Generate technical design + tasks | `design.md`, `tasks.md` |
| 3. Build | Implement via builder-reviewer | Code changes |
| 4. Verify | Validate against acceptance criteria | `verification-report.md` |
| 4.1 User Review | Manual verification checkpoint | User decision |
| 5. Follow-up | Add more work if needed | Loops to Build |
| 6. Archive | Store completed feature | Archived artifacts |

## Interactive Mode (Default)

By default, `/build` runs in **interactive mode**, presenting approval gates between major workflow stages. These gates allow you to review artifacts, provide feedback, and control workflow progression.

### Approval Gates

| Gate | After | Options | Purpose |
|------|-------|---------|---------|
| Gate 1 | Requirements | Continue, Revise, Stop | Review requirements before design |
| Gate 2 | Design | Continue, Revise, Stop | Review design and task breakdown |
| Gate 3 | Tasks | Continue, Revise, Stop | Review implementation plan |
| Gate 4 | Build | Continue, Add Task, Stop | Review implementation before verify |

### Gate Options

At each gate, you can choose:

| Option | Behavior |
|--------|----------|
| **Continue** | Proceed to the next workflow stage |
| **Revise** | Provide feedback and re-run the current stage |
| **Stop** | Exit the workflow (all artifacts preserved) |
| **Add Task** | (Gate 4 only) Add additional implementation work |

### Feedback Loop

When you select **Revise**, you're prompted for feedback. This feedback is incorporated into the re-execution:

| Stage | How Feedback is Used |
|-------|---------------------|
| Requirements | Appended to REQUIREMENTS parameter |
| Design | Appended to requirements.md as addendum |
| Tasks | Passed as UPDATE_CONTEXT to feature-tasker |
| Build | Creates ad-hoc task for builder-reviewer |

### AFK Mode

Use `--afk` to bypass all gates and run the workflow autonomously:

```bash
/build my-feature --afk
```

In AFK mode:

- All approval gates are skipped
- Workflow proceeds automatically through all stages
- Changes remain isolated to a separate branch

## Smart Resumption

The command detects existing artifacts and resumes from the appropriate step:

| Existing Artifacts | Resumes From |
|-------------------|--------------|
| None | Requirements |
| `requirements.md` | Design |
| `requirements.md` + `design.md` | Build |
| All + `tasks.md` (completed) | Verify |
| All + `verification-report.md` | Archive |

If you stopped at a gate, resuming `/build` continues from the next stage.

## Examples

### Start a New Feature

=== "Claude Code"

    ```bash
    /build user-authentication
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build user-authentication
    ```

### With Initial Requirements

=== "Claude Code"

    ```bash
    /build dark-mode "Add dark mode toggle to settings page with system preference detection"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build dark-mode "Add dark mode toggle to settings page with system preference detection"
    ```

### AFK Mode (Autonomous)

=== "Claude Code"

    ```bash
    /build api-refactor --afk
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build api-refactor --afk
    ```

!!! note "Your code is safe"
    Even in AFK mode, all changes are isolated to a separate branch. Nothing is merged until you review and approve.

### With PR Creation

=== "Claude Code"

    ```bash
    /build new-feature --create-pr
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/build new-feature --create-pr
    ```

## Output

**Location:** `$RP1_ROOT/work/features/<feature-id>/`

**Contents:**

- `requirements.md` - Feature requirements
- `design.md` - Technical design
- `tasks.md` - Implementation tasks
- `verification-report.md` - Verification results
- `field-notes.md` - Implementation notes (if any)

## Related Commands

| Command | When to Use |
|---------|-------------|
| [`build-fast`](build-fast.md) | Small, well-scoped tasks that don't need full planning |
| [`feature-edit`](feature-edit.md) | Mid-stream changes during build |
| [`feature-unarchive`](feature-unarchive.md) | Restore archived features |
| [`validate-hypothesis`](validate-hypothesis.md) | Test risky design assumptions |

## See Also

- [Feature Development Guide](../../guides/feature-development.md) - Complete tutorial
- [Interactive Build Guide](../../guides/interactive-build.md) - Gate interaction patterns and feedback workflows
- [Builder-Reviewer Agents](../../concepts/builder-reviewer-agents.md) - How the build step works
- [Parallel Development](../../guides/parallel-development.md) - Worktree isolation details
