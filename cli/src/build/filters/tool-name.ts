/**
 * Liquid filter: tool_name
 *
 * Maps a single Claude Code tool name to the platform equivalent using
 * the platform registry's toolMappings.
 *
 * Returns the mapped name, null for filtered tools, or the original
 * if no mapping is defined.
 */

import type { PlatformRegistry } from "../models.js";

/**
 * Map a tool name through the platform registry.
 *
 * @param toolName - Claude Code tool name (e.g. "Read", "Bash")
 * @param registry - Platform registry with tool mappings
 * @returns Mapped tool name, null if the tool should be filtered out,
 *          or the original name if no mapping exists
 */
export const toolName = (
	toolName: string,
	registry: PlatformRegistry,
): string | null => {
	const mapped = registry.toolMappings[toolName];
	if (mapped === undefined) {
		return toolName;
	}
	return mapped;
};
