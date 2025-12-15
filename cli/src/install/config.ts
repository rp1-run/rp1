/**
 * Configuration management module for OpenCode.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { configError } from "../../shared/errors.js";

/**
 * Create backup of existing config file.
 */
export const backupConfig = (
	configPath: string,
): TE.TaskEither<CLIError, string | null> =>
	TE.tryCatch(
		async () => {
			try {
				await readFile(configPath);
			} catch {
				return null; // No existing config
			}

			const backupDir = join(homedir(), ".opencode-rp1-backups");
			await mkdir(backupDir, { recursive: true });

			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19);
			const fileName = configPath.split("/").pop() ?? "config";
			const backupPath = join(backupDir, `${fileName}.backup.${timestamp}`);

			await copyFile(configPath, backupPath);

			return backupPath;
		},
		(e) => configError(`Failed to backup config: ${e}`),
	);

/**
 * Read OpenCode configuration.
 */
export const readOpenCodeConfig = (
	configPath: string,
): TE.TaskEither<CLIError, Record<string, unknown>> =>
	TE.tryCatch(
		async () => {
			try {
				const content = await readFile(configPath, "utf-8");
				return JSON.parse(content) as Record<string, unknown>;
			} catch {
				return {};
			}
		},
		(e) => configError(`Failed to read config: ${e}`),
	);

/**
 * Register an OpenCode plugin in the user's opencode.json config.
 * Adds the plugin path to the plugin array if not already present.
 *
 * @param configPath - Path to opencode.json
 * @param pluginName - Plugin name (e.g., "rp1-base-hooks")
 * @returns TaskEither indicating success or failure
 */
export const registerOpenCodePlugin = (
	configPath: string,
	pluginName: string,
): TE.TaskEither<CLIError, boolean> =>
	TE.tryCatch(
		async () => {
			let config: Record<string, unknown> = {};

			try {
				const content = await readFile(configPath, "utf-8");
				config = JSON.parse(content) as Record<string, unknown>;
			} catch {
				// File doesn't exist or is invalid - start fresh
			}

			// Ensure plugin array exists
			if (!Array.isArray(config.plugin)) {
				config.plugin = [];
			}

			// Plugin path relative to ~/.config/opencode/
			const pluginPath = `./plugin/${pluginName}`;

			// Check if already registered
			const plugins = config.plugin as string[];
			if (plugins.includes(pluginPath)) {
				return false; // Already registered
			}

			// Add plugin to array
			plugins.push(pluginPath);

			// Ensure parent directory exists
			await mkdir(dirname(configPath), { recursive: true });

			// Write config (preserving existing keys)
			await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
			return true; // Newly registered
		},
		(e) => configError(`Failed to register plugin: ${e}`),
	);

/**
 * Get the default OpenCode config directory.
 */
export const getConfigDir = (): string =>
	join(homedir(), ".config", "opencode");

/**
 * Get the default OpenCode config file path.
 */
export const getConfigPath = (): string =>
	join(getConfigDir(), "opencode.json");
