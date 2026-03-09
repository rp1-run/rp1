/**
 * Transformation engine for converting Claude Code artifacts to Codex format.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../../shared/errors.js";
import { transformError } from "../../../shared/errors.js";
import { findMatchesOutsideCodeBlocks } from "../content-utils.js";
import type { ClaudeCodeAgent, ClaudeCodeSkill } from "../models.js";
import type { CodexAgent, CodexSkill } from "./models.js";
import { codexRegistry } from "./registry.js";
import { mapAgentToRoleType } from "./role-mapper.js";

/**
 * Transform slash-command references to Codex $ mention syntax.
 * /rp1-base:skill-name  -> $rp1-base-skill-name
 * /rp1-dev:skill-name   -> $rp1-dev-skill-name
 * /rp1-utils:skill-name -> $rp1-utils-skill-name
 *
 * Only transforms references outside code blocks.
 */
const transformNamespaceToCodex = (content: string): string => {
	const pattern = /\/rp1-(base|dev|utils):([a-z][a-z0-9-]*)/g;

	const matches = findMatchesOutsideCodeBlocks(pattern, content);

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const plugin = match[1];
		const skill = match[2];
		const replacement = `$rp1-${plugin}-${skill}`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Transform allowed-tools string by mapping tool names through the Codex registry.
 * Tools mapped to null are filtered out. Unmapped tools are kept as-is.
 *
 * Handles Claude Code's allowed-tools format: "Bash(echo *), Read, Edit, Glob, Grep"
 * Tool patterns like "Bash(echo *)" extract the base tool name for registry lookup
 * and preserve the pattern suffix in the mapped result.
 */
const transformAllowedTools = (allowedTools: string): string | undefined => {
	const tools = allowedTools.split(",").map((t) => t.trim());
	const mapped: string[] = [];

	for (const tool of tools) {
		const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
		const baseName = parenMatch ? parenMatch[1] : tool;

		const mappedTool = codexRegistry.toolMappings[baseName];
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
 * Transform a Claude Code skill to Codex format.
 *
 * Applies namespace transformation (/ -> $) to content,
 * maps allowed-tools through the Codex registry, and preserves metadata.
 */
export const transformSkillForCodex = (
	ccSkill: ClaudeCodeSkill,
): E.Either<CLIError, CodexSkill> => {
	try {
		const transformedContent = transformNamespaceToCodex(ccSkill.content);

		const transformedAllowedTools = ccSkill.allowedTools
			? transformAllowedTools(ccSkill.allowedTools)
			: undefined;

		const codexSkill: CodexSkill = {
			name: ccSkill.name,
			description: ccSkill.description,
			allowedTools: transformedAllowedTools,
			content: transformedContent,
			supportingFiles: ccSkill.supportingFiles,
			metadata: ccSkill.metadata,
		};

		return E.right(codexSkill);
	} catch (e) {
		return E.left(
			transformError(ccSkill.name, `Codex skill transformation failed: ${e}`),
		);
	}
};

/**
 * Transform a Claude Code agent to Codex format.
 *
 * Applies namespace transformation (/ -> $) to content and assigns a role type
 * based on the agent's name and description.
 */
export const transformAgentForCodex = (
	ccAgent: ClaudeCodeAgent,
): E.Either<CLIError, CodexAgent> => {
	try {
		const transformedContent = transformNamespaceToCodex(ccAgent.content);
		const roleType = mapAgentToRoleType(ccAgent.name, ccAgent.description);

		const codexAgent: CodexAgent = {
			name: ccAgent.name,
			description: ccAgent.description,
			model: ccAgent.model,
			roleType,
			developerInstructions: transformedContent,
		};

		return E.right(codexAgent);
	} catch (e) {
		return E.left(
			transformError(ccAgent.name, `Codex agent transformation failed: ${e}`),
		);
	}
};
