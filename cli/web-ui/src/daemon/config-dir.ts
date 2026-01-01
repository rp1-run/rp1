/**
 * Platform-specific configuration directory resolution.
 * Handles macOS, Linux, and Windows conventions for storing daemon state.
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Platform-specific configuration directory paths.
 * - macOS: ~/Library/Application Support/rp1/
 * - Linux: $XDG_CONFIG_HOME/rp1/ or ~/.config/rp1/
 * - Windows: %APPDATA%\rp1\
 */
export function getConfigDir(): string {
	const platform = process.platform;
	const home = homedir();

	if (platform === "darwin") {
		return join(home, "Library", "Application Support", "rp1");
	}

	if (platform === "win32") {
		const appData = process.env.APPDATA;
		if (appData) {
			return join(appData, "rp1");
		}
		return join(home, "AppData", "Roaming", "rp1");
	}

	// Linux and other Unix-like systems
	const xdgConfig = process.env.XDG_CONFIG_HOME;
	if (xdgConfig) {
		return join(xdgConfig, "rp1");
	}
	return join(home, ".config", "rp1");
}

/**
 * Ensure the configuration directory exists.
 * Creates the directory with user-only permissions if it doesn't exist.
 */
export async function ensureConfigDir(): Promise<string> {
	const configDir = getConfigDir();
	await mkdir(configDir, { recursive: true, mode: 0o700 });
	return configDir;
}

/**
 * Get the path to the daemon PID file.
 */
export function getPidFilePath(): string {
	return join(getConfigDir(), "daemon.pid");
}

/**
 * Get the path to the project registry file.
 */
export function getRegistryPath(): string {
	return join(getConfigDir(), "projects.json");
}
