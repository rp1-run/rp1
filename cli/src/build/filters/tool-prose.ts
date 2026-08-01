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

/**
 * Tool names that are never ordinary English words. Every whole-word
 * occurrence in prose is assumed to be a genuine tool reference. This
 * includes "Glob" and "Grep": unlike Read/Write/Edit/Task/Skill, neither
 * doubles as an ordinary English verb or noun in technical prose, so they
 * never need marker-gating -- every bare capitalised occurrence measured
 * across the plugins corpus was a genuine tool reference.
 */
const UNAMBIGUOUS_TOOL_NAMES = [
	"AskUserQuestion",
	"WebFetch",
	"WebSearch",
	"TodoWrite",
	"EnterPlanMode",
	"ExitPlanMode",
	"SlashCommand",
	"Glob",
	"Grep",
] as const;

/**
 * Tool names that double as ordinary English words (e.g. "Edit", "Read").
 * A whole-word match only counts as a genuine tool reference when it is
 * either a backticked inline span (`` `Edit` ``) or immediately followed by
 * "tool"/"tools" (e.g. "the Edit tool") -- the same marker lint rule L005
 * already treats as a genuine reference. Bare occurrences in ordinary prose
 * (headings, "Add/Edit", "Edit Classification") are left untouched.
 */
const AMBIGUOUS_TOOL_NAMES = [
	"Edit",
	"Read",
	"Write",
	"Task",
	"Skill",
] as const;

/**
 * Codex-specific prose fallbacks for tools mapped to null.
 * These provide human-readable descriptions instead of silently skipping.
 */
const CODEX_PROSE_FALLBACKS: Record<string, string> = {
	Read: "cat/head/tail via shell",
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
 * Resolve the platform-appropriate replacement for a tool name, or
 * `undefined` when the tool has no mapping and no prose fallback.
 */
const resolveReplacement = (
	tool: string,
	mapped: string | null | undefined,
	platform: BuildPlatform,
): string | undefined => {
	if (mapped) return mapped;
	if (platform === "codex" && mapped === null) {
		return CODEX_PROSE_FALLBACKS[tool];
	}
	if (platform === "copilot" && mapped === null) {
		return COPILOT_PROSE_FALLBACKS[tool];
	}
	return undefined;
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

	for (const tool of UNAMBIGUOUS_TOOL_NAMES) {
		const replacement = resolveReplacement(
			tool,
			registry.toolMappings[tool],
			platform,
		);
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

	for (const tool of AMBIGUOUS_TOOL_NAMES) {
		const replacement = resolveReplacement(
			tool,
			registry.toolMappings[tool],
			platform,
		);
		if (!replacement) continue;

		// Group 1: a backticked inline span, e.g. `` `Edit` ``.
		// Group 2: the bare name immediately followed by "tool"/"tools",
		// e.g. "the Edit tool" -- matches only the name, not the suffix.
		const pattern = new RegExp(
			`(\`${tool}\`)|(\\b${tool}\\b(?=\\s+tools?\\b))`,
			"g",
		);
		const matches = findMatchesOutsideCodeBlocks(pattern, result);

		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const matchIndex = match.index;
			if (matchIndex === undefined) continue;
			const isBacktickSpan = match[1] !== undefined;
			const replacementText = isBacktickSpan
				? `\`${replacement}\``
				: replacement;
			result =
				result.slice(0, matchIndex) +
				replacementText +
				result.slice(matchIndex + match[0].length);
		}
	}

	return result;
};
