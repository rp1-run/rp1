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
 * | goose       | Rewrites to developer-extension or fail-closed notes  |
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
	"Bash",
	"BashOutput",
	"Edit",
	"Read",
	"Write",
	"Grep",
	"Glob",
	"KillShell",
	"NotebookEdit",
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
 * Goose-specific prose replacements. Goose's initial rp1 slice uses the
 * builtin developer extension for basic shell/filesystem work and fails
 * closed for delegation, interactive, web, notebook, and background-shell
 * session semantics.
 */
const GOOSE_PROSE_REPLACEMENTS: Record<string, string> = {
	Read: "developer extension file reads",
	Write: "developer extension file writes",
	Edit: "developer extension file edits",
	Grep: "developer extension search",
	Glob: "developer extension file discovery",
	Bash: "developer extension shell commands",
	BashOutput: "background shell output collection (unsupported on Goose)",
	KillShell: "background shell control (unsupported on Goose)",
	NotebookEdit: "notebook editing (unsupported on Goose)",
	WebFetch: "web fetching (unsupported on Goose)",
	WebSearch: "web searching (unsupported on Goose)",
	TodoWrite:
		"dedicated task tracking (unsupported on Goose; use a markdown task list)",
	EnterPlanMode: "interactive planning mode (unsupported on Goose)",
	ExitPlanMode: "interactive planning mode exit (unsupported on Goose)",
	AskUserQuestion:
		"interactive user input (unsupported on Goose; stop and ask the user directly)",
};

const GOOSE_CONTEXTUAL_PROSE_REPLACEMENTS = [
	{
		pattern: /\bTask\s+tool\b/g,
		replacement:
			"subagent delegation tool (unsupported on Goose unless a foreground Summon smoke passes)",
	},
	{
		pattern: /\bSkill\s+tool\b/g,
		replacement: "nested skill invocation tool (unsupported on Goose)",
	},
	{
		pattern: /\bSlashCommand\s+tool\b/g,
		replacement: "slash command invocation tool (unsupported on Goose)",
	},
] as const;

const replaceOutsideCodeBlocks = (
	content: string,
	pattern: RegExp,
	replacement: string,
): string => {
	const matches = findMatchesOutsideCodeBlocks(pattern, content);
	let result = content;

	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

const applyGooseContextualProse = (content: string): string =>
	GOOSE_CONTEXTUAL_PROSE_REPLACEMENTS.reduce(
		(result, entry) =>
			replaceOutsideCodeBlocks(result, entry.pattern, entry.replacement),
		content,
	);

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
		if (platform === "goose") {
			replacement = GOOSE_PROSE_REPLACEMENTS[tool];
		} else if (mapped) {
			replacement = mapped;
		} else if (platform === "codex" && mapped === null) {
			replacement = CODEX_PROSE_FALLBACKS[tool];
		} else if (platform === "copilot" && mapped === null) {
			replacement = COPILOT_PROSE_FALLBACKS[tool];
		}

		if (!replacement) continue;

		const pattern = new RegExp(`\\b${tool}\\b`, "g");
		result = replaceOutsideCodeBlocks(result, pattern, replacement);
	}

	if (platform === "goose") {
		result = applyGooseContextualProse(result);
	}

	return result;
};
