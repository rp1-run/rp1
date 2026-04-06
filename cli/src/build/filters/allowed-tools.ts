/**
 * Liquid filter: allowed_tools
 *
 * Transforms the raw comma-separated allowed-tools string to the
 * platform-specific format.
 *
 * | Platform    | Input                    | Output                                  |
 * |-------------|--------------------------|---------------------------------------- |
 * | claude-code | `"Bash(echo *), Read"`   | `"Bash(echo *), Read"` (passthrough)    |
 * | opencode    | `"Bash(echo *), Read"`   | `["Bash(echo *)", "read_file"]`         |
 * | codex       | `"Bash(echo *), Read"`   | `"functions.exec_command(echo *)"` etc. |
 *
 * Extracts and reuses logic from transformations.ts (OpenCode split)
 * and codex/transformations.ts (Codex registry mapping with pattern handling).
 */

import type { PlatformRegistry } from "../models.js";
import type { BuildPlatform } from "../template-context.js";

/**
 * Transform allowed-tools for OpenCode: split comma-separated string to array.
 */
const toOpenCodeArray = (allowedTools: string): readonly string[] => {
	return allowedTools.split(",").map((t) => t.trim());
};

/**
 * Transform allowed-tools for Codex: map tool names through the registry,
 * filter out null-mapped tools, preserve parenthesized patterns.
 */
const toCodexString = (
	allowedTools: string,
	registry: PlatformRegistry,
): string | undefined => {
	const tools = allowedTools.split(",").map((t) => t.trim());
	const mapped: string[] = [];

	for (const tool of tools) {
		const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
		const baseName = parenMatch ? parenMatch[1] : tool;

		const mappedTool = registry.toolMappings[baseName];
		if (mappedTool === null) {
			continue;
		}
		if (mappedTool === undefined) {
			mapped.push(tool);
		} else if (parenMatch) {
			mapped.push(`${mappedTool}(${parenMatch[2]})`);
		} else {
			mapped.push(mappedTool);
		}
	}

	return mapped.length > 0 ? mapped.join(", ") : undefined;
};

/**
 * Transform an allowed-tools string to the platform-specific format.
 *
 * @param allowedTools - Comma-separated allowed-tools string (CC format)
 * @param platform - Target build platform
 * @param registry - Platform registry with tool mappings
 * @returns Platform-formatted result: string for CC/Codex, array for OpenCode,
 *          or undefined if all tools are filtered out (Codex)
 */
export const allowedToolsFilter = (
	allowedTools: string,
	platform: BuildPlatform,
	registry: PlatformRegistry,
): string | readonly string[] | undefined => {
	switch (platform) {
		case "claude-code":
			return allowedTools;
		case "opencode":
			return toOpenCodeArray(allowedTools);
		case "codex":
			return toCodexString(allowedTools, registry);
		case "copilot":
			return toOpenCodeArray(allowedTools);
	}
};
