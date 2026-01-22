/**
 * Dependency graph derivation for eval attestation.
 * Parses markdown to extract Task and Skill references from prompt files.
 */

import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { DependencyGraph } from "./types.js";

/**
 * Pattern for detecting agent references in command files.
 * Matches: Task: plugin:agent-name
 */
const TASK_PATTERN = /Task:\s*(\w+-\w+):(\w[\w-]*)/g;

/**
 * Pattern for detecting skill references in agent files.
 * Matches: skill: rp1-base:skill-name, skill `rp1-dev:skill-name`, Skill rp1-base:skill-name
 */
const SKILL_PATTERN = /[Ss]kill[:\s]+`?(\w+-\w+):(\w[\w-]*)`?/g;

/**
 * Map plugin name to path prefix (relative to repo root).
 */
const PLUGIN_PATHS: Record<string, string> = {
	"rp1-base": "plugins/base",
	"rp1-dev": "plugins/dev",
	"rp1-utils": "plugins/utils",
};

/**
 * Parse a command file to extract agent dependencies.
 *
 * @param content - The command file content to parse
 * @returns Array of agent file paths (deduplicated)
 */
export function parseAgentRefs(content: string): readonly string[] {
	const refs: string[] = [];
	const pattern = new RegExp(TASK_PATTERN);

	for (const match of content.matchAll(pattern)) {
		const [, plugin, agent] = match;
		const basePath = PLUGIN_PATHS[plugin];
		if (basePath) {
			refs.push(`${basePath}/agents/${agent}.md`);
		}
	}

	return [...new Set(refs)];
}

/**
 * Parse an agent file to extract skill dependencies.
 *
 * @param content - The agent file content to parse
 * @returns Array of skill file paths (deduplicated)
 */
export function parseSkillRefs(content: string): readonly string[] {
	const refs: string[] = [];
	const pattern = new RegExp(SKILL_PATTERN);

	for (const match of content.matchAll(pattern)) {
		const [, plugin, skill] = match;
		const basePath = PLUGIN_PATHS[plugin];
		if (basePath) {
			refs.push(`${basePath}/skills/${skill}/SKILL.md`);
		}
	}

	return [...new Set(refs)];
}

/**
 * Build complete dependency graph for a command.
 * Parses the command file for agent references, then each agent for skill references.
 *
 * @param commandPath - Path to the command file
 * @returns TaskEither with dependency graph or error
 */
export function buildDependencyGraph(
	commandPath: string,
): TE.TaskEither<Error, DependencyGraph> {
	return pipe(
		TE.tryCatch(
			async () => {
				const commandFile = Bun.file(commandPath);
				const commandContent = await commandFile.text();
				const agentPaths = parseAgentRefs(commandContent);

				const skillPaths: string[] = [];
				for (const agentPath of agentPaths) {
					const agentFile = Bun.file(agentPath);
					if (await agentFile.exists()) {
						const agentContent = await agentFile.text();
						skillPaths.push(...parseSkillRefs(agentContent));
					}
				}

				const match = commandPath.match(/commands\/(.+)\.md$/);
				const commandName = match ? match[1] : commandPath;

				return {
					command: commandName,
					commandPath,
					agents: agentPaths,
					skills: [...new Set(skillPaths)],
				};
			},
			(error: unknown) => new Error(`Failed to build dep graph: ${error}`),
		),
	);
}
