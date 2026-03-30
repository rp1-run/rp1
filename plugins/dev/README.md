# rp1-dev: Development Workflow Automation

Development-focused plugin providing feature workflows, code quality tools, PR management, and testing capabilities.

## Dependencies

**Requires**: `rp1-base >= 2.0.0`

The development tools in this plugin depend on core functionality provided by rp1-base. You must have the base plugin installed first.

## Installation

Install base plugin first (required dependency):
```bash
/plugin install rp1-base
```

Then install dev plugin:
```bash
/plugin install rp1-dev
```

## Commands (17)

### Project Onboarding (4)
- `/blueprint [prd-name]` - Guided wizard to capture project vision via charter + PRDs
- `/blueprint-archive <prd-name>` - Archive completed PRD with associated features
- `/blueprint-audit <prd-name>` - Audit PRD against implementation status and guide lifecycle decisions
- `/bootstrap [project-name]` - Bootstrap a new project with charter discovery and tech stack scaffolding

**Blueprint Flow** (for brownfield projects):
```bash
/blueprint
```

**Named PRD Flow** (creates additional PRD, requires charter):
```bash
/blueprint mobile-app
/blueprint api
```

The blueprint command creates a two-tier document hierarchy:
1. **Charter** (`{{$RP1_KB_ROOT}}/charter.md`) - Project-level "why" and "who"
2. **PRDs** (`{{$RP1_WORK_ROOT}}/prds/<name>.md`) - Surface-specific "what" that inherits from charter

**Bootstrap Flow** (for greenfield projects):
```bash
/bootstrap my-new-app
```

The bootstrap command creates a complete runnable project from scratch:
1. **Charter Interview** - 5 questions to capture your project vision
2. **Tech Stack Selection** - 5 questions to determine language, framework, and tooling
3. **Best Practices Research** - Fetches current versions and patterns
4. **Project Scaffolding** - Generates runnable code, tests, and configuration

**What bootstrap creates**:
- `.rp1/context/charter.md` - Project charter from interview
- `.rp1/context/preferences.md` - Tech decisions and rationale
- `AGENTS.md` and `CLAUDE.md` - AI assistant configuration
- `README.md` - Getting started guide
- Source code, tests, and package manifest

**Non-empty directory handling**: When run in a directory with existing files, bootstrap prompts for confirmation and creates the project in a new subdirectory to avoid conflicts.

### Feature Development (4)
- `/build feature-id [--afk] [--git-commit] [--git-push] [--git-pr]` - Complete 6-step feature development workflow
- `/feature-edit feature-id <edit-description>` - Incorporate mid-stream changes during build
- `/feature-unarchive feature-id` - Restore archived feature to active features
- `/validate-hypothesis feature-id` - Validate design assumptions

**Use /build for Feature Development**:
```bash
/build my-feature                 # Interactive mode - no git operations (safe default)
/build my-feature --afk           # Autonomous mode - no user interaction
/build my-feature --git-commit    # Commit changes after build
/build my-feature --git-pr        # Full workflow: commit, push, and create PR
```

The `/build` command orchestrates the complete 6-step feature development pipeline:
1. **Requirements** - Gather and document requirements
2. **Design** - Create technical design with auto-generated tasks
3. **Build** - Implement via builder-reviewer architecture
4. **Verify** - Validate against acceptance criteria
5. **Archive** - Archive completed feature artifacts
6. **Follow-up** - Handle documentation updates and remaining tasks

**Smart Resumption**: `/build` detects existing artifacts and resumes from the appropriate step. If requirements.md exists, it skips to design. If design.md exists, it skips to build.

**Note**: Individual step commands (`/feature-requirements`, `/feature-design`, `/feature-tasks`, `/feature-build`, `/feature-verify`, `/feature-archive`) are no longer available as standalone commands. Use `/build` which orchestrates all steps automatically.

**Supporting Commands**:
```bash
/validate-hypothesis my-feature   # Validate design assumptions before build
/feature-edit my-feature "Discovery: API doesn't support pagination"  # Mid-stream changes
/feature-unarchive my-feature     # Restore archived feature
```

### Code Quality (5)
- `/code-check [feature-id]` - Fast code hygiene validation (lints, formatters, tests, coverage)
- `/code-investigate [problem-description...]` - Bug investigation and root cause analysis
- `/code-audit [feature-id]` - Code quality and pattern analysis
- `/code-clean-comments` - Remove unnecessary comments
- `/build-fast [development-request...] [--afk] [--confirm-plan] [--review] [--git-commit] [--git-push]` - Quick iteration development with scope gating and optional review

**Examples**:
```bash
/build-fast "Fix authentication bug in login flow"
/build-fast "Add input validation" --confirm-plan    # Review plan before implementation
/build-fast "Refactor auth module" --review          # Enable task-reviewer validation
/build-fast "Update API endpoints" --confirm-plan --review  # Both checkpoints
/code-investigate "Users report timeout errors on large file uploads"
```

**Build-fast flags**:
- `--confirm-plan`: Enable plan review checkpoint before implementation and post-implementation review
- `--review`: Enable task-reviewer validation after implementation (single retry on failure)
- `--afk`: Non-interactive mode (skips all confirmation prompts)

### PR Management (3)
- `/pr-review` - Comprehensive pull request review (supports CI/CD mode)
- `/address-pr-feedback [pr-number | pr-url | branch]` - Unified PR feedback workflow: collect, triage, and fix review comments
- `/pr-visual` - Visualize pull request changes

**CI/CD Mode**: The `pr-review` command supports automated execution in CI/CD pipelines:

```yaml
# .rp1/config/pr-review.yaml
enabled: true
verdict: auto
add_comments: true
```

When running in GitHub Actions (or other CI platforms), the command:
- Automatically detects CI context from environment variables
- Posts reviews and inline comments directly to PRs
- Deduplicates comments across multiple runs
- Respects human reviewer comments

See the [Remote PR Review documentation](https://rp1.run/guides/remote-pr-review/) for setup instructions.

## Builder-Reviewer Architecture (v4.0)

The build step of `/build` uses a **builder-reviewer architecture** for improved accuracy and reliability:

**Architecture**:
1. **Minimal Orchestrator**: Coordinates task flow without loading KB or codebase context
2. **Task Builder Agent**: Implements tasks with full context (KB, PRD, design, tasks)
3. **Task Reviewer Agent**: Verifies implementation for discipline, accuracy, completeness, and quality

**Key Features**:
- **Adaptive Task Grouping**: Simple tasks grouped (2-3), medium/complex tasks individual
- **Single Retry**: Failed tasks retry once with reviewer feedback before escalation
- **Configurable Failure Handling**: `ask` mode (default) pauses for guidance, `auto` mode marks blocked and continues
- **Complexity Tags**: Tasks can be tagged `[complexity:simple|medium|complex]` for grouping

**Git Operations** (all opt-in):
- `--git-commit`: Commit changes atomically with conventional format (default: disabled)
- `--git-push`: Push branch to remote (default: disabled)
- `--git-pr`: Create PR (implies --git-push, --git-commit)

## Agents (20)

This plugin provides specialized agents for development workflows:

| Agent | Purpose |
|-------|---------|
| task-builder | Implements tasks with full context, writes implementation summaries |
| task-reviewer | Verifies builder work across 4 dimensions, returns SUCCESS/FAILURE |
| feature-tasker | Generates tasks from design, supports incremental updates |
| blueprint-wizard | Captures project vision through charter and PRD documents |
| blueprint-auditor | Audits PRDs against implementation status, guides lifecycle decisions |
| hypothesis-tester | Validates design assumptions through experiments |
| feature-verifier | Verifies acceptance criteria before merge |
| feature-editor | Propagates mid-stream changes across documentation |
| feature-archiver | Archives/restores completed features |
| code-checker | Fast code hygiene validation |
| code-auditor | Pattern consistency analysis |
| bug-investigator | Evidence-based bug investigation |
| comment-cleaner | Removes unnecessary comments |
| test-runner | Comprehensive test execution |
| pr-review-splitter | Segments diffs into review units |
| pr-sub-reviewer | Analyzes review units across 5 dimensions |
| pr-review-synthesizer | Produces holistic fitness judgment |
| pr-review-reporter | Formats findings into markdown |
| pr-visualizer | Creates Mermaid diagrams for PR changes |
| pr-feedback-collector | Gathers GitHub review comments |

## Field Notes

During feature implementation, the build step of `/build` automatically captures key learnings in a `field-notes.md` file within the feature directory. These notes document:

- **Implementation deviations**: When the actual approach differs from the design
- **User clarifications**: Corrections or new context provided during the build
- **Codebase discoveries**: Undocumented patterns found during implementation
- **Workarounds**: Constraints that required alternative approaches

The verify step reads these field notes to distinguish intentional deviations from potential issues, preventing false verification failures.

**Location**: `{{$RP1_WORK_ROOT}}/features/{FEATURE_ID}/field-notes.md`

## Version

Current: 3.0.0

## Requires

- rp1-base >= 2.0.0

