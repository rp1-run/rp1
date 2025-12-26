# Project Charter: rp1

**Version**: 1.0.0
**Status**: Complete
**Created**: 2025-11-30
**Last Updated**: 2025-11-30

## Problem & Context

AI coding assistants are powerful, but ad-hoc prompting leads to:
- Endless refinement loops ("let me revise that...")
- Inconsistent results from similar prompts
- Generic advice that ignores your architecture
- Time spent crafting the perfect prompt

**Expanded Context**:
- **Developer Experience**: The frustration of context-switching and prompt crafting disrupts flow state and adds cognitive load
- **Team Consistency**: Different developers get different results from the same AI tools, leading to inconsistent code quality and patterns
- **Knowledge Loss**: AI assistants don't learn or retain your codebase patterns, architecture decisions, or established conventions
- **Workflow Gaps**: Current AI tools don't cover the full development lifecycle - they handle individual tasks but not complete workflows

**Why Now**:
- AI adoption is surging - more developers are using AI assistants daily as core tools
- Current approaches waste significant developer time in iteration and refinement
- Inconsistent AI output directly affects code quality and maintainability
- No comprehensive solutions exist yet that address the full problem space

## Target Users

### Primary User Segments

**Individual Developers**
- Solo developers or those working independently on projects
- Need consistent, high-quality AI assistance without extensive prompt engineering
- Value time savings and reduced cognitive load

**Development Teams**
- Teams needing consistent AI workflows across members
- Require standardized approaches to ensure uniform code quality
- Want shared patterns that work the same way for everyone

**Tech Leads & Architects**
- Responsible for code quality, patterns, and architectural decisions
- Need AI tools that respect and enforce established conventions
- Want to ensure AI-generated code aligns with system design

### Key Pain Points
- **Time Wasted**: Too much time spent crafting, refining, and iterating on prompts
- **Context Loss**: AI doesn't understand their specific codebase, patterns, or conventions
- **Inconsistent Quality**: Results vary wildly in quality between sessions and users
- **Incomplete Workflows**: Have to stitch together multiple AI interactions to complete a single task

## Business Rationale

### Core Value Proposition

**Time Savings**
- Complete workflows in a single pass instead of multiple iterations
- Pre-engineered prompts eliminate the need to craft and refine
- Reduced context-switching and cognitive load

**Consistency**
- Same quality results every time, regardless of who runs the command
- Standardized workflows across team members
- Reproducible outputs from identical inputs

**Codebase Awareness**
- AI that understands your specific architecture and patterns
- Knowledge base captures and persists project context
- Recommendations respect established conventions

**Professional Output**
- Battle-tested patterns that produce quality work
- Complete, structured outputs ready for use
- No iteration required - done in one shot

### Key Bets (Critical Assumptions)

| ID | Assumption | Risk if Wrong |
|----|------------|---------------|
| CA1 | Constitutional prompts can eliminate iteration loops | Core value proposition fails; users still need multiple rounds |
| CA2 | Auto-generated knowledge base provides sufficient context | AI recommendations remain generic and architecture-unaware |
| CA3 | Development workflows are similar enough across projects | Commands won't generalize; need per-project customization |
| CA4 | AI coding platforms will continue to proliferate | Limited addressable market; platform lock-in risk |

## Scope Guardrails

### We Will

**Development Lifecycle Commands**
- Provide commands covering the full development lifecycle: requirements, design, implementation, testing, review, and deployment
- Create specialized agents for each workflow phase
- Ensure commands execute complete workflows in a single pass

**Knowledge Base System**
- Auto-generate codebase context from project files
- Persist architecture, patterns, and conventions in structured format
- Enable knowledge-aware agents that understand project-specific context

**Multi-Platform Support**
- Support Claude Code as the primary platform
- Support OpenCode as an alternative platform
- Design for future platform expansion (Cursor, Goose, Amp)

### We Won't

**Custom LLM Training**
- We will not train custom models on user codebases
- We rely on prompt engineering and context injection, not fine-tuning
- Users' code never leaves their environment for training purposes

**Code Hosting**
- We will not run infrastructure or store user code
- All artifacts are generated and stored locally in the user's project
- No cloud dependencies or external services for core functionality

**Real-time Collaboration**
- We will not support multi-user simultaneous editing or review
- Commands are designed for individual execution
- Team consistency comes from shared commands, not shared sessions

## Success Criteria

### Success Metrics

**Adoption Metrics**
- Downloads and installs across supported platforms
- Active users (daily/weekly/monthly command executions)
- Growth in new user acquisition over time

**Efficiency Gains**
- Time saved per workflow (compared to ad-hoc prompting)
- Reduction in iteration cycles needed to complete tasks
- Increase in first-pass success rate

**Quality Indicators**
- First-pass success rate (commands that complete without revision)
- Output quality as measured by user acceptance
- Consistency of results across different users and sessions

**Community Signals**
- GitHub stars and forks
- Community contributions (PRs, issues, discussions)
- User testimonials and case studies

### Failure Modes

| Failure Mode | Description | Mitigation |
|--------------|-------------|------------|
| No Adoption | Users don't find or try rp1 | Improve discoverability, documentation, and onboarding |
| No Retention | Users try once but don't return | Focus on first-run experience and demonstrable value |
| Quality Mismatch | Output doesn't meet user expectations | Iterate on prompt engineering and gather feedback |
| Platform Dependency | Tied to a platform that fails/pivots | Maintain multi-platform support and portable designs |

## Assumptions & Risks

| ID | Assumption | Risk if Wrong |
|----|------------|---------------|
| CA1 | Constitutional prompts can eliminate iteration loops | Core value proposition fails; users still need multiple rounds |
| CA2 | Auto-generated knowledge base provides sufficient context | AI recommendations remain generic and architecture-unaware |
| CA3 | Development workflows are similar enough across projects | Commands won't generalize; need per-project customization |
| CA4 | AI coding platforms will continue to proliferate | Limited addressable market; platform lock-in risk |
