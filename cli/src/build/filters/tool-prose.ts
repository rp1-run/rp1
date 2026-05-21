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
 * | copilot     | Rewrites known CC tool names to Copilot equivalents   |
 * | gemini      | Rewrites known CC tool names to Gemini names          |
 * | antigravity | Rewrites known CC tool names to Antigravity names     |
 *
 * Only transforms references outside code blocks. For Codex, tools mapped
 * to null receive prose fallback descriptions (shell equivalents or
 * "not available" labels). On other platforms, null-mapped tools are
 * left unchanged.
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
	"WebSearch",
	"TodoWrite",
	"EnterPlanMode",
	"ExitPlanMode",
	"Task",
	"Skill",
	"SlashCommand",
] as const;

/**
 * Codex-specific prose fallbacks for tools mapped to null.
 * These provide human-readable descriptions instead of silently skipping.
 */
const CODEX_PROSE_FALLBACKS: Record<string, string> = {
	Read: "cat/head/tail via shell",
	Write: "file writes via shell",
	Glob: "find via shell",
	Grep: "grep via shell",
	WebFetch: "web fetching (not available)",
	WebSearch: "web searching (not available)",
	TodoWrite: "task tracking (not available)",
};

/**
 * Copilot-specific prose fallbacks for tools mapped to null.
 */
const COPILOT_PROSE_FALLBACKS: Record<string, string> = {
	WebSearch: "web searching (not available)",
	TodoWrite: "task tracking (not available)",
};

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

		// Determine the replacement string: use the mapped name if available,
		// or a Codex prose fallback for null-mapped tools on the codex platform.
		let replacement: string | undefined;
		if (mapped) {
			replacement = mapped;
		} else if (platform === "codex" && mapped === null) {
			replacement = CODEX_PROSE_FALLBACKS[tool];
		} else if (platform === "copilot" && mapped === null) {
			replacement = COPILOT_PROSE_FALLBACKS[tool];
		}

		if (!replacement) continue;

		const pattern = new RegExp(`\\b${tool}\\b`, "g");
		const matches = findMatchesOutsideCodeBlocks(pattern, result);

		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const matchIndex = match.index;
			if (matchIndex === undefined) continue;
			result =
				result.slice(0, matchIndex) +
				replacement +
				result.slice(matchIndex + match[0].length);
		}
	}

	return result;
};
