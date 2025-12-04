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
1. **Charter** (`.rp1/work/charter.md`) - Project-level "why" and "who"
2. **PRDs** (`.rp1/work/prds/<name>.md`) - Surface-specific "what" that inherits from charter

### Feature Development (9)
- `/feature-requirements feature-id [extra-context]` - Gather requirements
- `/feature-design feature-id [extra-context]` - Create technical design
- `/feature-tasks feature-id [extra-context]` - Generate implementation tasks
- `/feature-build feature-id [milestone-id]` - Implement features systematically
- `/feature-verify feature-id [milestone-id]` - Verify feature meets requirements
- `/feature-archive feature-id` - Archive completed feature to archives/
- `/feature-unarchive feature-id` - Restore archived feature to active features
- `/feature-edit feature-id <edit-description>` - Incorporate mid-stream changes
- `/validate-hypothesis feature-id` - Validate design assumptions

**Example**:
```bash
/feature-requirements my-feature "Additional context about feature scope"
/feature-design my-feature
/validate-hypothesis my-feature  # Optional: validate assumptions
/feature-tasks my-feature
/feature-build my-feature
/feature-verify my-feature        # Verify + optional archive prompt
/feature-archive my-feature       # Or archive manually
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

## Field Notes

During feature implementation, the `feature-build` command automatically captures key learnings in a `field-notes.md` file within the feature directory. These notes document:

- **Implementation deviations**: When the actual approach differs from the design
- **User clarifications**: Corrections or new context provided during the build
- **Codebase discoveries**: Undocumented patterns found during implementation
- **Workarounds**: Constraints that required alternative approaches

The `feature-verify` command reads these field notes to distinguish intentional deviations from potential issues, preventing false verification failures.

**Location**: `{RP1_ROOT}/work/features/{FEATURE_ID}/field-notes.md`

## Version

Current: 2.0.0

## Requires

- rp1-base >= 2.0.0

