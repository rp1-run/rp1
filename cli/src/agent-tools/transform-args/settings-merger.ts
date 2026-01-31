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
	readonly namespace: string;
}

/**
 * Extract namespace-specific settings from a settings file.
 *
 * Algorithm:
 * 1. Start with [global] section if present
 * 2. Merge [namespace] section on top if present
 *
 * @param settings - Parsed settings file
 * @param namespace - Namespace to extract
 * @returns Merged settings for the namespace
 */
export const extractNamespaceSettings = (
	settings: SettingsFile,
	namespace: string,
): Record<string, unknown> => {
	const result: Record<string, unknown> = {};

	// First, apply [global] section
	const globalSection = settings.global;
	if (globalSection && typeof globalSection === "object") {
		Object.assign(result, globalSection);
	}

	// Then, apply [namespace] section (overrides global)
	if (namespace !== "global") {
		const namespaceSection = settings[namespace];
		if (namespaceSection && typeof namespaceSection === "object") {
			Object.assign(result, namespaceSection as Record<string, unknown>);
		}
	}

	return result;
};

/**
 * Merge settings with precedence: CLI > local > global.
 *
 * Algorithm:
 * 1. Start with global settings for namespace (merge [global] then [namespace])
 * 2. Layer local settings (override global)
 * 3. Layer CLI arguments (override all)
 * 4. Track source for each value
 *
 * @param input - Merge input containing all settings sources
 * @returns MergedSettings with values and source tracking
 */
export const mergeSettings = (input: MergeInput): MergedSettings => {
	const { globalSettings, localSettings, cliArguments, namespace } = input;

	const values: Record<string, unknown> = {};
	const source: Record<string, SettingsSource> = {};

	// Step 1: Apply global settings for namespace
	const globalNamespaceSettings = extractNamespaceSettings(
		globalSettings,
		namespace,
	);
	for (const [key, value] of Object.entries(globalNamespaceSettings)) {
		values[key] = value;
		source[key] = "global";
	}

	// Step 2: Apply local settings (override global)
	const localNamespaceSettings = extractNamespaceSettings(
		localSettings,
		namespace,
	);
	for (const [key, value] of Object.entries(localNamespaceSettings)) {
		values[key] = value;
		source[key] = "local";
	}

	// Step 3: Apply CLI arguments (override all)
	for (const [key, value] of Object.entries(cliArguments)) {
		// Skip undefined values from CLI - they weren't actually provided
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
 * @param namespace - Namespace to extract
 * @returns MergedSettings from global and local only
 */
export const mergeSettingsWithoutCLI = (
	globalSettings: SettingsFile,
	localSettings: SettingsFile,
	namespace: string,
): MergedSettings =>
	mergeSettings({
		globalSettings,
		localSettings,
		cliArguments: {},
		namespace,
	});
