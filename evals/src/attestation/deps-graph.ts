/**
 * Dependency graph derivation for eval attestation.
 * Parses markdown to extract Task and Skill references from prompt files.
 * Resolves paths from cli/dist/{platform}/ built artifacts.
 */

import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { DependencyGraph, EvalPlatform } from "./types.js";

/**
 * Pattern for detecting agent references in skill files.
 * Matches: Task: plugin:agent-name, subagent_type: plugin:agent-name
 */
const TASK_PATTERN = /(?:Task|subagent_type):\s*(\w+-\w+):(\w[\w-]*)/g;

/**
 * Pattern for detecting skill references in agent files.
 * Matches: skill: rp1-base:skill-name, skill `rp1-dev:skill-name`, Skill rp1-base:skill-name
 */
const SKILL_PATTERN = /[Ss]kill[:\s]+`?(\w+-\w+):(\w[\w-]*)`?/g;

/**
 * Map plugin name to source path prefix (relative to repo root).
 * Used for plugin suffix extraction.
 */
export const PLUGIN_PATHS: Record<string, string> = {
	"rp1-base": "plugins/base",
	"rp1-dev": "plugins/dev",
	"rp1-utils": "plugins/utils",
};

/** Plugin name suffixes for pattern matching (derived from PLUGIN_PATHS) */
export const PLUGIN_SUFFIXES = Object.keys(PLUGIN_PATHS).map((k) =>
	k.replace("rp1-", ""),
);

/**
 * Get the dist directory path for a plugin on a given platform.
 *
 * @param platform - Target eval platform
 * @param pluginName - Plugin name (e.g., "rp1-base")
 * @returns Relative path to the plugin's dist directory
 */
export function getDistPluginPath(
	platform: EvalPlatform,
	pluginName: string,
): string {
	const pluginDir = pluginName.replace("rp1-", "");
	return `cli/dist/${platform}/${pluginDir}`;
}

/**
 * Get the skill directory name for a given platform.
 * Claude Code uses bare names; OpenCode and Codex use rp1-prefixed names.
 *
 * @param skillName - Bare skill name (e.g., "build-fast")
 * @param platform - Target eval platform
 * @returns Directory name for the skill
 */
function skillDirName(skillName: string, platform: EvalPlatform): string {
	if (platform === "claude-code") {
		return skillName;
	}
	return `rp1-${skillName}`;
}

/**
 * Parse a skill file to extract agent dependencies.
 * Resolves agent paths to cli/dist/{platform}/{plugin}/agents/{name}.md
 *
 * @param content - The skill file content to parse
 * @param platform - Target eval platform
 * @returns Array of agent file paths (deduplicated)
 */
export function parseAgentRefs(
	content: string,
	platform: EvalPlatform,
): readonly string[] {
	const refs: string[] = [];

	for (const match of content.matchAll(TASK_PATTERN)) {
		const [, plugin, agent] = match;
		const distPath = getDistPluginPath(platform, plugin);
		if (PLUGIN_PATHS[plugin]) {
			refs.push(`${distPath}/agents/${agent}.md`);
		}
	}

	return [...new Set(refs)];
}

/**
 * Parse an agent file to extract skill dependencies.
 * Resolves skill paths to cli/dist/{platform}/{plugin}/skills/{name}/SKILL.md
 *
 * @param content - The agent file content to parse
 * @param platform - Target eval platform
 * @returns Array of skill file paths (deduplicated)
 */
export function parseSkillRefs(
	content: string,
	platform: EvalPlatform,
): readonly string[] {
	const refs: string[] = [];
	const pattern = new RegExp(SKILL_PATTERN);

	for (const match of content.matchAll(pattern)) {
		const [, plugin, skill] = match;
		const distPath = getDistPluginPath(platform, plugin);
		if (PLUGIN_PATHS[plugin]) {
			refs.push(`${distPath}/skills/${skillDirName(skill, platform)}/SKILL.md`);
		}
	}

	return [...new Set(refs)];
}

/**
 * Build complete dependency graph for a skill built artifact.
 * Recursively traverses all agent and skill references using BFS
 * with cycle detection to capture transitive dependencies.
 *
 * @param promptPath - Path to the built skill file (cli/dist/{platform}/{plugin}/skills/{name}/SKILL.md)
 * @param platform - Target eval platform
 * @returns TaskEither with dependency graph or error
 */
export function buildDependencyGraph(
	promptPath: string,
	platform: EvalPlatform,
): TE.TaskEither<Error, DependencyGraph> {
	return pipe(
		TE.tryCatch(
			async () => {
				const promptFile = Bun.file(promptPath);
				if (!(await promptFile.exists())) {
					throw new Error(
						`Skill file not found: ${promptPath}. Ensure the platform has been built (run 'just build-all' or 'just build-claude-code').`,
					);
				}

				const visited = new Set<string>();
				const allAgents: string[] = [];
				const allSkills: string[] = [];
				const queue: string[] = [promptPath];

				while (queue.length > 0) {
					const current = queue.shift() as string;
					if (visited.has(current)) continue;
					visited.add(current);

					const file = Bun.file(current);
					if (!(await file.exists())) continue;
					const content = await file.text();

					const agentRefs = parseAgentRefs(content, platform);
					for (const ref of agentRefs) {
						if (!visited.has(ref)) {
							allAgents.push(ref);
							queue.push(ref);
						}
					}

					const skillRefs = parseSkillRefs(content, platform);
					for (const ref of skillRefs) {
						if (!visited.has(ref)) {
							allSkills.push(ref);
							queue.push(ref);
						}
					}
				}

				const skillMatch = promptPath.match(/skills\/([^/]+)\/SKILL\.md$/);
				const skillName = skillMatch ? skillMatch[1] : promptPath;

				return {
					skill: skillName,
					skillPath: promptPath,
					platform,
					agents: [...new Set(allAgents)],
					skills: [...new Set(allSkills)],
				};
			},
			(error: unknown) => new Error(`Failed to build dep graph: ${error}`),
		),
	);
}
