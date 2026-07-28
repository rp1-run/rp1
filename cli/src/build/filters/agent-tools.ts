/**
 * Liquid filter: agent_tools
 *
 * Renders an agent's declared tool allowlist into the comma-separated form
 * Claude Code expects in agent frontmatter.
 *
 * A subagent's `tools` field accepts the same `ToolName(specifier)` rule format
 * as `permissions.allow`, so scoped entries such as `Bash(rp1 *)` are preserved
 * verbatim: collapsing them to a bare `Bash` would widen the grant to every
 * shell command and defeat the restriction the agent declared. Only exact
 * duplicates are removed, and declaration order is preserved.
 */

/**
 * Join declared tool entries, dropping blanks and exact duplicates.
 */
export const agentTools = (tools: readonly string[]): string => {
	const seen = new Set<string>();
	const entries: string[] = [];

	for (const entry of tools) {
		const trimmed = entry.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		entries.push(trimmed);
	}

	return entries.join(", ");
};
