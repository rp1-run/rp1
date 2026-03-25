# build

End-to-end feature workflow orchestrator. Runs the complete 6-step lifecycle (requirements → design → tasks → build → verify → archive) in a single command.

---

## Synopsis

=== "Claude Code"

    ```bash
    /build <feature-id> [requirements...] [--afk] [--git-commit] [--git-push] [--git-pr]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build <feature-id> [requirements...] [--afk] [--git-commit] [--git-push] [--git-pr]
    ```

## Description

The `build` command is the **primary entry point** for feature development. It orchestrates all workflow steps automatically with smart resumption — detecting existing artifacts and continuing from where you left off.

### Key Features

- **Single command**: No need to run individual steps manually
- **Smart resumption**: Detects existing artifacts and resumes from the right step
- **AFK mode**: Run autonomously without user interaction
- **Safe defaults**: No git operations unless explicitly requested via flags
- **Opt-in git operations**: Use `--git-*` flags for commit, push, PR
- **Builder-reviewer architecture**: Quality-gated implementation with feedback loops

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier (used for directory and branch names) |
| `REQUIREMENTS` | `$2` | No | `""` | Initial requirements text or context |
| `--afk` | flag | No | `false` | Non-interactive mode (auto-proceed, no prompts) |
| `--git-commit` | flag | No | `false` | Commit changes after build |
| `--git-push` | flag | No | `false` | Push branch to remote |
| `--git-pr` | flag | No | `false` | Create PR (implies --git-push and --git-commit) |

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
- Changes remain in working directory unless `--git-commit` is specified

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
    /rp1-dev-build user-authentication
    ```

### With Initial Requirements

=== "Claude Code"

    ```bash
    /build dark-mode "Add dark mode toggle to settings page with system preference detection"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build dark-mode "Add dark mode toggle to settings page with system preference detection"
    ```

### AFK Mode (Autonomous)

=== "Claude Code"

    ```bash
    /build api-refactor --afk
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build api-refactor --afk
    ```

!!! note "Your code is safe"
    Even in AFK mode, all changes are isolated to a separate branch. Nothing is merged until you review and approve.

### With PR Creation

=== "Claude Code"

    ```bash
    /build new-feature --git-pr
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build new-feature --git-pr
    ```

### With Git Commit Only

=== "Claude Code"

    ```bash
    /build new-feature --git-commit
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build new-feature --git-commit
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

## Codex Build Output

Codex is a first-class rp1 platform alongside Claude Code and OpenCode. Skills are invoked with `$skill-name` syntax (e.g., `$rp1-dev-build`), and project-level instructions are delivered via `AGENTS.md` (the Codex equivalent of `CLAUDE.md` for Claude Code).

### Build Layout

Each skill produces the following artifacts under `dist/codex/`:

| Artifact | Path | Purpose |
|----------|------|---------|
| Skill instructions | `skills/<namespace>:<skill>/SKILL.md` | Skill prompt loaded by Codex on `$skill-name` invocation |
| Agent manifest | `skills/<namespace>:<skill>/agents/openai.yaml` | Declares sub-agents with `allow_implicit_invocation: false` |
| Agent TOML files | `agents/rp1/<agent-name>.toml` | Per-agent config with `developer_instructions` |
| Config entries | `config.toml` (fenced section) | Slim `[agents.*]` registry entries for `~/.codex/config.toml` |

### Install Paths

All Codex artifacts install to user-level paths under `~/.codex/`:

| Artifact | Install Path |
|----------|-------------|
| Skills | `~/.codex/skills/<namespace>:<skill-name>/SKILL.md` |
| Agent TOML files | `~/.codex/agents/rp1/<agent-name>.toml` |
| Agent registry | `~/.codex/config.toml` (fenced section merged) |

### Invocation

Codex skills are invoked with `$skill-name` syntax, not the `/command` syntax used by Claude Code and OpenCode:

| Platform | Invocation |
|----------|-----------|
| Claude Code | `/build` |
| OpenCode | `/rp1-dev-build` |
| Codex | `$rp1-dev-build` |

### Instruction File

Codex uses `AGENTS.md` as its project-level instruction file. Running `rp1 init` for Codex generates or appends to `AGENTS.md` in the project root with KB loading instructions and rp1 conventions. This is equivalent to the `CLAUDE.md` file used by Claude Code.

### Parameter Handling

Codex does not have native argument substitution (`$1`, `$ARGUMENTS`). During the build, the `param_transform` filter rewrites parameter references into instructional text that Codex can model-extract from the user's prompt:

| Source | Codex Output |
|--------|-------------|
| `$1` | Descriptive text: "the value of the first argument (extracted from the user's prompt)" |
| `$ARGUMENTS` | Descriptive text: "the arguments provided by the user in their prompt" |

Parameter tables in skills are preserved as-is since they serve as instructional text for the model. The model extracts parameter values from the user's natural language prompt rather than relying on positional substitution.

### Main Config Entries

Slim `[agents.*]` sections are generated for inclusion in `~/.codex/config.toml`. Each entry contains only two fields:

```toml
[agents.task-builder]
description = "Implements tasks from feature task lists"
config_file = "./agents/rp1/task-builder.toml"
```

### Per-Agent TOML Files

Individual agent configuration files are generated at `~/.codex/agents/rp1/{name}.toml`. Each file contains the agent's model and full instructions using multiline syntax:

```toml
model = "o4-mini"
developer_instructions = """
Agent instructions here...
"""
```

### Content Transformations

During the Codex build, agent and skill content undergoes four transformations in order:

| Step | Input | Output | Example |
|------|-------|--------|---------|
| Namespace transform | `/rp1-dev:build` | `$rp1-dev-build` | Explicit plugin-qualified references |
| Plain slash-command transform | `/build` | `$rp1-dev-build` | Auto-discovered from `plugins/*/skills/*/` |
| Parameter transform | `$1`, `$ARGUMENTS` | Instructional text | Model-extracted parameters |
| Sub-agent ref translation | `rp1-dev:task-builder` | Codex role name | Agent name mapping |

The plain slash-command transformation auto-discovers all skill names from plugin directories. Adding a new skill is automatically picked up on the next build without any configuration.

Semantic `{% dispatch_agent %}` blocks render to Codex `Spawn agent:` instructions with explicit `fork_context: false` by default. Use `context: "inherit"` in the source tag only when a child agent truly needs parent conversation history.

### Installation

Running `rp1 install codex` copies skill directories to `~/.codex/skills/`, per-agent TOML files to `~/.codex/agents/rp1/`, and merges the slim config entries into `~/.codex/config.toml`. The managed section now also installs a Codex `notify` command that routes startup notices through `rp1 agent-tools codex-notify`. Uninstallation removes only rp1-managed artifacts (skill directories prefixed with `rp1-*`, the `~/.codex/agents/rp1/` directory, and the fenced Codex config section) while preserving user-created and third-party Codex configuration.

For a detailed breakdown of validated Codex capabilities and platform differences, see the [Codex Capabilities](codex-capabilities.md) reference.

## See Also

- [Feature Development Guide](../../guides/feature-development.md) - End-to-end feature workflow and build guidance
- [Builder-Reviewer Agents](../../concepts/builder-reviewer-agents.md) - How the build step works
