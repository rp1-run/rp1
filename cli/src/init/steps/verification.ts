/**
 * Plugin verification step for the rp1 init command.
 * Verifies that Claude Code and OpenCode plugins are correctly installed.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_PLUGIN_DIRS } from "../../shared/paths.js";
import type {
	PluginStatus,
	StepCallbacks,
	VerificationResult,
} from "../models.js";

/**
 * Get the OpenCode config directory path.
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Path to OpenCode config directory
 */
export function getOpenCodeConfigDir(home: string = homedir()): string {
	return join(home, ".config", "opencode");
}

/**
 * Get the OpenCode skills directory path.
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Path to OpenCode skills directory
 */
export function getOpenCodeSkillsDir(home: string = homedir()): string {
	return join(getOpenCodeConfigDir(home), "skills");
}

/**
 * Expected OpenCode skill directory prefixes.
 * Skills are installed as rp1-{plugin}-{skill} directories.
 */
const EXPECTED_OPENCODE_PREFIXES = ["rp1-base-", "rp1-dev-"] as const;

/**
 * Verify OpenCode plugin installation.
 * Checks that rp1 hooks plugins are correctly installed and registered.
 *
 * @param home - Home directory (for testing, defaults to os.homedir())
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns VerificationResult with plugin statuses and any issues found
 */
export async function verifyOpenCodePlugins(
	home?: string,
	callbacks?: StepCallbacks,
): Promise<VerificationResult> {
	const plugins: PluginStatus[] = [];
	const issues: string[] = [];

	callbacks?.onActivity("Checking OpenCode skills directory", "info");

	const skillsDir = getOpenCodeSkillsDir(home);

	let rp1Dirs: string[] = [];
	try {
		const dirStat = await stat(skillsDir);
		if (dirStat.isDirectory()) {
			const entries = await readdir(skillsDir);
			rp1Dirs = entries.filter((e) => e.startsWith("rp1-"));
		}
	} catch {
		issues.push("OpenCode skills directory not found");
		callbacks?.onActivity("OpenCode skills directory not found", "warning");
	}

	// Check each expected prefix has matching skill directories
	for (const prefix of EXPECTED_OPENCODE_PREFIXES) {
		const matchingDirs = rp1Dirs.filter((d) => d.startsWith(prefix));
		const pluginLabel = prefix.replace(/^rp1-/, "").replace(/-$/, "");

		if (matchingDirs.length > 0) {
			plugins.push({
				name: `rp1-${pluginLabel}`,
				installed: true,
				version: `${matchingDirs.length} skills`,
				location: skillsDir,
			});
		} else {
			plugins.push({
				name: `rp1-${pluginLabel}`,
				installed: false,
				version: null,
				location: null,
			});
			issues.push(`No rp1-${pluginLabel}-* skills found in ${skillsDir}`);
		}
	}

	const allInstalled = plugins.every((p) => p.installed);

	if (allInstalled) {
		callbacks?.onActivity("OpenCode plugins verified", "success");
	} else {
		const missingCount = plugins.filter((p) => !p.installed).length;
		callbacks?.onActivity(
			`${missingCount} OpenCode plugin group(s) not found`,
			"warning",
		);
	}

	return {
		verified: allInstalled,
		plugins,
		issues,
	};
}

/**
 * Expected plugin names that should be installed.
 */
const EXPECTED_PLUGINS = ["rp1-base", "rp1-dev"] as const;

/**
 * Plugin directory name suffixes used by Claude Code.
 * Stable: <name>@rp1-run, Dev: <name>@rp1-local.
 */
const PLUGIN_SUFFIXES = ["@rp1-run", "@rp1-local"] as const;

/**
 * Structure of installed_plugins.json
 */
interface InstalledPluginsJson {
	version: number;
	plugins: Record<
		string,
		Array<{
			scope: string;
			installPath: string;
			version: string;
			installedAt: string;
			lastUpdated: string;
			isLocal?: boolean;
			gitCommitSha?: string;
		}>
	>;
}

/**
 * Read and parse installed_plugins.json from Claude Code plugins directory.
 *
 * @param pluginDir - Path to the plugins directory
 * @returns Parsed installed plugins data or null if not found/invalid
 */
async function readInstalledPluginsJson(
	pluginDir: string,
): Promise<InstalledPluginsJson | null> {
	try {
		const jsonPath = join(pluginDir, "installed_plugins.json");
		const content = await readFile(jsonPath, "utf-8");
		return JSON.parse(content) as InstalledPluginsJson;
	} catch {
		return null;
	}
}

/**
 * Find the active Claude Code plugin directory.
 * Returns the first directory that exists from the provided list.
 *
 * @param dirs - List of directories to search (defaults to CLAUDE_PLUGIN_DIRS)
 * @returns Path to the plugin directory, or null if none found
 */
async function findPluginDirectory(
	dirs: readonly string[] = CLAUDE_PLUGIN_DIRS,
): Promise<string | null> {
	for (const dir of dirs) {
		try {
			const dirStat = await stat(dir);
			if (dirStat.isDirectory()) {
				return dir;
			}
		} catch {}
	}
	return null;
}

/**
 * Verify a single plugin installation using installed_plugins.json.
 *
 * @param pluginName - Name of the plugin to verify (e.g., "rp1-base")
 * @param installedPlugins - Parsed installed_plugins.json data
 * @returns PluginStatus with installation details
 */
function verifyPluginFromJson(
	pluginName: string,
	installedPlugins: InstalledPluginsJson | null,
): { status: PluginStatus; issue: string | null } {
	if (!installedPlugins) {
		return {
			status: {
				name: pluginName,
				installed: false,
				version: null,
				location: null,
			},
			issue: `${pluginName}: installed_plugins.json not found`,
		};
	}

	// Check all known marketplace suffixes (stable and dev)
	for (const suffix of PLUGIN_SUFFIXES) {
		const fullPluginId = `${pluginName}${suffix}`;
		const pluginEntries = installedPlugins.plugins[fullPluginId];

		if (pluginEntries && pluginEntries.length > 0) {
			const latestEntry = pluginEntries[0];
			return {
				status: {
					name: pluginName,
					installed: true,
					version: latestEntry.version ?? "unknown",
					location: latestEntry.installPath,
				},
				issue: null,
			};
		}
	}

	return {
		status: {
			name: pluginName,
			installed: false,
			version: null,
			location: null,
		},
		issue: `${pluginName} not found in installed plugins`,
	};
}

/**
 * Verify Claude Code plugin installation.
 * Checks that both rp1-base and rp1-dev plugins are correctly installed.
 * Uses Claude Code's installed_plugins.json for verification.
 *
 * @param searchDirs - Optional list of directories to search (for testing)
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns VerificationResult with plugin statuses and any issues found
 */
export async function verifyClaudeCodePlugins(
	searchDirs?: readonly string[],
	callbacks?: StepCallbacks,
): Promise<VerificationResult> {
	const plugins: PluginStatus[] = [];
	const issues: string[] = [];

	callbacks?.onActivity("Checking Claude Code plugins", "info");

	// Find the active plugin directory
	const pluginDir = await findPluginDirectory(searchDirs);

	if (!pluginDir) {
		issues.push("Claude Code plugin directory not found");
		callbacks?.onActivity("Claude Code plugin directory not found", "warning");

		return {
			verified: false,
			plugins: EXPECTED_PLUGINS.map((name) => ({
				name,
				installed: false,
				version: null,
				location: null,
			})),
			issues,
		};
	}

	// Read installed_plugins.json for verification
	const installedPlugins = await readInstalledPluginsJson(pluginDir);

	// Verify each expected plugin
	for (const pluginName of EXPECTED_PLUGINS) {
		const result = verifyPluginFromJson(pluginName, installedPlugins);
		plugins.push(result.status);
		if (result.issue) {
			issues.push(result.issue);
		}
	}

	// Verification passes if all plugins are installed
	const allInstalled = plugins.every((p) => p.installed);

	// Report result
	if (allInstalled) {
		callbacks?.onActivity("Claude Code plugins verified", "success");
	} else {
		const missingCount = plugins.filter((p) => !p.installed).length;
		callbacks?.onActivity(
			`${missingCount} Claude Code plugin(s) not found`,
			"warning",
		);
	}

	return {
		verified: allInstalled,
		plugins,
		issues,
	};
}

/**
 * Get the Codex agents skills directory path.
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Path to Codex agents skills directory
 */
export function getCodexSkillsDir(home: string = homedir()): string {
	return join(home, ".agents", "skills");
}

/**
 * Get the Codex config.toml path.
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Path to Codex config.toml
 */
export function getCodexConfigFile(home: string = homedir()): string {
	return join(home, ".codex", "config.toml");
}

/**
 * Verify Codex CLI plugin installation.
 * Checks for rp1 skill directories under ~/.agents/skills/ and confirms
 * rp1-managed config was merged into ~/.codex/config.toml.
 *
 * @param home - Home directory (for testing, defaults to os.homedir())
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns VerificationResult with plugin-style statuses and any issues found
 */
export async function verifyCodexPlugins(
	home?: string,
	callbacks?: StepCallbacks,
): Promise<VerificationResult> {
	const plugins: PluginStatus[] = [];
	const issues: string[] = [];

	callbacks?.onActivity("Checking Codex CLI skills directory", "info");

	const skillsDir = getCodexSkillsDir(home);
	const configFile = getCodexConfigFile(home);
	let hasBaseSkills = false;
	let hasDevSkills = false;

	try {
		const dirStat = await stat(skillsDir);
		if (dirStat.isDirectory()) {
			const entries = await readdir(skillsDir);
			const rp1Dirs = entries.filter((e) => e.startsWith("rp1-"));
			hasBaseSkills = rp1Dirs.some((entry) => entry.startsWith("rp1-base-"));
			hasDevSkills = rp1Dirs.some((entry) => entry.startsWith("rp1-dev-"));

			if (rp1Dirs.length > 0) {
				callbacks?.onActivity(
					`Found ${rp1Dirs.length} rp1 skill(s) in Codex agents directory`,
					"info",
				);
			}
		}
	} catch {
		// Skills directory doesn't exist
		issues.push("Codex agents skills directory not found");
		callbacks?.onActivity("Codex agents skills directory not found", "warning");
	}

	if (!hasBaseSkills) {
		issues.push("Codex base skills not found in ~/.agents/skills");
	}

	if (!hasDevSkills) {
		issues.push("Codex dev skills not found in ~/.agents/skills");
	}

	let configInstalled = false;
	try {
		const configContent = await readFile(configFile, "utf-8");
		configInstalled =
			configContent.includes("# rp1:start") &&
			configContent.includes("# rp1:end");
	} catch {
		issues.push("Codex config.toml not found");
	}

	if (!configInstalled) {
		issues.push("Codex config.toml is missing the rp1 managed section");
		callbacks?.onActivity(
			"Codex config.toml is missing the rp1 managed section",
			"warning",
		);
	}

	plugins.push({
		name: "rp1-base",
		installed: hasBaseSkills,
		version: "unknown",
		location: hasBaseSkills ? skillsDir : null,
	});
	plugins.push({
		name: "rp1-dev",
		installed: hasDevSkills,
		version: "unknown",
		location: hasDevSkills ? skillsDir : null,
	});

	const verified = hasBaseSkills && hasDevSkills && configInstalled;

	if (verified) {
		callbacks?.onActivity("Codex plugins verified", "success");
	} else {
		const missingCount = plugins.filter((p) => !p.installed).length;
		callbacks?.onActivity(
			missingCount > 0
				? `${missingCount} Codex plugin group(s) not found`
				: "Codex config verification failed",
			"warning",
		);
	}

	return {
		verified,
		plugins,
		issues,
	};
}
