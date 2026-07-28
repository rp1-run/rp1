/**
 * Liquid filter: agent_tools
 *
 * Renders an agent's declared tool allowlist for platforms whose agent
 * frontmatter takes bare tool names (Claude Code).
 *
 * Claude Code's agent `tools` field is an allowlist of tool names, not a
 * permission-grant mechanism: scoped specifiers such as `Bash(rp1 *)` belong in
 * a skill's `allowed-tools` or in `permissions.allow`. Scoped entries therefore
 * collapse to their base tool name, and the duplicates that collapsing can
 * produce (`Bash` plus `Bash(rp1 *)`) are removed while preserving order.
 */

const SCOPED_TOOL_PATTERN = /^([A-Za-z][\w-]*)\(.*\)$/;

/**
 * Collapse scoped tool entries to bare tool names and de-duplicate.
 */
export const agentTools = (tools: readonly string[]): string => {
	const seen = new Set<string>();
	const names: string[] = [];

	for (const entry of tools) {
		const trimmed = entry.trim();
		if (!trimmed) {
			continue;
		}

		const scoped = trimmed.match(SCOPED_TOOL_PATTERN);
		const name = scoped ? scoped[1] : trimmed;

		if (seen.has(name)) {
			continue;
		}
		seen.add(name);
		names.push(name);
	}

	return names.join(", ");
};
