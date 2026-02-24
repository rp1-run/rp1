/**
 * Shared path utilities for Claude Code plugin directories.
 * Single source of truth for plugin directory resolution across the CLI.
 */

import { homedir, platform } from "node:os";
import { join } from "node:path";

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
