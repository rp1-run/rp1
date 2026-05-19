# build

End-to-end feature workflow orchestrator. Runs the Build v2 lifecycle
(`requirements` -> `planning` -> `implementation` -> `release`) in a single
command.

---

## Synopsis

=== "Claude Code"

    ```bash
    /build <feature-id> [requirements...] [PHASE_PLAN_PATH=...] [PHASE_ID=...] [--afk] [--git-commit] [--git-push] [--git-pr]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build <feature-id> [requirements...] [PHASE_PLAN_PATH=...] [PHASE_ID=...] [--afk] [--git-commit] [--git-push] [--git-pr]
    ```

=== "Codex"

    ```bash
    $rp1-dev-build <feature-id> [requirements...] [PHASE_PLAN_PATH=...] [PHASE_ID=...] [--afk] [--git-commit] [--git-push] [--git-pr]
    ```

## Description

The `build` command is the **primary entry point** for feature development. It
can reopen the active run for the same `FEATURE_ID` and continue from the next
user-meaningful phase. Resume decisions come from recorded workflow state and
registered artifacts, not from guessing which files happen to exist.

When the request expands beyond a single independently executable feature,
`/build` stops and redirects to `/phase-plan` instead of generating new tracker
or milestone artifacts.

### Key Features

- **Four parent phases**: Arcade shows `requirements`, `planning`,
  `implementation`, and `release`
- **Deterministic resumption**: Reuses only non-terminal `build` runs for the
  same canonical project and `FEATURE_ID`, then resumes from workflow state
- **AFK mode**: Run autonomously without user interaction
- **Safe defaults**: No git operations unless explicitly requested via flags
- **Opt-in git operations**: Use `--git-*` flags for commit, push, PR
- **Builder-reviewer architecture**: Quality-gated implementation with feedback loops
- **Scoped cleanup**: Automatic comment cleanup runs only when rp1 can prove the
  safe cleanup boundary
- **Readiness aggregation**: Final release readiness separates blockers,
  warnings, evidence, and manual verification items

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `FEATURE_ID` | `$1` | Yes | - | Feature identifier (used for directory and branch names) |
| `REQUIREMENTS` | `$2` | No | `""` | Initial requirements text or context |
| `PHASE_PLAN_PATH` | inline token | No | `""` | Optional phase-plan artifact path copied from a child handoff |
| `PHASE_ID` | inline token | No | `""` | Optional parent phase ID copied from a child handoff |
| `--afk` | flag | No | `false` | Non-interactive mode (auto-proceed, no prompts) |
| `--git-commit` | flag | No | `false` | Commit changes after build |
| `--git-push` | flag | No | `false` | Push branch to remote |
| `--git-pr` | flag | No | `false` | Create PR (implies --git-push and --git-commit) |

### Optional Phase Context

When a child feature comes from `phase-plan.md`, append the handoff tokens to
the request or pass them through host-specific argument binding:

```bash
/build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2
```

`/build` preserves those values into `requirements.md` as a durable
`## Planning Traceability` section instead of leaving them as freeform prose.

## Workflow Lifecycle

The command reports four broad parent phases. Implementation and review details
appear under those phases instead of adding extra parent steps.

| Parent Phase | What Happens | Primary Outputs |
|--------------|--------------|-----------------|
| `requirements` | Collect requirements, scope, constraints, assumptions, and phase-plan traceability | `requirements.md` |
| `planning` | Produce design, validate hypotheses when present, then generate the accepted task plan once | `design.md`, `tasks.md`, `tasks.json` |
| `implementation` | Execute planned task units through builder-reviewer loops, run mechanical checks, verify the feature, and clean comments only inside a proven scope | Code changes, validation summaries, cleanup artifacts |
| `release` | Present final readiness, manual verification items, archive choice, and add-task option | `build-readiness.md`, optional archived outputs |

Machine task planning consumes `features/<feature-id>/tasks.json`. `tasks.md`
is the reviewer-facing companion artifact and must mirror the same task IDs, but
Markdown parsing is not the Build v2 execution contract.

### Advanced: Scoped Comment Cleanup Artifacts

This section keeps exact generated artifact names because they are useful when
auditing why automatic comment cleanup did or did not run.

During `implementation`, `/build` snapshots the repository state before the
first implementation unit runs. After builders, reviewers, explicit
documentation follow-ups, and any checkpoint-added tasks finish, it generates
the cleanup handoff before readiness aggregation.

The feature work directory can contain:

- `change-manifest-baseline.json` - build-start code root, git revision, and
  dirty paths
- `change-manifest-001.json` - cleanup-owned files and line ranges, when
  supported changes are safe to classify
- `change-manifest-status.json` - created/skipped status, file counts,
  owned-line counts, dirty-path metadata, and skip reason

`/build` dispatches the cleanup agent only when the generated manifest is
`created` and non-empty. The cleaner receives only `CHANGE_MANIFEST` and
`CODE_ROOT`; `/build` does not pass branch names, commit ranges, dirty-state
labels, or implementation-authored hunks as cleanup scope.

If manifest generation skips, readiness aggregation records a warning result with
`files_checked: 0`, the status artifact path, and the skip reason. Common skip
reasons include `no_supported_source_hunks`,
`pre_existing_dirty_paths_overlap`, `missing_baseline`,
`invalid_baseline`, `baseline_code_root_mismatch`,
`scope_outside_code_root`, `invalid_scope`, and `unsupported_scope`.

Task builders do not calculate, merge, create, or hand off comment cleanup
manifests. Review the generated manifest and status artifacts only when you need
to audit why a file or line range was eligible for automatic cleanup.

### Oversized Scope Redirect

After `requirements.md` is written, `feature-architect` checks whether the work
still fits one feature. If the result is `needs_phase_planning`, `/build`:

- stops before planning, task generation, and implementation
- tells you to run `/phase-plan features/<feature-id>/requirements.md`
- preserves the generated `requirements.md` so phase planning has a concrete
  source artifact to work from

This is the supported path for initiative-sized work. rp1 no longer revives
new `tracker.md` or `milestone-*.md` artifacts for that redirect.

## Interactive Mode (Default)

By default, `/build` runs in **interactive mode**, presenting approval gates
between major workflow stages. These gates allow you to review artifacts,
provide feedback, and control workflow progression.

### Approval Gates

| Gate | After | Options | Purpose |
|------|-------|---------|---------|
| Requirements | `requirements` | Continue, Revise, Review feedback from Arcade, Stop | Review requirements before planning |
| Planning | `planning` | Continue, Revise, Review feedback from Arcade, Stop | Review design, hypotheses, `tasks.md`, and `tasks.json` before implementation |
| Implementation | `implementation` | Release, Add Task, Review feedback from Arcade, Stop | Review validation outcomes, warnings, and manual verification expectations |
| Release | `release` | Add task, Archive, Review feedback from Arcade, Complete without archive, Stop | Complete release, archive only when chosen, or return to implementation |

### Gate Options

At each gate, you can choose:

| Option | Behavior |
|--------|----------|
| **Continue** | Proceed to the next workflow phase |
| **Release** | Enter the release gate when readiness allows it |
| **Revise** | Provide feedback and re-run the current phase |
| **Stop** | Exit the workflow (all artifacts preserved) |
| **Add Task** | Add implementation work and return to `implementation` |
| **Review feedback from Arcade** | Process Arcade feedback, then return to the same gate |
| **Archive** | Run `feature-archiver`; release completes only after archive succeeds |
| **Complete without archive** | Complete release with `archive_status: "declined"` |

### Feedback Loop

When you select **Revise**, you're prompted for feedback. This feedback is incorporated into the re-execution:

| Phase | How Feedback is Used |
|-------|---------------------|
| Requirements | Appended to `REQUIREMENTS` context |
| Planning | Appended to planning context; task regeneration records the reason |
| Implementation | Creates or updates task work for builder-reviewer |
| Release | `Add Task` returns to implementation; archive decline does not run archiver |

### AFK Mode

Use `--afk` to bypass all gates and run the workflow autonomously:

```bash
/build my-feature --afk
```

In AFK mode:

- All approval gates are skipped
- Workflow proceeds automatically through all phases
- Release defaults to archive: when readiness allows release, `feature-archiver`
  runs automatically and release completes only after the archive is registered
- Changes remain in working directory unless `--git-commit` is specified
- Rejected high-impact hypotheses, missing required validation, or blocking
  readiness failures do not silently mark the feature ready

## Smart Resumption

`build` resumes from recorded workflow progress before it starts more phase
work:

1. rp1 identifies the project and the feature you asked to build.
2. If that feature already has an active build run, that run is resumed.
   Completed runs are never reopened automatically.
3. rp1 checks the recorded workflow phase, registered outputs, and recent
   progress.
4. `/build` resumes from the next required parent phase, or waits with a
   recovery message when required outputs are missing or inconsistent.

This means linked-worktree invocations still reuse the owning repository's run
and keep artifacts under that repository's rp1 work directory.

Resume is state-first:

| Registered State | Resumes From |
|------------------|--------------|
| No completed parent phase | `requirements` |
| `requirements` completed | `planning` |
| `planning` completed with registered `design.md`, `tasks.md`, and `tasks.json` | `implementation` |
| `implementation` completed with readiness context available | `release` |
| Missing required registered output | Waiting gate for the relevant phase |

If registered workflow progress and local files disagree, registered workflow
progress wins and `/build` reports the contract gap instead of inferring
success from filenames.

If you stopped at a gate, resuming `/build` continues from the relevant parent
phase or waiting decision.

If the previous run stopped with an oversized-scope redirect, resume only after
you have either narrowed the feature back to single-feature scope or created a
phase plan from the saved `requirements.md`.

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

=== "Codex"

    ```bash
    $rp1-dev-build user-authentication
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

=== "Codex"

    ```bash
    $rp1-dev-build dark-mode "Add dark mode toggle to settings page with system preference detection"
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

=== "Codex"

    ```bash
    $rp1-dev-build api-refactor --afk
    ```

!!! note "Your code is safe"
    Even in AFK mode, git operations remain opt-in through `--git-*` flags.

### Start a Child Feature from a Phase Plan

=== "Claude Code"

    ```bash
    /build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2
    ```

=== "Codex"

    ```bash
    $rp1-dev-build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2
    ```

### With PR Creation

=== "Claude Code"

    ```bash
    /build new-feature --git-pr
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-build new-feature --git-pr
    ```

=== "Codex"

    ```bash
    $rp1-dev-build new-feature --git-pr
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

=== "Codex"

    ```bash
    $rp1-dev-build new-feature --git-commit
    ```

## Output

**Location:** `.rp1/work/features/<feature-id>/`

In a linked worktree, rp1 stores feature artifacts under the owning repository's
rp1 work directory so resuming from another checkout still finds the same run
history.

**Contents:**

- `requirements.md` - Feature requirements
  - includes `## Planning Traceability` when phase context is supplied
- `design.md` - Technical design
- `tasks.md` - Human-readable implementation and documentation task plan
- `tasks.json` - Machine-readable task plan used during implementation
- `verification-report.md` - Requirement and acceptance evidence when produced
- `build-readiness.md` - Final readiness result with blockers, warnings,
  manual items, and evidence
- `field-notes.md` - Implementation notes (if any)
- `change-manifest-baseline.json` - build-start cleanup baseline
- `change-manifest-001.json` - generated cleanup boundary, when created
- `change-manifest-status.json` - cleanup manifest status and skip reason

Documentation tasks in `tasks.json` are completed only through a supported
workflow. If no supported documentation workflow is available, `/build` carries
them into readiness and release as explicit manual or follow-up items.

## Build Platform Targets And Bundle Manifests

The historical build command name is `rp1 build:opencode`, but the build
pipeline now targets all generated rp1 host bundles through `--platform`.

| Platform target | Output directory | Primary bundle purpose |
|-----------------|------------------|------------------------|
| `opencode` | `dist/opencode/` | OpenCode commands, skills, agents, and plugin metadata |
| `claude-code` | `dist/claude-code/` | Claude Code plugin artifacts |
| `codex` | `dist/codex/` | Codex skills, agents, config entries, and `AGENTS.md` material |
| `copilot` | `dist/copilot/` | GitHub Copilot CLI plugin artifacts |
| `gemini` | `dist/gemini/` | Gemini CLI extension assets |
| `all` | all directories above | Full platform artifact set |

Build Gemini directly or as part of the full platform set:

```bash
rp1 build:opencode --platform gemini
rp1 build:opencode --platform all
```

The Gemini target is a first-class Gemini extension target. It writes plugin
subdirectories such as `dist/gemini/base/` and `dist/gemini/dev/`, with
generated command TOML under `commands/rp1-<plugin>/`, packaged skills under
`skills/`, packaged agents under `agents/`, and per-plugin lifecycle files:
`GEMINI.md`, `gemini-extension.json`, `manifest.json`, and
`support-matrix.json`.

`dist/gemini/bundle-manifest.json` is the top-level manifest used by bundle
embedding and lifecycle commands. It records platform metadata, command entries,
skill entries, agent entries, and verbatim files such as each plugin's
`support-matrix.json`. Gemini platform metadata keeps the `@lobehub/icons`
`Gemini` mono icon requirement.

The Gemini support matrix is separate from generated asset presence.
The current matrix has 15 `supported` workflow rows and 0 `unsupported` rows.
`rp1 verify gemini --workflow <workflow-id>` reports the first-class Gemini
evidence source for a workflow row.

## Related Commands

| Command | When to Use |
|---------|-------------|
| [`phase-plan`](phase-plan.md) | Initiative-sized work that needs durable delivery slices before feature execution |
| [`build-fast`](build-fast.md) | Small, well-scoped tasks that don't need full planning |
| [`feature-edit`](feature-edit.md) | Mid-stream changes during build |
| [`feature-unarchive`](feature-unarchive.md) | Restore archived features |
| [`validate-hypothesis`](validate-hypothesis.md) | Test risky design assumptions |

## Codex Build Output

Codex is a first-class rp1 platform alongside Claude Code, OpenCode, GitHub
Copilot CLI, and the Gemini extension target. Skills are invoked
with `$skill-name` syntax (e.g., `$rp1-dev-build`), and project-level
instructions are delivered via `AGENTS.md` (the Codex equivalent of `CLAUDE.md`
for Claude Code).

### Advanced: Codex Build Artifact Layout

This section is for maintainers debugging Codex installation or generated
prompt artifacts. Normal Codex users only need the `$rp1-dev-build` invocation
above.

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

### Advanced: Parameter Handling

This maintainer detail keeps the exact Codex build-filter name because it is
useful when auditing generated Codex prompt output.

Codex does not have native argument substitution (`$1`, `$ARGUMENTS`). During the build, the `param_transform` filter rewrites parameter references into instructional text that Codex can model-extract from the user's prompt:

| Source | Codex Output |
|--------|-------------|
| `$1` | Descriptive text: "the value of the first argument (extracted from the user's prompt)" |
| `$ARGUMENTS` | Descriptive text: "the arguments provided by the user in their prompt" |

Parameter tables in skills are preserved as-is since they serve as instructional text for the model. The model extracts parameter values from the user's natural language prompt rather than relying on positional substitution.

### Advanced: Main Config Entries

This maintainer detail keeps generated agent names because they appear in the
Codex config files installed under `~/.codex/`.

Slim `[agents.*]` sections are generated for inclusion in `~/.codex/config.toml`. Each entry contains only two fields:

```toml
[agents.task-builder]
description = "Implements tasks from feature task lists"
config_file = "./agents/rp1/task-builder.toml"
```

### Advanced: Per-Agent TOML Files

Individual agent configuration files are generated at `~/.codex/agents/rp1/{name}.toml`. Each file contains the agent's model and full instructions using multiline syntax:

```toml
model = "o4-mini"
developer_instructions = """
Agent instructions here...
"""
```

### Advanced: Content Transformations

This contributor detail keeps source tag and context names so prompt authors
can audit host-specific prompt build behavior.

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

Use the same workflow name on Codex with the `$rp1-dev-build` form.

## See Also

- [Feature Development Guide](../../guides/feature-development.md) - End-to-end feature workflow and build guidance
- [Builder-Reviewer Agents](../../concepts/builder-reviewer-agents.md) - How the build step works
