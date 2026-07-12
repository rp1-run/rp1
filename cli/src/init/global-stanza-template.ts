import { LATEST_FENCE_VERSION } from "../lib/fence-version.js";

export { LATEST_FENCE_VERSION };

const KB_SECTION = `## rp1 Knowledge Base

**Use Progressive Disclosure Pattern**

Run \`rp1 agent-tools rp1-root-dir\` to discover the project's \`kbRoot\` directory, then load KB files from that location.

Files:
- index.md (always load first)
- architecture.md
- modules.md
- patterns.md
- concept_map.md

Loading rules:
1. Run \`rp1 agent-tools rp1-root-dir\` to resolve the \`kbRoot\` path.
2. Read \`index.md\` first from the resolved kbRoot.
3. Then load based on task type:
   - Code review: patterns.md
   - Bug investigation: architecture.md, modules.md
   - Feature work: modules.md, patterns.md
   - Strategic or system-wide analysis: all files`;

const SKILL_AWARENESS_SECTION = `## rp1 Skill Awareness

Installed plugins: rp1-base, rp1-dev. Run \`/guide\` to discover skills by task.

- Suggest at most 1 skill per turn: name, one-line reason, offer to run.
- Skip if the user declined this session or a workflow is already running.
- Only suggest when there is a clear match to the user's current activity.`;

const CODEX_CONVENTIONS_SECTION = `## Codex agent conventions

**Task shorthand**: \`Task: <sub-agent-name>\` means spawn that sub-agent. Treat it as an execution directive, not descriptive text.

**Subagent waiting**: Do not assume a subagent failed because it is slow. Wait for completion before declaring it stalled. Check for expected side effects (artifact files, DB writes) before concluding it is stuck. Prefer patient polling over short timeouts for critical-path subagents.`;

export function buildGlobalStanzaContent(platform: string): string {
	switch (platform) {
		case "claude-code":
			return `${KB_SECTION}\n\n${SKILL_AWARENESS_SECTION}`;
		case "codex":
			return `${KB_SECTION}\n\n${CODEX_CONVENTIONS_SECTION}`;
		default:
			return `${KB_SECTION}\n\n${SKILL_AWARENESS_SECTION}`;
	}
}
