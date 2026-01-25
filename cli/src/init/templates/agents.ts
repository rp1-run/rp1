/**
 * Template for injecting rp1 knowledge into AGENTS.md files.
 * Works with OpenCode, Cline, Cursor, and other agentic tools.
 */

export const AGENTS_TEMPLATE = `## rp1 Knowledge Base

**Use Progressive Disclosure Pattern**

Location: \`.rp1/context/\`

Files:
- index.md (always load first)
- architecture.md
- modules.md
- patterns.md
- concept_map.md

Loading rules:
1. Always read index.md first.
2. Then load based on task type:
   - Code review: patterns.md
   - Bug investigation: architecture.md, modules.md
   - Feature work: modules.md, patterns.md
   - Strategic or system-wide analysis: all files`;
