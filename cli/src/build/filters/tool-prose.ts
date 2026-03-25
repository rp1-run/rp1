/**
 * Liquid filter: tool_prose
 *
 * Rewrites bare CC-specific tool names in prose content to their
 * platform equivalents using the platform registry's toolMappings.
 *
 * | Platform    | Behavior                                              |
 * |-------------|-------------------------------------------------------|
 * | claude-code | Passthrough (no transformation)                       |
 * | opencode    | Rewrites known CC tool names to OC equivalents        |
 * | codex       | Rewrites known CC tool names to Codex equivalents     |
 *
 * Only transforms references outside code blocks. Tool names mapped
 * to null (no platform equivalent) are left unchanged — the lint rule
 * L005 will still flag them for manual attention.
 */

import { findMatchesOutsideCodeBlocks } from "../content-utils.js";
import type { PlatformRegistry } from "../models.js";
import type { BuildPlatform } from "../template-context.js";

/** Tool names that commonly appear as bare prose references. */
const PROSE_TOOL_NAMES = [
	"AskUserQuestion",
	"Edit",
	"Read",
	"Write",
	"Grep",
	"Glob",
	"WebFetch",
	"TodoWrite",
	"EnterPlanMode",
	"ExitPlanMode",
] as const;

/**
 * Rewrite bare CC tool names in prose to platform equivalents.
 *
 * @param content - Source content with possible CC tool name references
 * @param platform - Target build platform
 * @param registry - Platform registry with tool mappings
 * @returns Content with tool names rewritten for the target platform
 */
export const toolProse = (
	content: string,
	platform: BuildPlatform,
	registry: PlatformRegistry,
): string => {
	if (platform === "claude-code") return content;

	let result = content;

	for (const tool of PROSE_TOOL_NAMES) {
		const mapped = registry.toolMappings[tool];
		// Skip tools with no equivalent (null) or no mapping (undefined)
		if (!mapped) continue;

		const pattern = new RegExp(`\\b${tool}\\b`, "g");
		const matches = findMatchesOutsideCodeBlocks(pattern, result);

		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const matchIndex = match.index;
			if (matchIndex === undefined) continue;
			result =
				result.slice(0, matchIndex) +
				mapped +
				result.slice(matchIndex + match[0].length);
		}
	}

	return result;
};
