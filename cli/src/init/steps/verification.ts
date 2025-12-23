/**
 * Plugin verification step for the rp1 init command.
 * Verifies that Claude Code plugins are correctly installed.
 */

import { readFile, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { PluginStatus, VerificationResult } from "../models.js";

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
 * Extract version from a plugin's manifest file.
 *
 * @param pluginPath - Path to the plugin directory
 * @returns Version string or null if not available
 */
async function extractPluginVersion(
	pluginPath: string,
): Promise<string | null> {
	try {
		const manifestPath = join(pluginPath, ".claude-plugin", "plugin.json");
		const manifestContent = await readFile(manifestPath, "utf-8");
		const manifest = JSON.parse(manifestContent) as { version?: string };
		return manifest.version ?? null;
	} catch {
		// Manifest not readable or doesn't have version
		return null;
	}
}

/**
 * Verify a single plugin installation.
 *
 * @param pluginDir - Base plugin directory
 * @param pluginName - Name of the plugin to verify
 * @returns PluginStatus with installation details
 */
async function verifyPlugin(
	pluginDir: string,
	pluginName: string,
): Promise<{ status: PluginStatus; issue: string | null }> {
	const pluginPath = join(pluginDir, `${pluginName}${PLUGIN_SUFFIX}`);

	try {
		const pluginStat = await stat(pluginPath);

		if (!pluginStat.isDirectory()) {
			// Path exists but is not a directory
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

		// Plugin directory exists - extract version
		const version = await extractPluginVersion(pluginPath);

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
		// Handle different error types
		if (error instanceof Error && "code" in error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				// Directory doesn't exist
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
				// Permission denied
				return {
					status: {
						name: pluginName,
						installed: false,
						version: null,
						location: null,
					},
					issue: `${pluginName}: permission denied when accessing plugin directory`,
				};
			}
		}

		// Generic read error
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
 * Verify Claude Code plugin installation.
 * Checks that both rp1-base and rp1-dev plugins are correctly installed.
 *
 * @param searchDirs - Optional list of directories to search (for testing)
 * @returns VerificationResult with plugin statuses and any issues found
 */
export async function verifyClaudeCodePlugins(
	searchDirs?: readonly string[],
): Promise<VerificationResult> {
	const plugins: PluginStatus[] = [];
	const issues: string[] = [];

	// Find the active plugin directory
	const pluginDir = await findPluginDirectory(searchDirs);

	if (!pluginDir) {
		// No Claude Code plugin directory found
		issues.push("Claude Code plugin directory not found");

		// Return all plugins as not installed
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

	// Verify each expected plugin
	for (const pluginName of EXPECTED_PLUGINS) {
		const result = await verifyPlugin(pluginDir, pluginName);
		plugins.push(result.status);
		if (result.issue) {
			issues.push(result.issue);
		}
	}

	// Verification passes if all plugins are installed
	const allInstalled = plugins.every((p) => p.installed);

	return {
		verified: allInstalled,
		plugins,
		issues,
	};
}
