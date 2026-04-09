/**
 * Installation verification module.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import {
	type CanonicalName,
	toCanonicalString,
	toUserFacing,
} from "../../shared/canonical-name.js";
import type { CLIError } from "../../shared/errors.js";
import { verificationError } from "../../shared/errors.js";
import {
	collectPlatformPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../assets/index.js";
import { getClaudePluginDirs } from "../shared/paths.js";
import { getDefaultArtifactsDir } from "./installer.js";
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

type InstalledPlatform = "claude-code" | "opencode" | "codex";

type InstalledSkill = {
	plugin: string;
	name: string;
	description: string;
	canonical_name: string;
	user_facing_name: string;
	installed_platforms: InstalledPlatform[];
	invocations: Partial<Record<InstalledPlatform, string>>;
};

type InstalledSkillObservation = {
	plugin: string;
	name: string;
	description: string;
	canonicalName: string;
	userFacingName: string;
	platform: InstalledPlatform;
	invocation: string;
};

type SkillCatalogEntry = {
	plugin: string;
	name: string;
};

const INSTALLED_PLATFORM_ORDER: readonly InstalledPlatform[] = [
	"claude-code",
	"opencode",
	"codex",
];

const isInstalledPlatform = (value: string): value is InstalledPlatform =>
	INSTALLED_PLATFORM_ORDER.includes(value as InstalledPlatform);

const normalizePluginName = (plugin: string): string =>
	plugin.replace(/^rp1-/, "");

const toInvocation = (
	platform: InstalledPlatform,
	installedName: string,
): string => (platform === "codex" ? `$${installedName}` : `/${installedName}`);

const toCatalogKey = (
	platform: InstalledPlatform,
	installedName: string,
): string => `${platform}:${installedName}`;

const addCatalogEntry = (
	catalog: Map<string, SkillCatalogEntry>,
	platform: InstalledPlatform,
	installedName: string,
	plugin: string,
	name: string,
): void => {
	catalog.set(toCatalogKey(platform, installedName), { plugin, name });
};

const getInstalledNameFromAssetEntry = (entryName: string): string | null => {
	const normalized = entryName.replaceAll("\\", "/");
	const parts = normalized.split("/");
	return parts.at(-1) === "SKILL.md" ? (parts.at(-2) ?? null) : null;
};

const buildSkillCatalogFromBundledAssets = (): Map<
	string,
	SkillCatalogEntry
> => {
	const catalog = new Map<string, SkillCatalogEntry>();
	if (!hasBundledAssets()) {
		return catalog;
	}

	const bundledAssets = getBundledAssets();
	if (E.isLeft(bundledAssets)) {
		return catalog;
	}

	for (const [platformName, bundledPlatform] of Object.entries(
		bundledAssets.right.platforms,
	)) {
		if (!bundledPlatform || !isInstalledPlatform(platformName)) {
			continue;
		}

		for (const plugin of collectPlatformPlugins(bundledPlatform)) {
			const pluginName = normalizePluginName(plugin.name);
			for (const skill of plugin.skills) {
				const installedName = getInstalledNameFromAssetEntry(skill.name);
				if (!installedName) {
					continue;
				}

				addCatalogEntry(
					catalog,
					platformName,
					installedName,
					pluginName,
					installedName.replace(/^rp1-/, ""),
				);
			}
		}
	}

	return catalog;
};

const buildSkillCatalogFromArtifacts = async (): Promise<
	Map<string, SkillCatalogEntry>
> => {
	const catalog = new Map<string, SkillCatalogEntry>();
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidateRoots = new Set<string>();
	const defaultArtifactsDir = getDefaultArtifactsDir();
	if (defaultArtifactsDir) {
		candidateRoots.add(dirname(defaultArtifactsDir));
	}
	candidateRoots.add(join(moduleDir, "..", "..", "..", "dist"));
	candidateRoots.add(join(process.cwd(), "dist"));

	for (const artifactsRoot of candidateRoots) {
		if (!existsSync(artifactsRoot)) {
			continue;
		}

		for (const platform of INSTALLED_PLATFORM_ORDER) {
			const platformArtifactsDir = join(artifactsRoot, platform);
			if (!existsSync(platformArtifactsDir)) {
				continue;
			}

			const result = await discoverPlugins(platformArtifactsDir)();
			if (E.isLeft(result)) {
				continue;
			}

			for (const manifest of result.right) {
				const pluginName = normalizePluginName(manifest.plugin);
				for (const skill of manifest.skills) {
					addCatalogEntry(
						catalog,
						platform,
						skill,
						pluginName,
						skill.replace(/^rp1-/, ""),
					);
				}
			}
		}
	}

	return catalog;
};

const buildSkillCatalog = async (): Promise<Map<string, SkillCatalogEntry>> => {
	const bundledCatalog = buildSkillCatalogFromBundledAssets();
	if (bundledCatalog.size > 0) {
		return bundledCatalog;
	}
	return buildSkillCatalogFromArtifacts();
};

const parseFrontmatter = (content: string): Record<string, unknown> | null => {
	if (!content.startsWith("---")) {
		return null;
	}

	const parts = content.split("---", 3);
	if (parts.length < 3) {
		return null;
	}

	return parseYaml(parts[1]) as Record<string, unknown>;
};

const getDescriptionFromFrontmatter = (
	frontmatter: Record<string, unknown> | null,
): string => String(frontmatter?.description ?? "No description");

const extractCanonicalNameFromFrontmatter = (
	frontmatter: Record<string, unknown> | null,
): CanonicalName | null => {
	const metadata =
		frontmatter?.metadata && typeof frontmatter.metadata === "object"
			? (frontmatter.metadata as Record<string, unknown>)
			: null;
	const rp1Metadata =
		metadata?.rp1 && typeof metadata.rp1 === "object"
			? (metadata.rp1 as Record<string, unknown>)
			: null;

	const plugin =
		typeof rp1Metadata?.plugin === "string" ? rp1Metadata.plugin : null;
	const name =
		typeof rp1Metadata?.name === "string"
			? rp1Metadata.name
			: typeof rp1Metadata?.skill_name === "string"
				? rp1Metadata.skill_name
				: null;

	if (!plugin || !name) {
		return null;
	}

	return { plugin: normalizePluginName(plugin), artifact: name };
};

const extractCanonicalNameFromContent = (
	content: string,
): CanonicalName | null => {
	const match = content.match(/resolve-args --name (rp1-[^:\s]+):([a-z0-9-]+)/);
	if (!match) {
		return null;
	}

	return {
		plugin: normalizePluginName(match[1]),
		artifact: match[2],
	};
};

const resolveCanonicalName = (
	platform: InstalledPlatform,
	installedName: string,
	frontmatter: Record<string, unknown> | null,
	content: string,
	skillCatalog: ReadonlyMap<string, SkillCatalogEntry>,
	fallbackPlugin?: string,
): CanonicalName => {
	const explicitCanonical = extractCanonicalNameFromFrontmatter(frontmatter);
	if (explicitCanonical) {
		return explicitCanonical;
	}

	const catalogEntry = skillCatalog.get(toCatalogKey(platform, installedName));
	if (catalogEntry) {
		return { plugin: catalogEntry.plugin, artifact: catalogEntry.name };
	}

	const contentCanonical = extractCanonicalNameFromContent(content);
	if (contentCanonical) {
		return contentCanonical;
	}

	return {
		plugin: fallbackPlugin ?? "unknown",
		artifact: installedName.replace(/^rp1-/, ""),
	};
};

const toInstalledSkillObservation = (
	platform: InstalledPlatform,
	installedName: string,
	description: string,
	canonicalName: CanonicalName,
): InstalledSkillObservation => ({
	plugin: canonicalName.plugin,
	name: canonicalName.artifact,
	description,
	canonicalName: toCanonicalString(canonicalName),
	userFacingName: toUserFacing(canonicalName),
	platform,
	invocation: toInvocation(platform, installedName),
});

const readInstalledSkillsFromDir = async (
	skillsDir: string,
	platform: InstalledPlatform,
	skillCatalog: ReadonlyMap<string, SkillCatalogEntry>,
	fallbackPlugin?: string,
	requireRp1Prefix: boolean = true,
): Promise<InstalledSkillObservation[]> => {
	const skills: InstalledSkillObservation[] = [];

	try {
		const entries = await readdir(skillsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (
				!entry.isDirectory() ||
				(requireRp1Prefix && !entry.name.startsWith("rp1-"))
			) {
				continue;
			}

			const skillFile = join(skillsDir, entry.name, "SKILL.md");
			try {
				const content = await readFile(skillFile, "utf-8");
				const frontmatter = parseFrontmatter(content);
				const description = getDescriptionFromFrontmatter(frontmatter);
				const canonicalName = resolveCanonicalName(
					platform,
					entry.name,
					frontmatter,
					content,
					skillCatalog,
					fallbackPlugin,
				);
				skills.push(
					toInstalledSkillObservation(
						platform,
						entry.name,
						description,
						canonicalName,
					),
				);
			} catch {}
		}
	} catch {
		// Skills directory doesn't exist
	}

	return skills;
};

interface ClaudeInstalledPluginsJson {
	version: number;
	plugins: Record<
		string,
		Array<{
			installPath: string;
		}>
	>;
}

const readClaudeInstalledSkills = async (
	home: string,
	skillCatalog: ReadonlyMap<string, SkillCatalogEntry>,
): Promise<InstalledSkillObservation[]> => {
	const observations: InstalledSkillObservation[] = [];

	for (const pluginRoot of getClaudePluginDirs(home)) {
		try {
			const content = await readFile(
				join(pluginRoot, "installed_plugins.json"),
				"utf-8",
			);
			const installedPlugins = JSON.parse(
				content,
			) as ClaudeInstalledPluginsJson;

			for (const [pluginId, entries] of Object.entries(
				installedPlugins.plugins,
			)) {
				const installPath = entries[0]?.installPath;
				if (!installPath) {
					continue;
				}

				const pluginName = normalizePluginName(pluginId.split("@")[0] ?? "");
				const skills = await readInstalledSkillsFromDir(
					join(installPath, "skills"),
					"claude-code",
					skillCatalog,
					pluginName,
					false,
				);
				observations.push(...skills);
			}
		} catch {
			// Claude Code may not be installed or may not have rp1 plugins
		}
	}

	return observations;
};

const getUserHomeDir = (): string => process.env.HOME ?? homedir();

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
			// Without a manifest, expected defaults to 0 (display shows count only)
			const agentsExpected =
				expectedAgents.size > 0
					? expectedAgents.size
					: (expectedCounts?.agents ?? 0);
			const skillsExpected =
				expectedSkills.size > 0
					? expectedSkills.size
					: (expectedCounts?.skills ?? 0);

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
	InstalledSkill[]
> =>
	TE.tryCatch(
		async () => {
			const home = getUserHomeDir();
			const skillCatalog = await buildSkillCatalog();
			const discoveredSkills = await Promise.all([
				readClaudeInstalledSkills(home, skillCatalog),
				readInstalledSkillsFromDir(
					join(home, ".config", "opencode", "skills"),
					"opencode",
					skillCatalog,
				),
				readInstalledSkillsFromDir(
					join(home, ".codex", "skills"),
					"codex",
					skillCatalog,
				),
			]);
			const dedupedSkills = new Map<string, InstalledSkill>();

			for (const skills of discoveredSkills) {
				for (const skill of skills) {
					const existing = dedupedSkills.get(skill.canonicalName);
					if (!existing) {
						dedupedSkills.set(skill.canonicalName, {
							plugin: skill.plugin,
							name: skill.name,
							description: skill.description,
							canonical_name: skill.canonicalName,
							user_facing_name: skill.userFacingName,
							installed_platforms: [skill.platform],
							invocations: {
								[skill.platform]: skill.invocation,
							},
						});
						continue;
					}

					if (existing.description === "No description") {
						existing.description = skill.description;
					}
					if (!existing.installed_platforms.includes(skill.platform)) {
						existing.installed_platforms.push(skill.platform);
					}
					existing.installed_platforms.sort(
						(a, b) =>
							INSTALLED_PLATFORM_ORDER.indexOf(a) -
							INSTALLED_PLATFORM_ORDER.indexOf(b),
					);
					existing.invocations[skill.platform] = skill.invocation;
				}
			}

			return [...dedupedSkills.values()].sort((a, b) =>
				a.user_facing_name.localeCompare(b.user_facing_name),
			);
		},
		(e) => verificationError(`Failed to list skills: ${e}`, []),
	);

/**
 * @deprecated Use listInstalledSkills instead. Commands have been migrated to skills.
 */
export const listInstalledCommands = listInstalledSkills;
