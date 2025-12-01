# rp1 Examples & Workflows

Practical examples showing how to use rp1 commands for real-world development tasks.

## Table of Contents

- [Complete Feature Development](#complete-feature-development)
- [Code Quality & Maintenance](#code-quality--maintenance)
- [Bug Investigation & Debugging](#bug-investigation--debugging)
- [Pull Request Management](#pull-request-management)
- [Knowledge & Documentation](#knowledge--documentation)
- [Security & Strategy](#security--strategy)
- [Quick Development Tasks](#quick-development-tasks)
- [All Commands Reference](#all-commands-reference)

---

## Complete Feature Development

### End-to-End Feature: User Authentication

**Scenario:** You need to add OAuth authentication to your web application.

```bash
# Step 1: Gather requirements
/rp1-dev:feature-requirements

# Agent will ask clarifying questions:
# - What OAuth providers? (Google, GitHub, etc.)
# - Session management strategy?
# - Security requirements?
# - User data to store?
#
# Result: requirements.md with complete specifications

# Step 2: Create technical design
/rp1-dev:feature-design

# Agent creates:
# - Architecture diagrams (Mermaid)
# - Technology choices (library recommendations)
# - Database schema
# - API endpoints
# - Security considerations
#
# Result: design.md with comprehensive design

# Step 3: Generate implementation tasks
/rp1-dev:feature-tasks

# Agent breaks design into tasks:
# - Database migrations
# - OAuth provider setup
# - Session management
# - Frontend components
# - API endpoints
# - Tests
#
# Result: tasks.md with actionable checklist

# Step 4: Implement the feature
/rp1-dev:feature-build

# Agent:
# - Works through each task systematically
# - Writes code following design
# - Creates tests
# - Updates documentation
# - Validates against acceptance criteria
#
# Result: Complete implementation ready for review

# Step 5: Validate before merge
/rp1-dev:feature-verify

# Agent validates:
# - All acceptance criteria met
# - Tests passing
# - Code coverage adequate
# - Documentation updated
#
# Result: Verification report

# Step 6: Review your changes
/rp1-dev:pr-review

# Agent reviews:
# - Security vulnerabilities
# - Performance issues
# - Architecture consistency
# - Code quality
#
# Result: Comprehensive review report
```

**Time saved:** Instead of 2-3 hours of planning and iteration, get structured output in ~30 minutes.

---

## Code Quality & Maintenance

### Pre-Commit Quality Checks

**Scenario:** You've made changes and want to ensure quality before committing.

```bash
# Fast quality check (runs in ~1-2 minutes)
/rp1-dev:code-check

# Agent runs:
# - Linters (ESLint, Pylint, etc.)
# - Formatters (Prettier, Black, etc.)
# - Unit tests
# - Coverage measurement
#
# Result: Pass/fail report with actionable fixes
```

**Pro tip:** Run this before every commit to catch issues early.

---

### Comprehensive Code Audit

**Scenario:** You've completed a large refactoring and want to ensure consistency.

```bash
# Full codebase audit (knowledge-aware)
/rp1-dev:code-audit

# Agent analyzes:
# - Pattern consistency across modules
# - Code duplication
# - Comment quality (outdated, unnecessary)
# - Documentation drift
# - Maintainability issues
#
# Result: Detailed audit report with prioritized improvements
```

**When to use:** After major refactorings, before releases, or quarterly health checks.

---

### Comment Cleanup

**Scenario:** Your codebase has accumulated unnecessary comments over time.

```bash
# Remove unnecessary comments while preserving important ones
/rp1-dev:code-clean-comments

# Agent removes:
# - Obvious comments ("increment i")
# - Commented-out code
# - Outdated TODOs
#
# Agent preserves:
# - Docstrings
# - Critical logic explanations
# - Type directives
# - License headers
#
# Result: Cleaner code with meaningful comments only
```

---

## Bug Investigation & Debugging

### Production Bug Root Cause Analysis

**Scenario:** Users report errors in production. You need to understand why.

```bash
# Knowledge-aware bug investigation
/rp1-dev:code-investigate

# Agent performs:
# 1. Error pattern analysis
# 2. Architectural context loading
# 3. Hypothesis generation
# 4. Evidence gathering
# 5. Root cause identification
# 6. Fix recommendations
#
# NO CODE CHANGES - investigation only
#
# Result: Detailed investigation report with root cause
```

**Example output:**
```markdown
## Investigation Report

### Symptoms
- 500 errors on /api/users endpoint
- Occurs intermittently under load

### Root Cause
Database connection pool exhaustion due to:
- Connection timeout: 5s (too short)
- Pool size: 10 (too small for load)
- Missing connection release in error handler (auth.ts:127)

### Evidence
- Error logs show "connection timeout" pattern
- Pool size from config/database.ts:15
- Missing finally block in auth.ts:127

### Recommended Fix
1. Increase pool size to 50
2. Increase timeout to 30s
3. Add finally block to ensure connection release
```

**Key advantage:** Understands your architecture, so recommendations fit your system design.

---

## Pull Request Management

### Complete PR Review

**Scenario:** You've created a PR and want thorough review before requesting human review.

```bash
# Architecture-aware PR review
/rp1-dev:pr-review

# Agent reviews:
# - Security vulnerabilities
#   • SQL injection risks
#   • XSS vulnerabilities
#   • Auth/authz issues
# - Performance issues
#   • N+1 queries
#   • Memory leaks
#   • Inefficient algorithms
# - Architecture consistency
#   • Pattern adherence
#   • Component boundaries
#   • API design
# - Code quality
#   • Readability
#   • Maintainability
#   • Test coverage
#
# Result: Comprehensive review with severity ratings
```

---

### Visualize PR Changes

**Scenario:** Large PR with many files. You want to understand the impact visually.

```bash
# Generate Mermaid diagrams of changes
/rp1-dev:pr-visual

# Agent creates:
# - File change diagrams
# - Component relationship diagrams
# - Data flow diagrams
# - Architecture impact visualization
#
# Result: Visual representation of changes for easier review
```

**Great for:** Architecture discussions, code review prep, documentation.

---

### Collect & Address GitHub Feedback

**Scenario:** Reviewers left comments on your GitHub PR. You need to address them systematically.

```bash
# Step 1: Gather all review comments
/rp1-dev:pr-feedback-collect

# Agent:
# - Fetches comments from GitHub
# - Classifies by priority (critical, high, medium, low)
# - Extracts actionable tasks
# - Groups related feedback
#
# Result: pr_feedback.md with organized feedback

# Step 2: Address all feedback
/rp1-dev:pr-feedback-fix

# Agent:
# - Loads pr_feedback.md
# - Works through issues by priority
# - Implements changes
# - Documents resolutions
# - Prepares response to reviewers
#
# Result: All feedback addressed systematically
```

---

## Knowledge & Documentation

### Generate Codebase Knowledge Base

**Scenario:** New project or major refactoring. You want comprehensive documentation.

```bash
# Generate complete knowledge base
/rp1-base:knowledge-build

# Agent generates .rp1/context/:
# - index.md         → Project overview
# - architecture.md  → System patterns & design
# - concept_map.md   → Domain terminology
# - modules.md       → Component breakdown
#
# Takes ~2-5 minutes depending on codebase size
#
# Result: Comprehensive architecture documentation
```

**When to run:**
- Start of project
- After major refactorings
- Before onboarding new team members
- Periodically (weekly/monthly) to keep fresh

---

### Create New Developer Onboarding Guide

**Scenario:** New developer joining team. Need comprehensive introduction.

```bash
# Prerequisite: Generate knowledge base first
/rp1-base:knowledge-build

# Then create onboarding guide
/rp1-base:project-birds-eye-view

# Agent creates:
# - Project overview
# - Architecture diagrams
# - Key concepts & terminology
# - Getting started guide
# - Development workflow
# - Where to find things
#
# Result: Comprehensive onboarding document
```

**Pro tip:** Keep this updated and share with new team members on day one.

---

### Write Technical Documentation

**Scenario:** Need to document a complex feature or architectural decision.

```bash
# Interactive technical writing
/rp1-base:write-content

# Agent asks:
# - What are you documenting?
# - Target audience?
# - Depth needed?
#
# Then creates:
# - Structured document
# - Diagrams where helpful
# - Code examples
# - Clear explanations
#
# Result: Polished technical document
```

**Use cases:** ADRs, feature docs, API documentation, architectural guides.

---

## Security & Strategy

### Security Validation

**Scenario:** Before deploying, validate security posture.

```bash
# Comprehensive security analysis
/rp1-base:analyse-security

# Agent performs:
# - Vulnerability scanning
# - Auth/authz verification
# - OWASP Top 10 checks
# - Dependency security audit
# - Compliance assessment
# - Threat model review
#
# Result: Security report with prioritized fixes
```

**When to run:** Before releases, after security-sensitive changes, quarterly audits.

---

### Strategic Optimization

**Scenario:** System is working but you want holistic improvement recommendations.

```bash
# Knowledge-aware strategic analysis
/rp1-base:strategize

# Agent analyzes:
# - Cost optimization opportunities
# - Performance bottlenecks
# - Quality improvements
# - Complexity reduction
# - Technical debt
#
# Provides:
# - Quantified trade-offs
# - Prioritized recommendations
# - Implementation roadmap
#
# Result: Strategic improvement plan
```

**Use cases:** Quarterly planning, performance optimization, cost reduction initiatives.

---

## Quick Development Tasks

### Ad-Hoc Feature Work

**Scenario:** Small feature, bug fix, or prototype needed quickly.

```bash
# Quick development for exploratory work
/rp1-dev:code-quick-build

# Good for:
# - Quick bug fixes
# - Small features
# - Prototypes
# - Performance optimizations
# - Refactoring
#
# Agent:
# - Plans scope
# - Implements changes
# - Adds basic tests
# - No heavy process
#
# Result: Quick implementation
```

**When to use:** Small tasks that don't need full feature development pipeline.

---

## All Commands Reference

### rp1-base Commands (6)

#### Knowledge Management
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-base:knowledge-build` | Generate codebase architecture documentation | Start of project, after refactoring, periodically |
| `/rp1-base:knowledge-load` | Load KB context (used by agents automatically) | Rarely manual - agents call this |

#### Documentation & Strategy
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-base:project-birds-eye-view` | Create project overview for newcomers | Onboarding, documentation |
| `/rp1-base:strategize` | Holistic optimization recommendations | Quarterly planning, optimization |
| `/rp1-base:write-content` | Interactive technical writing | Documentation, ADRs, guides |

#### Security
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-base:analyse-security` | Security validation & vulnerability scanning | Pre-release, security audits |

---

### rp1-dev Commands (15)

#### Feature Development (4)
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-dev:feature-requirements` | Interactive requirements gathering | Start of new feature |
| `/rp1-dev:feature-design` | Technical design with diagrams | After requirements, before coding |
| `/rp1-dev:feature-tasks` | Generate implementation task list | After design, before implementation |
| `/rp1-dev:feature-build` | Systematic implementation with tests | Main implementation phase |

#### Code Quality (7)
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-dev:code-check` | Fast lints, formatters, tests, coverage | Pre-commit, CI pipeline |
| `/rp1-dev:feature-verify` | Acceptance criteria validation | Before merge, QA |
| `/rp1-dev:code-investigate` | Bug root cause analysis | Debugging, incident response |
| `/rp1-dev:code-audit` | Pattern consistency & maintainability | Post-refactoring, quarterly reviews |
| `/rp1-dev:code-clean-comments` | Remove unnecessary comments | Cleanup, before releases |
| `/rp1-dev:code-quick-build` | Quick fixes, prototypes, optimizations | Ad-hoc development |
| `/rp1-dev:code-test` | **DEPRECATED** - Use code-check or feature-verify | Don't use |

#### PR Management (4)
| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rp1-dev:pr-review` | Architecture-aware code review | Before requesting human review |
| `/rp1-dev:pr-feedback-collect` | Gather GitHub review comments | After receiving reviews |
| `/rp1-dev:pr-feedback-fix` | Systematically address feedback | After collecting feedback |
| `/rp1-dev:pr-visual` | Visualize changes with diagrams | Complex PRs, architecture discussions |

---

## Tips & Tricks

### 1. Always Generate KB First

Many commands are knowledge-aware. Run this once:
```bash
/rp1-base:knowledge-build
```

Then agents automatically understand your architecture.

---

### 2. Chain Commands for Workflows

Don't overthink it. Just run commands in sequence:
```bash
/rp1-dev:feature-requirements
# Wait for completion, review output
/rp1-dev:feature-design
# Wait for completion, review output
/rp1-dev:feature-tasks
# And so on...
```

---

### 3. Keep KB Fresh

Re-run knowledge-build periodically:
- After merging significant PRs
- Weekly/monthly depending on change velocity
- Before starting major features
- When onboarding new team members

```bash
# Quick refresh
/rp1-base:knowledge-build
```

---

### 4. Use code-check Before Every Commit

Fast quality gate:
```bash
/rp1-dev:code-check
# If passes → commit
# If fails → fix issues, run again
```

---

### 5. PR Review Before Human Review

Save your reviewers' time:
```bash
/rp1-dev:pr-review
# Fix issues found
# Then request human review
```

Human reviewers can focus on design and logic, not linting.

---

### 6. Investigate Before Fixing

Don't guess at bugs. Understand them:
```bash
/rp1-dev:code-investigate
# Get root cause analysis
# Then fix with confidence
```

---

## Common Workflows

### Daily Development
```bash
# Morning: Check what changed overnight (if team)
/rp1-dev:pr-review  # On PRs you're reviewing

# During development
/rp1-dev:code-check  # Before each commit

# End of day
/rp1-dev:feature-verify  # Validate day's work
```

---

### Feature Development Sprint
```bash
# Sprint start
/rp1-dev:feature-requirements
/rp1-dev:feature-design
/rp1-dev:feature-tasks

# During sprint
/rp1-dev:feature-build
/rp1-dev:code-check  # Frequently

# Sprint end
/rp1-dev:feature-verify
/rp1-dev:pr-review
```

---

### Incident Response
```bash
# Incident occurs
/rp1-dev:code-investigate  # Understand root cause

# After fix
/rp1-dev:code-check       # Validate fix
/rp1-dev:pr-review        # Quick review
/rp1-base:write-content   # Document incident
```

---

### Quarterly Maintenance
```bash
# Refresh knowledge
/rp1-base:knowledge-build

# Comprehensive audit
/rp1-dev:code-audit

# Strategic planning
/rp1-base:strategize

# Security review
/rp1-base:analyse-security

# Update documentation
/rp1-base:project-birds-eye-view
```

---

## Questions?

- [Main README](README.md)
- [Development Guide](DEVELOPMENT.md)
- [GitHub Issues](https://github.com/rp1-run/rp1/issues)

---

<p align="center">
  <em>These are just examples. rp1 adapts to your workflow.</em>
</p>
