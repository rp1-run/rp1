/**
 * Settings merger for transform-args module.
 * Merges global, local, and CLI settings with proper precedence and source tracking.
 */

import type { MergedSettings, SettingsFile, SettingsSource } from "./models.js";

/**
 * CLI arguments extracted for merging with settings.
 */
export interface CLIArguments {
	readonly [key: string]: unknown;
}

/**
 * Input for the merge operation.
 */
export interface MergeInput {
	readonly globalSettings: SettingsFile;
	readonly localSettings: SettingsFile;
	readonly cliArguments: CLIArguments;
}

/**
 * Extract all settings from a settings file.
 *
 * All settings are treated as global. The file structure is flat key-value pairs
 * at the root level. The [global] section name is reserved for backwards compatibility
 * but its contents are merged with root-level settings.
 *
 * @param settings - Parsed settings file
 * @returns All settings from the file
 */
export const extractSettings = (
	settings: SettingsFile,
): Record<string, unknown> => {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(settings)) {
		if (key === "schema_version" || key === "global" || value === undefined) {
			continue;
		}
		if (typeof value === "object" && value !== null) {
			continue;
		}
		result[key] = value;
	}

	const globalSection = settings.global;
	if (globalSection && typeof globalSection === "object") {
		Object.assign(result, globalSection);
	}

	return result;
};

/**
 * Merge settings with precedence: CLI > local > global.
 *
 * Algorithm:
 * 1. Start with global settings file
 * 2. Layer local settings (override global)
 * 3. Layer CLI arguments (override all)
 * 4. Track source for each value
 *
 * @param input - Merge input containing all settings sources
 * @returns MergedSettings with values and source tracking
 */
export const mergeSettings = (input: MergeInput): MergedSettings => {
	const { globalSettings, localSettings, cliArguments } = input;

	const values: Record<string, unknown> = {};
	const source: Record<string, SettingsSource> = {};

	const globalExtractedSettings = extractSettings(globalSettings);
	for (const [key, value] of Object.entries(globalExtractedSettings)) {
		values[key] = value;
		source[key] = "global";
	}

	const localExtractedSettings = extractSettings(localSettings);
	for (const [key, value] of Object.entries(localExtractedSettings)) {
		values[key] = value;
		source[key] = "local";
	}

	for (const [key, value] of Object.entries(cliArguments)) {
		if (value !== undefined) {
			values[key] = value;
			source[key] = "cli";
		}
	}

	return { values, source };
};

/**
 * Get a setting value with its source.
 *
 * @param merged - Merged settings
 * @param key - Setting key
 * @returns Tuple of [value, source] or [undefined, 'default'] if not found
 */
export const getSettingWithSource = (
	merged: MergedSettings,
	key: string,
): [unknown, SettingsSource] => {
	if (key in merged.values) {
		return [merged.values[key], merged.source[key]];
	}
	return [undefined, "default"];
};

/**
 * Get a string setting with default value.
 *
 * @param merged - Merged settings
 * @param key - Setting key
 * @param defaultValue - Default value if not found
 * @returns String value
 */
export const getStringSetting = (
	merged: MergedSettings,
	key: string,
	defaultValue: string,
): string => {
	const value = merged.values[key];
	if (typeof value === "string") {
		return value;
	}
	return defaultValue;
};

/**
 * Get a boolean setting with default value.
 *
 * @param merged - Merged settings
 * @param key - Setting key
 * @param defaultValue - Default value if not found
 * @returns Boolean value
 */
export const getBooleanSetting = (
	merged: MergedSettings,
	key: string,
	defaultValue: boolean,
): boolean => {
	const value = merged.values[key];
	if (typeof value === "boolean") {
		return value;
	}
	// Handle string "true"/"false" from CLI arguments
	if (typeof value === "string") {
		if (value.toLowerCase() === "true") return true;
		if (value.toLowerCase() === "false") return false;
	}
	return defaultValue;
};

/**
 * Create an empty merged settings object.
 */
export const emptyMergedSettings = (): MergedSettings => ({
	values: {},
	source: {},
});

/**
 * Merge only global and local settings (no CLI arguments).
 *
 * Useful for getting base settings before CLI parsing.
 *
 * @param globalSettings - Global settings file
 * @param localSettings - Local settings file
 * @returns MergedSettings from global and local only
 */
export const mergeSettingsWithoutCLI = (
	globalSettings: SettingsFile,
	localSettings: SettingsFile,
): MergedSettings =>
	mergeSettings({
		globalSettings,
		localSettings,
		cliArguments: {},
	});
