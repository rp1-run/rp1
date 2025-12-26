/**
 * Plugin verification step for the rp1 init command.
 * Verifies that Claude Code and OpenCode plugins are correctly installed.
 */

import { readFile, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
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
 * Get the OpenCode plugin directory path.
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Path to OpenCode plugin directory
 */
export function getOpenCodePluginDir(home: string = homedir()): string {
	return join(getOpenCodeConfigDir(home), "plugin");
}

/**
 * Expected OpenCode plugin names (hooks plugins).
 */
const EXPECTED_OPENCODE_PLUGINS = ["rp1-base-hooks"] as const;

/**
 * Read and parse OpenCode config file.
 *
 * @param configDir - OpenCode config directory
 * @returns Parsed config or null if not found/invalid
 */
async function readOpenCodeConfig(
	configDir: string,
): Promise<{ plugin?: string[] } | null> {
	try {
		const configPath = join(configDir, "opencode.json");
		const content = await readFile(configPath, "utf-8");
		return JSON.parse(content) as { plugin?: string[] };
	} catch {
		return null;
	}
}

/**
 * Verify a single OpenCode plugin installation.
 *
 * @param pluginDir - Base plugin directory (~/.config/opencode/plugin/)
 * @param pluginName - Name of the plugin to verify (e.g., "rp1-base-hooks")
 * @param registeredPlugins - List of plugins registered in opencode.json
 * @returns PluginStatus with installation details
 */
async function verifyOpenCodePlugin(
	pluginDir: string,
	pluginName: string,
	registeredPlugins: string[],
): Promise<{ status: PluginStatus; issue: string | null }> {
	const pluginPath = join(pluginDir, pluginName);
	const expectedConfigEntry = `./plugin/${pluginName}`;

	// Check if registered in config
	const isRegistered = registeredPlugins.includes(expectedConfigEntry);

	try {
		const pluginStat = await stat(pluginPath);

		if (!pluginStat.isDirectory()) {
			return {
				status: {
					name: pluginName,
					installed: false,
					version: null,
					location: null,
				},
				issue: `${pluginName} path exists but is not a directory`,
			};
		}

		// Plugin directory exists - check for index.ts or index.js
		let version: string | null = null;
		try {
			const packagePath = join(pluginPath, "package.json");
			const packageContent = await readFile(packagePath, "utf-8");
			const pkg = JSON.parse(packageContent) as { version?: string };
			version = pkg.version ?? null;
		} catch {
			// No package.json, that's ok for OpenCode plugins
		}

		if (!isRegistered) {
			return {
				status: {
					name: pluginName,
					installed: true,
					version: version ?? "unknown",
					location: pluginPath,
				},
				issue: `${pluginName} exists but not registered in opencode.json`,
			};
		}

		return {
			status: {
				name: pluginName,
				installed: true,
				version: version ?? "unknown",
				location: pluginPath,
			},
			issue: null,
		};
	} catch (error) {
		if (error instanceof Error && "code" in error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return {
					status: {
						name: pluginName,
						installed: false,
						version: null,
						location: null,
					},
					issue: `${pluginName} not found at expected location`,
				};
			}
			if (nodeError.code === "EACCES") {
				return {
					status: {
						name: pluginName,
						installed: false,
						version: null,
						location: null,
					},
					issue: `${pluginName}: permission denied`,
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
			issue: `${pluginName}: error checking plugin directory`,
		};
	}
}

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

	callbacks?.onActivity("Checking OpenCode plugin directory", "info");

	const configDir = getOpenCodeConfigDir(home);
	const pluginDir = getOpenCodePluginDir(home);

	// Read OpenCode config to check plugin registration
	const config = await readOpenCodeConfig(configDir);
	const registeredPlugins = config?.plugin ?? [];

	// Check if plugin directory exists
	try {
		const dirStat = await stat(pluginDir);
		if (!dirStat.isDirectory()) {
			issues.push("OpenCode plugin directory is not a directory");
			callbacks?.onActivity(
				"OpenCode plugin directory is not valid",
				"warning",
			);
			return {
				verified: false,
				plugins: EXPECTED_OPENCODE_PLUGINS.map((name) => ({
					name,
					installed: false,
					version: null,
					location: null,
				})),
				issues,
			};
		}
	} catch {
		// Plugin directory doesn't exist - plugins not installed
		issues.push("OpenCode plugin directory not found");
		callbacks?.onActivity("OpenCode plugin directory not found", "warning");
		return {
			verified: false,
			plugins: EXPECTED_OPENCODE_PLUGINS.map((name) => ({
				name,
				installed: false,
				version: null,
				location: null,
			})),
			issues,
		};
	}

	// Verify each expected plugin
	for (const pluginName of EXPECTED_OPENCODE_PLUGINS) {
		const result = await verifyOpenCodePlugin(
			pluginDir,
			pluginName,
			registeredPlugins,
		);
		plugins.push(result.status);
		if (result.issue) {
			issues.push(result.issue);
		}
	}

	// Verification passes if all plugins are installed
	const allInstalled = plugins.every((p) => p.installed);

	// Report result
	if (allInstalled) {
		callbacks?.onActivity("OpenCode plugins verified", "success");
	} else {
		const missingCount = plugins.filter((p) => !p.installed).length;
		callbacks?.onActivity(
			`${missingCount} OpenCode plugin(s) not found`,
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
 * Get Claude Code plugin directory locations.
 * Returns directories ordered by preference - first found directory is used.
 *
 * macOS/Linux: ~/.claude/plugins
 * XDG fallback: ~/.config/claude-code/plugins
 * Windows: %APPDATA%\claude\plugins (via homedir() + AppData path)
 *
 * @param home - Home directory (defaults to os.homedir())
 * @returns Array of potential plugin directory paths
 */
export function getClaudePluginDirs(
	home: string = homedir(),
): readonly string[] {
	return platform() === "win32"
		? [
				join(home, "AppData", "Roaming", "claude", "plugins"),
				join(home, ".claude", "plugins"),
			]
		: [
				join(home, ".claude", "plugins"),
				join(home, ".config", "claude-code", "plugins"),
			];
}

/**
 * Claude Code plugin directory locations.
 * Uses system homedir() for production use.
 */
export const CLAUDE_PLUGIN_DIRS: readonly string[] = getClaudePluginDirs();

/**
 * Expected plugin names that should be installed.
 */
const EXPECTED_PLUGINS = ["rp1-base", "rp1-dev"] as const;

/**
 * Plugin directory name suffix used by Claude Code.
 * Plugins are installed as <name>@<marketplace>.
 */
const PLUGIN_SUFFIX = "@rp1-run";

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
	const fullPluginId = `${pluginName}${PLUGIN_SUFFIX}`;

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

	const pluginEntries = installedPlugins.plugins[fullPluginId];

	if (!pluginEntries || pluginEntries.length === 0) {
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
