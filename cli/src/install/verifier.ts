/**
 * Installation verification module.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import type { CLIError } from "../../shared/errors.js";
import { verificationError } from "../../shared/errors.js";
import { discoverPlugins, getAllArtifactNames } from "./manifest.js";
import type { VerificationReport } from "./models.js";

/**
 * Recursively find all files matching a pattern in a directory.
 */
const findFiles = async (dir: string, pattern: RegExp): Promise<string[]> => {
	const results: string[] = [];

	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				const subResults = await findFiles(fullPath, pattern);
				results.push(...subResults);
			} else if (pattern.test(entry.name)) {
				results.push(fullPath);
			}
		}
	} catch {
		// Directory doesn't exist
	}

	return results;
};

/**
 * Check file health (exists, readable, valid YAML frontmatter).
 */
const checkFileHealth = async (filePath: string): Promise<string[]> => {
	const issues: string[] = [];
	const fileName = filePath.split("/").pop() ?? filePath;

	try {
		const content = await readFile(filePath, "utf-8");

		if (!content.startsWith("---")) {
			issues.push(`Missing YAML frontmatter in ${fileName}`);
			return issues;
		}

		const parts = content.split("---", 3);
		if (parts.length < 3) {
			issues.push(`Invalid frontmatter structure in ${fileName}`);
			return issues;
		}

		try {
			parseYaml(parts[1]);
		} catch (e) {
			issues.push(`Invalid YAML in ${fileName}: ${e}`);
		}
	} catch (e) {
		issues.push(`Cannot read ${fileName}: ${e}`);
	}

	return issues;
};

/**
 * Verify rp1 installation health.
 */
/**
 * Expected artifact counts for verification.
 * Pass these from the bundled manifest or let the verifier discover them from disk.
 */
export interface ExpectedCounts {
	readonly agents: number;
	readonly skills: number;
}

export const verifyInstallation = (
	artifactsDir?: string,
	expectedCounts?: ExpectedCounts,
): TE.TaskEither<CLIError, VerificationReport> =>
	TE.tryCatch(
		async () => {
			const configDir = join(homedir(), ".config", "opencode");

			try {
				await stat(configDir);
			} catch {
				throw new Error(
					"OpenCode configuration directory not found.\nExpected: ~/.config/opencode/\nPlease install OpenCode first.",
				);
			}

			const issues: string[] = [];

			// Discover expected artifacts from manifests or use provided counts
			let expectedAgents: Set<string> = new Set();
			let expectedSkills: Set<string> = new Set();

			if (artifactsDir) {
				try {
					const result = await discoverPlugins(artifactsDir)();
					if (result._tag === "Right") {
						const names = getAllArtifactNames(result.right);
						expectedAgents = names.agents;
						expectedSkills = names.skills;
					}
				} catch {
					// Can't read manifests, fall through to counts below
				}
			}

			// Resolve expected counts: manifest names > explicit counts > fallback
			// Agents default to 0 (agents are embedded in skills, not separate files)
			const agentsExpected =
				expectedAgents.size > 0
					? expectedAgents.size
					: (expectedCounts?.agents ?? 0);
			const skillsExpected =
				expectedSkills.size > 0
					? expectedSkills.size
					: (expectedCounts?.skills ?? 1);

			// Check agents
			const agentDir = join(configDir, "agents");
			const rp1Agents = await findFiles(agentDir, /\.md$/);
			const agentsFound = rp1Agents.length;

			if (expectedAgents.size > 0) {
				const installedAgentNames = new Set(
					rp1Agents.map(
						(agent) => agent.split("/").pop()?.replace(".md", "") ?? "",
					),
				);
				const missingAgents = [...expectedAgents].filter(
					(agent) => !installedAgentNames.has(agent),
				);
				if (missingAgents.length > 0) {
					issues.push(
						`Missing agents (${missingAgents.length}): ${missingAgents.slice(0, 5).join(", ")}${missingAgents.length > 5 ? "..." : ""}. Re-run installation to fix.`,
					);
				}
			} else if (agentsFound < agentsExpected) {
				issues.push(
					`Missing agents: found ${agentsFound}, expected ${agentsExpected}. Re-run installation to fix.`,
				);
			}

			// Validate agent files
			for (const agentFile of rp1Agents) {
				const fileIssues = await checkFileHealth(agentFile);
				issues.push(...fileIssues);
			}

			// Check skills (namespaced under rp1-* directories)
			const skillsDir = join(configDir, "skills");
			let skillsFound = 0;
			const missingSkillNames: string[] = [];

			if (expectedSkills.size > 0) {
				// Check each expected skill from manifest
				for (const skillName of expectedSkills) {
					const skillDir = join(skillsDir, skillName);
					const skillFile = join(skillDir, "SKILL.md");

					try {
						await stat(skillFile);
						skillsFound++;

						const fileIssues = await checkFileHealth(skillFile);
						issues.push(...fileIssues);
					} catch {
						missingSkillNames.push(skillName);
					}
				}
			} else {
				// Fallback: count all rp1-* skill directories
				try {
					const entries = await readdir(skillsDir, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
							const skillFile = join(skillsDir, entry.name, "SKILL.md");
							try {
								await stat(skillFile);
								skillsFound++;

								const fileIssues = await checkFileHealth(skillFile);
								issues.push(...fileIssues);
							} catch {
								// Skill directory exists but no SKILL.md
							}
						}
					}
				} catch {
					// Skills directory doesn't exist
				}

				if (skillsFound < skillsExpected) {
					issues.push(
						`Missing skills: found ${skillsFound}, expected ${skillsExpected}. Re-run installation to fix.`,
					);
				}
			}

			if (missingSkillNames.length > 0) {
				issues.push(
					`Missing skills (${missingSkillNames.length}): ${missingSkillNames.slice(0, 5).join(", ")}${missingSkillNames.length > 5 ? "..." : ""}. Re-run installation to fix.`,
				);
			}

			// Check plugins
			const pluginDir = join(configDir, "plugins");
			const expectedPlugins = ["rp1-base-hooks"];
			let pluginsFound = 0;
			const missingPluginNames: string[] = [];

			for (const pluginName of expectedPlugins) {
				const pluginPath = join(pluginDir, `${pluginName}.ts`);
				try {
					await stat(pluginPath);
					pluginsFound++;
				} catch {
					missingPluginNames.push(pluginName);
				}
			}

			if (missingPluginNames.length > 0) {
				issues.push(
					`Missing plugins (${missingPluginNames.length}): ${missingPluginNames.join(", ")}. Note: Plugins provide session hooks.`,
				);
			}

			const pluginsExpected = expectedPlugins.length;

			return {
				// Commands deprecated (migrated to skills) - always 0/0
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound,
				agentsExpected,
				skillsFound,
				skillsExpected,
				pluginsFound,
				pluginsExpected,
				issues,
			};
		},
		(e) => verificationError(`Verification failed: ${e}`, []),
	);

/**
 * List installed rp1 skills with their metadata.
 */
export const listInstalledSkills = (): TE.TaskEither<
	CLIError,
	Array<{ plugin: string; name: string; description: string }>
> =>
	TE.tryCatch(
		async () => {
			const skillsDir = join(homedir(), ".config", "opencode", "skills");
			const skills: Array<{
				plugin: string;
				name: string;
				description: string;
			}> = [];

			try {
				const entries = await readdir(skillsDir, { withFileTypes: true });

				for (const entry of entries) {
					if (!entry.isDirectory() || !entry.name.startsWith("rp1-")) {
						continue;
					}

					const skillFile = join(skillsDir, entry.name, "SKILL.md");
					let description = "No description";

					try {
						const content = await readFile(skillFile, "utf-8");
						if (content.startsWith("---")) {
							const parts = content.split("---", 3);
							if (parts.length >= 3) {
								const frontmatter = parseYaml(parts[1]) as Record<
									string,
									unknown
								>;
								description = String(
									frontmatter.description ?? "No description",
								);
							}
						}
					} catch {
						continue;
					}

					// Determine plugin from skill name prefix pattern
					// Skills are prefixed rp1-{name}, plugin is inferred from available metadata
					const plugin = "rp1";

					skills.push({ plugin, name: entry.name, description });
				}
			} catch {
				// Skills directory doesn't exist
			}

			return skills.sort((a, b) => a.name.localeCompare(b.name));
		},
		(e) => verificationError(`Failed to list skills: ${e}`, []),
	);

/**
 * @deprecated Use listInstalledSkills instead. Commands have been migrated to skills.
 */
export const listInstalledCommands = listInstalledSkills;
