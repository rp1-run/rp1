/**
 * Platform-specific configuration directory resolution.
 * Handles macOS, Linux, and Windows conventions for storing daemon state.
 * Also provides daemon state file utilities for recovery tracking.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
 * Get the path to the lifecycle lock directory.
 * Used by lifecycle-lock.ts for cross-process daemon mutation serialization.
 */
export function getLifecycleLockPath(): string {
	return join(getConfigDir(), "daemon.lifecycle.lock");
}

/**
 * Get the path to the restart-arcade-after-install marker file.
 * Written by the install preparation helper and read by the post-install flow.
 */
export function getRestartMarkerPath(): string {
	return join(getConfigDir(), "restart-arcade-after-install");
}

/**
 * Daemon state file shape for tracking recovery state across restarts.
 */
export interface DaemonState {
	readonly lastEventId: number;
	readonly lastStartedAt: string;
}

/**
 * Get the path to the daemon state file.
 * Located alongside the rp1.db at ~/.rp1/daemon-state.json.
 */
export function getDaemonStatePath(): string {
	return join(homedir(), ".rp1", "daemon-state.json");
}

/**
 * Read the daemon state file. Returns null if the file does not exist
 * or cannot be parsed. This is expected on first startup.
 */
export function readDaemonState(): DaemonState | null {
	const statePath = getDaemonStatePath();
	if (!existsSync(statePath)) {
		return null;
	}

	try {
		const content = readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(content) as Record<string, unknown>;
		if (
			typeof parsed.lastEventId === "number" &&
			typeof parsed.lastStartedAt === "string"
		) {
			return {
				lastEventId: parsed.lastEventId,
				lastStartedAt: parsed.lastStartedAt,
			};
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Write the daemon state file. Creates the parent directory if needed.
 */
export function writeDaemonState(state: DaemonState): void {
	const statePath = getDaemonStatePath();
	const dir = dirname(statePath);
	if (!existsSync(dir)) {
		const { mkdirSync } = require("node:fs");
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}
