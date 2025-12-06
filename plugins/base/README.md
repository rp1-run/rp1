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

**Agents**: 9 specialized agents (6 for KB generation, 3 for docs/strategy/security)
**Commands**: 6 user-facing commands
**Skills**: 4 shared capabilities

## Commands (6)

### Knowledge Management
- `/knowledge-build` - Parallel KB generation using map-reduce architecture with 6 agents (includes pattern extraction)
- `/knowledge-load` - ⚠️ **DEPRECATED** - Commands now load KB automatically. See [Progressive Loading](../../docs/concepts/knowledge-aware-agents.md)

### Documentation & Strategy
- `/project-birds-eye-view` - Generate project overview documentation for new developers
- `/strategize` - Holistic system optimization with strategic recommendations
- `/write-content` - Interactive technical document creation

### Security
- `/analyse-security` - Security validation and vulnerability scanning

## Skills (4)

### maestro
Creates and refactors Claude Code skills following best practices. Guides through requirements gathering, design, content generation, and validation.

**Invocation**: Use the Skill tool with `skill: "rp1-base:maestro"`

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

### knowledge-base-templates
Provides reusable templates for generating comprehensive codebase knowledge bases. Supports both single-project and monorepo structures with architecture diagrams, concept maps, and module documentation.

**Invocation**: Use the Skill tool with `skill: "rp1-base:knowledge-base-templates"`

## Used By

This plugin is required by:
- **rp1-dev** - Development workflow automation (feature development, code quality, PR management)

Development-focused commands were split into the separate `rp1-dev` plugin starting in v2.0.0.

## Version

Current: 2.0.0

Breaking change from v1.x: Feature, code quality, and PR management commands moved to rp1-dev plugin.
See MIGRATION-v2.md for upgrade instructions.
