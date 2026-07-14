/**
 * Configuration management module for OpenCode.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { configError } from "../../shared/errors.js";
import { type InstallPathContext, resolveInstallPathContext } from "./paths.js";

/**
 * Create backup of existing config file.
 */
export const backupConfig = (
	configPath: string,
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, string | null> =>
	TE.tryCatch(
		async () => {
			try {
				await readFile(configPath);
			} catch {
				return null; // No existing config
			}

			const backupDir = paths.backupDir;
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
 * Uses file:// URL with absolute path (required by OpenCode's plugin loader).
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

			const pluginFilePath = join(
				dirname(configPath),
				"plugins",
				pluginName,
				"index.ts",
			);
			const pluginRef = `file://${pluginFilePath}`;

			const plugins = config.plugin as string[];

			// Migrate old-style references (without file://) to new format
			const oldIndex = plugins.findIndex(
				(p) =>
					String(p).includes(pluginName) && !String(p).startsWith("file://"),
			);
			if (oldIndex >= 0) {
				plugins[oldIndex] = pluginRef;
				await mkdir(dirname(configPath), { recursive: true });
				await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
				return true;
			}

			// Check if already registered with file:// URL
			if (plugins.some((p) => String(p).includes(pluginName))) {
				return false;
			}

			plugins.push(pluginRef);
			await mkdir(dirname(configPath), { recursive: true });
			await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
			return true;
		},
		(e) => configError(`Failed to register plugin: ${e}`),
	);

/**
 * Get the default OpenCode config directory.
 */
export const getConfigDir = (
	paths: InstallPathContext = resolveInstallPathContext(),
): string => paths.openCodeConfigDir;

/**
 * Get the default OpenCode config file path.
 */
export const getConfigPath = (
	paths: InstallPathContext = resolveInstallPathContext(),
): string => paths.openCodeConfigPath;
