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
 * | copilot     | `"Bash(echo *), Read"`   | `["run_terminal_command(echo *)", "read_file"]` |
 * | antigravity | `"Bash(echo *), Read"`   | `["run_shell_command", "read_file"]` |
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
 * Transform allowed-tools for Copilot: map tool names through the registry
 * and return as an array. Filters out null-mapped tools, preserves
 * parenthesized patterns, and passes through unknown tools.
 */
const toCopilotArray = (
	allowedTools: string,
	registry: PlatformRegistry,
): readonly string[] => {
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

	return mapped;
};

/**
 * Transform allowed-tools for Antigravity agent frontmatter. Antigravity agent `tools`
 * accepts concrete tool names, not command permission patterns, so
 * `Bash(rp1 *)` becomes `run_shell_command`.
 */
const toAntigravityArray = (
	allowedTools: string,
	registry: PlatformRegistry,
): readonly string[] => {
	const tools = allowedTools
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
	const mapped: string[] = [];

	for (const tool of tools) {
		const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
		const baseName = parenMatch ? parenMatch[1] : tool;

		const mappedTool = registry.toolMappings[baseName];
		if (mappedTool === null) {
			continue;
		}
		if (mappedTool === undefined) {
			mapped.push(baseName);
		} else {
			mapped.push(mappedTool);
		}
	}

	return [...new Set(mapped)];
};

const toCopilotShellPattern = (pattern: string): string => {
	const trimmed = pattern.trim();
	const wildcardStem = trimmed.match(/^([^\s]+)\s+\*$/);
	if (wildcardStem) {
		return `${wildcardStem[1]}:*`;
	}
	return trimmed;
};

/**
 * Transform allowed-tools for Copilot skills: emit Copilot CLI permission
 * patterns rather than custom-agent tool names.
 *
 * Copilot skill `allowed-tools` follows the CLI allow/deny syntax documented
 * as `Kind(argument)`, for example `shell(git:*)`, `read`, or `write`.
 */
export const copilotPermissionPatternsFilter = (
	allowedTools: string,
): readonly string[] => {
	const tools = allowedTools.split(",").map((t) => t.trim());
	const mapped: string[] = [];

	for (const tool of tools) {
		const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
		const baseName = parenMatch ? parenMatch[1] : tool;

		switch (baseName) {
			case "Bash":
				mapped.push(
					parenMatch
						? `shell(${toCopilotShellPattern(parenMatch[2])})`
						: "shell",
				);
				break;
			case "Read":
			case "Grep":
			case "Glob":
				mapped.push("read");
				break;
			case "Write":
			case "Edit":
				mapped.push("write");
				break;
			case "WebFetch":
				mapped.push("url");
				break;
			case "WebSearch":
			case "Task":
			case "Skill":
			case "AskUserQuestion":
			case "TodoWrite":
			case "SlashCommand":
			case "NotebookEdit":
			case "BashOutput":
			case "KillShell":
			case "EnterPlanMode":
			case "ExitPlanMode":
				break;
			default:
				mapped.push(tool);
		}
	}

	return [...new Set(mapped)];
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
			return toCopilotArray(allowedTools, registry);
		case "antigravity":
			return toAntigravityArray(allowedTools, registry);
		case "goose":
			return allowedTools;
	}
};
