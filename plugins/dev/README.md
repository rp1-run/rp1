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

## Commands (19)

### Project Onboarding (1)
- `/blueprint [prd-name]` - Guided wizard to capture project vision via charter + PRDs

**Default Flow** (creates charter + main PRD):
```bash
/blueprint
```

**Named PRD Flow** (creates additional PRD, requires charter):
```bash
/blueprint mobile-app
/blueprint api
```

The blueprint command creates a two-tier document hierarchy:
1. **Charter** (`{RP1_ROOT}/context/charter.md`) - Project-level "why" and "who"
2. **PRDs** (`{RP1_ROOT}/work/prds/<name>.md`) - Surface-specific "what" that inherits from charter

### Feature Development (9)
- `/feature-requirements feature-id [extra-context]` - Gather requirements
- `/feature-design feature-id [extra-context]` - Create technical design (auto-generates tasks)
- `/feature-tasks feature-id [extra-context]` - Regenerate tasks (optional - tasks auto-generate after design)
- `/feature-build feature-id [milestone-id] [mode]` - Implement features via builder-reviewer pairs
- `/feature-verify feature-id [milestone-id]` - Verify feature meets requirements
- `/feature-archive feature-id` - Archive completed feature to archives/
- `/feature-unarchive feature-id` - Restore archived feature to active features
- `/feature-edit feature-id <edit-description>` - Incorporate mid-stream changes
- `/validate-hypothesis feature-id` - Validate design assumptions

**5-Step Workflow**:
```bash
/feature-requirements my-feature "Additional context about feature scope"
/feature-design my-feature        # Auto-generates tasks.md
/feature-build my-feature
/feature-verify my-feature        # Verify + optional archive prompt
/feature-archive my-feature       # Or archive manually
```

**Optional Commands**:
```bash
/validate-hypothesis my-feature   # Validate design assumptions before build
/feature-tasks my-feature         # Regenerate tasks manually (standalone)
/feature-edit my-feature "Discovery: API doesn't support pagination"  # Mid-stream changes
```

### Code Quality (6)
- `/code-check [feature-id]` - Fast code hygiene validation (lints, formatters, tests, coverage)
- `/code-investigate [problem-description...]` - Bug investigation and root cause analysis
- `/code-test` - (DEPRECATED) Use code-check or feature-verify instead
- `/code-audit [feature-id]` - Code quality and pattern analysis
- `/code-clean-comments` - Remove unnecessary comments
- `/code-quick-build [development-request...]` - Quick fixes, prototypes, and optimizations

**Examples**:
```bash
/code-quick-build "Fix authentication bug in login flow"
/code-investigate "Users report timeout errors on large file uploads"
```

### PR Management (4)
- `/pr-review` - Comprehensive pull request review
- `/pr-feedback-collect` - Gather GitHub review comments
- `/pr-feedback-fix` - Address pull request feedback
- `/pr-visual` - Visualize pull request changes

## Builder-Reviewer Architecture (v3.0)

The `feature-build` command uses a **builder-reviewer architecture** for improved accuracy and reliability:

1. **Minimal Orchestrator**: Coordinates task flow without loading KB or codebase context
2. **Task Builder Agent**: Implements tasks with full context (KB, PRD, design, tasks)
3. **Task Reviewer Agent**: Verifies implementation for discipline, accuracy, completeness, and quality

**Key Features**:
- **Adaptive Task Grouping**: Simple tasks grouped (2-3), medium/complex tasks individual
- **Single Retry**: Failed tasks retry once with reviewer feedback before escalation
- **Configurable Failure Handling**: `ask` mode (default) pauses for guidance, `auto` mode marks blocked and continues
- **Complexity Tags**: Tasks can be tagged `[complexity:simple|medium|complex]` for grouping

**Example**:
```bash
/feature-build my-feature           # Build all tasks with ask mode
/feature-build my-feature 2         # Build milestone 2 only
/feature-build my-feature 1 auto    # Build milestone 1, auto-handle failures
```

## Agents (19)

This plugin provides specialized agents for development workflows:

| Agent | Purpose |
|-------|---------|
| task-builder | Implements tasks with full context, writes implementation summaries |
| task-reviewer | Verifies builder work across 4 dimensions, returns SUCCESS/FAILURE |
| feature-tasker | Generates tasks from design, supports incremental updates |
| blueprint-wizard | Captures project vision through charter and PRD documents |
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

During feature implementation, the `feature-build` command automatically captures key learnings in a `field-notes.md` file within the feature directory. These notes document:

- **Implementation deviations**: When the actual approach differs from the design
- **User clarifications**: Corrections or new context provided during the build
- **Codebase discoveries**: Undocumented patterns found during implementation
- **Workarounds**: Constraints that required alternative approaches

The `feature-verify` command reads these field notes to distinguish intentional deviations from potential issues, preventing false verification failures.

**Location**: `{RP1_ROOT}/work/features/{FEATURE_ID}/field-notes.md`

## Version

Current: 3.0.0

## Requires

- rp1-base >= 2.0.0

