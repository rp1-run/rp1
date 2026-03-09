/**
 * Transformation engine for converting Claude Code artifacts to Codex format.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
 * Auto-discover all skill names from plugin directories.
 * Scans plugins/{base,dev,utils}/skills/* and returns a map of skill name to plugin name.
 * Only directories containing a SKILL.md file are included.
 */
export const discoverSkillMap = (
	projectRoot: string,
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	const plugins = ["base", "dev", "utils"];

	for (const plugin of plugins) {
		const skillsDir = join(projectRoot, "plugins", plugin, "skills");
		let entries: string[];
		try {
			entries = readdirSync(skillsDir);
		} catch {
			continue;
		}

		for (const entry of entries) {
			const entryPath = join(skillsDir, entry);
			try {
				if (!statSync(entryPath).isDirectory()) continue;
				statSync(join(entryPath, "SKILL.md"));
				map.set(entry, plugin);
			} catch {}
		}
	}

	return map;
};

/**
 * Transform plain slash-command references to Codex $ mention syntax.
 * /build       -> $rp1-dev-build
 * /knowledge-build -> $rp1-base-knowledge-build
 *
 * Uses longest-match-first sorting to prevent partial matches
 * (e.g., /build does not match inside /build-fast).
 * Negative lookahead (?![a-z0-9-]) prevents matching when followed
 * by additional name characters.
 * Only transforms references outside code blocks.
 */
export const transformPlainSlashCommands = (
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
		`\\/(${escapedNames.join("|")})(?![a-z0-9-])`,
		"g",
	);

	const matches = findMatchesOutsideCodeBlocks(pattern, content);

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
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
 * Transform a Claude Code skill to Codex format.
 *
 * Applies namespace transformation (/ -> $) to content,
 * maps allowed-tools through the Codex registry, and preserves metadata.
 */
export const transformSkillForCodex = (
	ccSkill: ClaudeCodeSkill,
	skillMap?: ReadonlyMap<string, string>,
): E.Either<CLIError, CodexSkill> => {
	try {
		let transformedContent = transformNamespaceToCodex(ccSkill.content);
		if (skillMap) {
			transformedContent = transformPlainSlashCommands(
				transformedContent,
				skillMap,
			);
		}

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
	skillMap?: ReadonlyMap<string, string>,
): E.Either<CLIError, CodexAgent> => {
	try {
		let transformedContent = transformNamespaceToCodex(ccAgent.content);
		if (skillMap) {
			transformedContent = transformPlainSlashCommands(
				transformedContent,
				skillMap,
			);
		}
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
