# rp1-base: Core Knowledge & Documentation Platform

Foundation plugin providing knowledge management, documentation generation, strategic analysis, and security validation for Claude Code.

## Overview

The `rp1-base` plugin provides core knowledge and documentation capabilities that power the rp1 ecosystem:

- **Parallel KB generation** - Map-reduce architecture with 5 specialized agents
- **Self-contained commands** - All commands load KB context automatically (no manual `/knowledge-load` step needed)
- Project documentation and strategic analysis
- Security validation
- Content writing
- Shared skills for all plugins

**Agents**: 16 specialized agents across KB generation, deep research, documentation, strategy, security, validation, scribe, prompt pipeline, and Socratic Duel participant workflows
**Skills**: 19 total skills, including 11 user-facing commands and shared capabilities

## Commands (11)

### Knowledge Management
- `/knowledge-build` - Parallel KB generation using map-reduce architecture with 6 agents (includes pattern extraction)
- `/knowledge-load` - **DEPRECATED** - Commands now load KB automatically. See [Progressive Loading](../../docs/concepts/knowledge-aware-agents.md)

### Research
- `/deep-research` - Autonomous deep research on codebases and technical topics. Uses map-reduce architecture with explorer agents for thorough investigation and reporter agent for structured report output including Mermaid diagrams.
  - **Usage Examples**:
    - Single project: `/deep-research "understand the authentication flow in this codebase"`
    - Multi-project: `/deep-research "compare error handling patterns across projects A, B, C"`
    - Technical investigation: `/deep-research "best practices for integrating Redis caching"`
  - **Output**: Structured reports saved to `.rp1/work/research/YYYY-MM-DD-<topic>.md`
  - **Features**: Intent clarification, KB-aware exploration, web search integration, ultrathink synthesis

### Documentation & Strategy
- `/project-birds-eye-view` - Generate project overview documentation for new developers
- `/strategize` - Holistic system optimization with strategic recommendations
- `/socratic-duel` - Bounded, evidence-driven direct participant debate against a read-only Markdown source, recorded in a separate `.rp1/work/debates/` artifact
- `/socratic-duel-run` - Same-harness launcher that starts two participant subagents while the launcher only coordinates and reports
- `/write-content` - Interactive technical document creation

### Security
- `/analyse-security` - Security validation and vulnerability scanning

### Validation & Repair
- `/fix-mermaid` - Validates and repairs Mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax using mermaid-cli, and auto-repairs common errors (up to 3 attempts per diagram). Unfixable diagrams get placeholder comments.
  - **Usage**: `/fix-mermaid path/to/file.md` or `/fix-mermaid -` for stdin
  - **Requires**: Node.js (npx fetches @mermaid-js/mermaid-cli automatically)

### Maintenance
- `/self-update` - Update rp1 to the latest version using your package manager (Homebrew, Scoop) or get manual instructions

## Automatic Update Notifications

rp1 automatically checks for updates when you start a new session in Claude Code or OpenCode. If a newer version is available, you will see a notification with the current and available versions.

**Behavior**:
- Checks only on new session start (not on resume, compact, or clear)
- Version check results are cached for 24 hours to minimize network requests
- Network failures are handled gracefully (no error shown, session continues normally)
- Use `rp1 check-update --force` to bypass the cache and check immediately

**Configuration**:
- Cache file location: `~/.config/rp1/version-cache.json`
- The `~/.config/rp1/` directory is created automatically on first use

**After Updating**:
- Run `/self-update` to update rp1 when a new version is available
- Restart Claude Code or OpenCode after updating to use the new version

## Shared Capabilities

### guide
Discover rp1 skills, get workflow guidance, and ask questions about rp1 capabilities. Accepts an optional freeform question; omitting it shows a capability overview of all installed skills organized by category.

**Invocation**: `/guide` or `/guide "your question"`

### maestro (Retired)

> **Retired**: This skill has been superseded by the official Anthropic `example-skills:skill-creator` skill, which provides comprehensive guidance for creating effective Claude Code skills with better integration into the standard skill ecosystem.

Use `example-skills:skill-creator` instead for creating new skills or updating existing ones.

### mermaid
Validates and troubleshoots Mermaid.js diagrams. Supports flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, state diagrams, and more. Automatically validates syntax and fixes errors.

**Invocation**: Use the Skill tool with `skill: "rp1-base:mermaid"`

### markdown-preview
Generates browser-viewable HTML previews from markdown, plain text, and Mermaid diagrams. Auto-validates diagrams using the mermaid skill (max 3 fix attempts), applies professional styling from PR Visualizer, saves to temp directory, and opens in default browser. Use when agents need to preview documentation, visualizations, or formatted content.

**Invocation**: Use the Skill tool with `skill: "rp1-base:markdown-preview"`

**Parameters**:
- `content` (required): Markdown, plain text, or Mermaid content to render
- `title` (optional): HTML page title (default: "Markdown Preview")

**Returns**: File path to generated HTML, status, diagram fix counters

### prompt-writer
Write maximally terse agent prompts with built-in constitutional governance and epistemic stance. Combines compression-by-default authoring, governance primitives, and epistemological foundations into a single progressive-disclosure skill with three reference layers (`epistemology.md`, `constitution.md`, `tersify.md`) and six pipeline stages.

**Invocation**: `/prompt-writer` (direct style/compression guidance) or loaded on demand by `/build-prompt` for the full pipeline.

**Reference Layers**:
- `references/constitution.md` — 10 governance primitives with four agent-type profiles
- `references/epistemology.md` — Six epistemic stances with composable contracts
- `references/tersify.md` — Compression discipline, section patterns, style rules

**Pipeline Stages**: constitutional-checklist, fallibilist-overlay, epistemic-stance, popper-patterns, confidence-schema, prompt-validation

### artifact-templates
Centralized output templates for all rp1 artifacts (requirements, design, tasks, reports, KB docs). All 20 producer agents across `rp1-base` and `rp1-dev` read their output format from this skill at runtime via a two-hop flow: read the SKILL.md index to locate the template row by producer name, then read the template file at the discovered path. Not user-invocable.

Templates cover four producer types: single-document (14 agents), multi-document (2 agents), section-type (3 agents), and format-reference (1 agent). Section templates under `templates/_sections/` describe content appended to existing files rather than standalone documents.

**Invocation**: Agent-only reference (not user-invocable). See [AGENTS.md](../../AGENTS.md#artifact-templates) for authoring guidance.

## Used By

This plugin is required by:
- **rp1-dev** - Development workflow automation (feature development, code quality, PR management)

Development-focused commands were split into the separate `rp1-dev` plugin starting in v2.0.0.

## Version

Current: 2.0.0

Breaking change from v1.x: Feature, code quality, and PR management commands moved to rp1-dev plugin.
See MIGRATION-v2.md for upgrade instructions.
