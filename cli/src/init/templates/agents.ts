/**
 * Template for injecting rp1 knowledge into AGENTS.md files.
 * Works with OpenCode, Cline, Cursor, and other agentic tools.
 */

export const AGENTS_TEMPLATE = `## rp1 Knowledge Base

KB files in \`.rp1/context/\`: \`index.md\` (load first), \`architecture.md\`, \`modules.md\`, \`patterns.md\`, \`concept_map.md\`

**Loading**: Read index.md first. Then based on task: code review → patterns.md, bugs → architecture.md + modules.md, features → modules.md + patterns.md, strategic → ALL files.

**Important**: Do NOT use \`/rp1-base/knowledge-load\` in subagents (causes early exit). Use Read tool directly.`;
