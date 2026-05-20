/**
 * Liquid filter: slash_commands
 *
 * Transforms slash-command invocations to the platform-specific format.
 *
 * | Platform    | Behavior                                                    |
 * |-------------|-------------------------------------------------------------|
 * | claude-code | Passthrough (no transformation)                             |
 * | opencode    | `/rp1-base:cmd` -> `command_invoke("rp1-base:cmd")`        |
 * | codex       | `/skill-name` -> `$rp1-{plugin}-{skill-name}` (skill map)  |
 * | copilot     | `/rp1-base:cmd` -> `/rp1-base/cmd` (slash separator)       |
 * | antigravity | Passthrough (`/rp1-base:cmd` keeps colon namespace)        |
 * | gemini      | Passthrough (`/rp1-base:cmd` keeps Gemini colon namespace) |
 *
 * Wraps the existing transformSlashCommandCalls() from transformations.ts
 * and transformPlainSlashCommands() from codex/transformations.ts.
 *
 * Reuses findMatchesOutsideCodeBlocks from content-utils.ts per design D7.
 */

import { findMatchesOutsideCodeBlocks } from "../content-utils.js";
import type { BuildPlatform } from "../template-context.js";

/**
 * Transform SlashCommand invocations to OpenCode command_invoke pattern.
 * Preserves code examples (does not transform inside code blocks).
 */
const transformSlashCommandCalls = (content: string): string => {
	const slashPattern = /\/rp1-(base|dev|utils):([a-z-]+)/g;

	const matches = findMatchesOutsideCodeBlocks(slashPattern, content);

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const plugin = match[1];
		const command = match[2];
		const replacement = `command_invoke("rp1-${plugin}:${command}")`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Transform namespaced slash-command invocations to Copilot's / separator format.
 * Preserves code examples (does not transform inside code blocks).
 * /rp1-base:cmd -> /rp1-base/cmd
 */
const transformSlashCommandsToCopilot = (content: string): string => {
	const slashPattern = /\/rp1-(base|dev|utils):([a-z-]+)/g;

	const matches = findMatchesOutsideCodeBlocks(slashPattern, content);

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const plugin = match[1];
		const command = match[2];
		const replacement = `/rp1-${plugin}/${command}`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Transform plain slash-command references to Codex $ mention syntax.
 * Uses longest-match-first sorting to prevent partial matches.
 * Negative lookahead prevents matching when followed by additional path or name characters.
 * Only transforms references outside code blocks.
 */
const transformPlainSlashCommands = (
	content: string,
	skillMap: ReadonlyMap<string, string>,
): string => {
	if (skillMap.size === 0) return content;

	const skillNames = Array.from(skillMap.keys()).sort(
		(a, b) => b.length - a.length,
	);

	const escapedNames = skillNames.map((name) =>
		name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
	);
	const pattern = new RegExp(
		`\\/(${escapedNames.join("|")})(?![a-z0-9-/])`,
		"g",
	);

	const matches = findMatchesOutsideCodeBlocks(pattern, content);
	const isEmbeddedPathSegment = (matchIndex: number): boolean => {
		if (matchIndex === 0) return false;
		return /[A-Za-z0-9._~:/-]/.test(content[matchIndex - 1] ?? "");
	};

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		if (isEmbeddedPathSegment(matchIndex)) continue;
		const skillName = match[1];
		const plugin = skillMap.get(skillName);
		if (!plugin) continue;
		const replacement = `$rp1-${plugin}-${skillName}`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Apply slash-command transformation for the given platform.
 *
 * @param content - Source content containing slash-command references
 * @param platform - Target build platform
 * @param skillMap - Map of skill name to plugin name (required for Codex plain slash commands)
 * @returns Transformed content with platform-appropriate slash-command format
 */
export const slashCommands = (
	content: string,
	platform: BuildPlatform,
	skillMap?: ReadonlyMap<string, string>,
): string => {
	switch (platform) {
		case "claude-code":
			return content;
		case "opencode":
			return transformSlashCommandCalls(content);
		case "codex":
			return transformPlainSlashCommands(
				content,
				skillMap ?? new Map<string, string>(),
			);
		case "copilot":
			return transformSlashCommandsToCopilot(content);
		case "antigravity":
			return content;
		case "gemini":
			return content;
	}
};
