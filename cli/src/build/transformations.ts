/**
 * Transformation engine for converting Claude Code artifacts to OpenCode format.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import { transformError } from "../../shared/errors.js";
import type {
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
	OpenCodeAgent,
	OpenCodeCommand,
	OpenCodeSkill,
	PlatformRegistry,
} from "./models.js";

/**
 * Check if a position in text is inside a code block (```...```).
 */
const isInCodeBlock = (text: string, position: number): boolean => {
	const textBefore = text.slice(0, position);
	const delimiterCount = (textBefore.match(/```/g) || []).length;
	return delimiterCount % 2 === 1;
};

/**
 * Find regex matches that are NOT inside code blocks.
 */
const findMatchesOutsideCodeBlocks = (
	pattern: RegExp,
	text: string,
): RegExpMatchArray[] => {
	const matches: RegExpMatchArray[] = [];
	let match: RegExpExecArray | null;
	const regex = new RegExp(
		pattern.source,
		pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
	);

	while ((match = regex.exec(text)) !== null) {
		if (!isInCodeBlock(text, match.index)) {
			matches.push(match);
		}
	}

	return matches;
};

/**
 * Transform namespace separator for OpenCode.
 * Simply replaces colon with slash: rp1-dev:agent -> rp1-dev/agent
 */
const transformNamespaceSeparator = (content: string): string => {
	let result = content.replace(/rp1-base:/g, "rp1-base/");
	result = result.replace(/rp1-dev:/g, "rp1-dev/");
	return result;
};

/**
 * Build OpenCode permissions dict from Claude Code tools list.
 */
const buildPermissionsDict = (
	tools: readonly string[],
): Record<string, readonly string[]> => {
	const permissions: Record<string, string[]> = {};

	// File permissions
	const filePerms: string[] = [];
	if (tools.includes("Read") || tools.includes("read_file")) {
		filePerms.push("read");
	}
	if (tools.includes("Write") || tools.includes("write_file")) {
		filePerms.push("write");
	}
	if (tools.includes("Edit") || tools.includes("edit_file")) {
		filePerms.push("edit");
	}
	if (filePerms.length > 0) {
		permissions.file = filePerms;
	}

	// Bash permissions
	if (tools.includes("Bash") || tools.includes("bash_run")) {
		permissions.bash = ["execute"];
	}

	// Search permissions
	const searchPerms: string[] = [];
	if (tools.includes("Grep") || tools.includes("grep_file")) {
		searchPerms.push("grep");
	}
	if (tools.includes("Glob") || tools.includes("glob_pattern")) {
		searchPerms.push("glob");
	}
	if (searchPerms.length > 0) {
		permissions.search = searchPerms;
	}

	return permissions;
};

/**
 * Transform SlashCommand invocations to OpenCode command_invoke pattern.
 * Preserves code examples (doesn't transform inside code blocks).
 */
const transformSlashCommandCalls = (content: string): string => {
	// Pattern: /rp1-(base|dev):command-name
	const slashPattern = /\/rp1-(base|dev):([a-z-]+)/g;

	const matches = findMatchesOutsideCodeBlocks(slashPattern, content);

	// Replace in reverse order to preserve positions
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
 * Transform Claude Code command to OpenCode format.
 */
export const transformCommand = (
	ccCmd: ClaudeCodeCommand,
	_registry: PlatformRegistry,
): E.Either<CLIError, OpenCodeCommand> => {
	try {
		// Transform namespace separator: rp1-base: -> rp1-base/, rp1-dev: -> rp1-dev/
		const transformedContent = transformNamespaceSeparator(ccCmd.content);

		const ocCmd: OpenCodeCommand = {
			template: transformedContent,
			description: ccCmd.description,
			argumentHint: ccCmd.argumentHint,
			agent: undefined, // Always None - explicit invocation via prompt
			model: undefined, // Inherit from OpenCode config
			subtask: false,
		};

		return E.right(ocCmd);
	} catch (e) {
		return E.left(
			transformError(ccCmd.name, `Command transformation failed: ${e}`),
		);
	}
};

/**
 * Transform Claude Code agent to OpenCode format.
 */
export const transformAgent = (
	ccAgent: ClaudeCodeAgent,
	registry: PlatformRegistry,
): E.Either<CLIError, OpenCodeAgent> => {
	try {
		// Map tools using registry (filter out null values)
		const ocTools: string[] = [];
		for (const tool of ccAgent.tools) {
			const mappedTool = registry.toolMappings[tool];
			if (mappedTool === undefined) {
				// No mapping, keep original
				ocTools.push(tool);
			} else if (mappedTool !== null) {
				// Has mapping
				ocTools.push(mappedTool);
			}
			// null means tool should be filtered out (Claude Code specific)
		}

		// Build permissions dict
		const permissions = buildPermissionsDict(ccAgent.tools);

		// Transform content: SlashCommand -> command_invoke
		const transformedContent = transformSlashCommandCalls(ccAgent.content);

		const ocAgent: OpenCodeAgent = {
			name: ccAgent.name,
			description: ccAgent.description,
			mode: "subagent",
			model: ccAgent.model,
			tools: ocTools,
			permissions,
			content: transformedContent,
		};

		return E.right(ocAgent);
	} catch (e) {
		return E.left(
			transformError(ccAgent.name, `Agent transformation failed: ${e}`),
		);
	}
};

/**
 * Transform skill invocations to opencode-skills pattern.
 * Preserves code examples (doesn't transform inside code blocks).
 */
const transformSkillInvocations = (
	content: string,
	skillName: string,
): string => {
	// In Claude Code, skills are invoked via Skill tool
	// In OpenCode, they're invoked via skills_{name} custom tool
	const escapeRegex = (str: string): string =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const skillPattern = new RegExp(
		`Skill tool.*?skill:\\s*${escapeRegex(skillName)}`,
		"gs",
	);

	const matches = findMatchesOutsideCodeBlocks(skillPattern, content);

	// Replace in reverse order
	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const replacement = `skills_${skillName} tool`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Transform Claude Code skill to Anthropic Skills v1.0 format.
 */
export const transformSkill = (
	ccSkill: ClaudeCodeSkill,
	_registry: PlatformRegistry,
): E.Either<CLIError, OpenCodeSkill> => {
	try {
		// Transform skill invocation in content (native -> skills_{name})
		const transformedContent = transformSkillInvocations(
			ccSkill.content,
			ccSkill.name,
		);

		// Transform allowed-tools from comma-separated string to array (OpenCode format)
		const allowedTools = ccSkill.allowedTools
			? ccSkill.allowedTools.split(",").map((t) => t.trim())
			: undefined;

		const ocSkill: OpenCodeSkill = {
			name: ccSkill.name,
			description: ccSkill.description,
			allowedTools,
			content: transformedContent,
			supportingFiles: ccSkill.supportingFiles,
		};

		return E.right(ocSkill);
	} catch (e) {
		return E.left(
			transformError(ccSkill.name, `Skill transformation failed: ${e}`),
		);
	}
};
