/**
 * Settings loader for transform-args module.
 * Reads and parses TOML settings files from global and local paths.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { SettingsFile } from "./models.js";

/**
 * Global settings file path: ~/.config/rp1/settings.toml
 */
export const resolveGlobalSettingsPath = (): string =>
	join(homedir(), ".config", "rp1", "settings.toml");

/**
 * Local settings file path: .rp1/settings.toml relative to cwd
 */
export const resolveLocalSettingsPath = (cwd: string = process.cwd()): string =>
	join(cwd, ".rp1", "settings.toml");

/**
 * Empty settings file for missing/invalid files.
 */
export const emptySettingsFile = (): SettingsFile => ({});

/**
 * Load a single settings file from the given path.
 *
 * Algorithm:
 * 1. Check file existence with Bun.file().exists()
 * 2. If missing: return empty settings (no error)
 * 3. If exists: read and parse TOML
 * 4. If parse error: warn to stderr, return empty settings
 *
 * @param filePath - Absolute path to settings file
 * @returns TaskEither that always succeeds with SettingsFile
 */
export const loadSettingsFile = (
	filePath: string,
): TE.TaskEither<never, SettingsFile> =>
	TE.tryCatch(
		async () => {
			const file = Bun.file(filePath);
			const exists = await file.exists();

			if (!exists) {
				return emptySettingsFile();
			}

			const content = await file.text();

			try {
				const parsed = Bun.TOML.parse(content) as SettingsFile;
				return parsed;
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				console.error(
					`Warning: Invalid TOML in ${filePath}: ${message}. Using empty settings.`,
				);
				return emptySettingsFile();
			}
		},
		() => emptySettingsFile(),
	) as TE.TaskEither<never, SettingsFile>;

/**
 * Result of loading both global and local settings files.
 */
export interface LoadedSettings {
	readonly global: SettingsFile;
	readonly local: SettingsFile;
	readonly globalPath: string;
	readonly localPath: string;
}

/**
 * Load both global and local settings files.
 *
 * This function reads settings from:
 * - Global: ~/.config/rp1/settings.toml
 * - Local: .rp1/settings.toml (relative to cwd)
 *
 * Missing files are treated as empty settings (no error).
 * Invalid TOML files emit a warning to stderr and return empty settings.
 *
 * @param cwd - Current working directory for local settings resolution
 * @returns TaskEither that always succeeds with LoadedSettings
 */
export const loadSettings = (
	cwd: string = process.cwd(),
): TE.TaskEither<never, LoadedSettings> => {
	const globalPath = resolveGlobalSettingsPath();
	const localPath = resolveLocalSettingsPath(cwd);

	return TE.tryCatch(
		async () => {
			const [globalResult, localResult] = await Promise.all([
				loadSettingsFile(globalPath)(),
				loadSettingsFile(localPath)(),
			]);

			const globalSettings =
				"right" in globalResult ? globalResult.right : emptySettingsFile();
			const localSettings =
				"right" in localResult ? localResult.right : emptySettingsFile();

			return {
				global: globalSettings,
				local: localSettings,
				globalPath,
				localPath,
			};
		},
		() => ({
			global: emptySettingsFile(),
			local: emptySettingsFile(),
			globalPath,
			localPath,
		}),
	) as TE.TaskEither<never, LoadedSettings>;
};

/**
 * Load a single settings file synchronously for validation purposes.
 * Returns the parsed settings or an error with details.
 *
 * @param filePath - Absolute path to settings file
 * @returns Object with exists, valid, parsed content, and any error
 */
export const loadSettingsFileForValidation = async (
	filePath: string,
): Promise<{
	exists: boolean;
	valid: boolean;
	content: SettingsFile | null;
	error?: string;
	line?: number;
}> => {
	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return { exists: false, valid: true, content: null };
	}

	const text = await file.text();

	try {
		const parsed = Bun.TOML.parse(text) as SettingsFile;
		return { exists: true, valid: true, content: parsed };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const lineMatch = message.match(/line (\d+)/i);
		const line = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;
		return { exists: true, valid: false, content: null, error: message, line };
	}
};
